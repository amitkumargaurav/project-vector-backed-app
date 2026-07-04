import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { addDays, parseDateOnly } from '../common/date-utils';
import { EventsService } from '../events/events.service';
import { GoalsService } from '../goals/goals.service';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import { TasksService } from '../tasks/tasks.service';
import { SyncActionDto, SyncPushDto } from './dto';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventsService,
    private readonly goals: GoalsService,
    private readonly history: HistoryService,
    private readonly reviews: ReviewsService,
    private readonly tasks: TasksService,
  ) {}

  async bootstrap(userId: string) {
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const pastDays = this.config.get<number>('OFFLINE_BOOTSTRAP_PAST_DAYS', 90);
    const futureDays = this.config.get<number>('OFFLINE_BOOTSTRAP_FUTURE_DAYS', 30);
    const [user, goals, tasks, analytics, latest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, preferences: true, privacySettings: true } }),
      this.prisma.goal.findMany({ where: { userId, deletedAt: null }, include: { tracks: { where: { deletedAt: null } } } }),
      this.prisma.task.findMany({
        where: {
          goal: { userId },
          deletedAt: null,
          scheduledDate: { gte: addDays(today, -pastDays), lte: addDays(today, futureDays) },
        },
      }),
      this.prisma.analyticsSnapshot.findMany({
        where: { userId, periodStart: { gte: addDays(today, -pastDays), lte: addDays(today, futureDays) } },
      }),
      this.latestRevision(userId),
    ]);
    return this.serialize({ user, goals, tasks, analytics, sync_revision: latest });
  }

  async changes(userId: string, sinceRevision: bigint) {
    const changes = await this.prisma.syncChangeLog.findMany({
      where: { userId, revision: { gt: sinceRevision } },
      orderBy: { revision: 'asc' },
      take: 500,
    });
    return this.serialize({ changes, latest_revision: await this.latestRevision(userId) });
  }

  async push(userId: string, dto: SyncPushDto) {
    const max = this.config.get<number>('MAX_SYNC_ACTIONS_PER_PUSH', 100);
    if (dto.actions.length > max) throw new BadRequestException(`At most ${max} actions can be pushed at once.`);
    const results = [];
    for (const action of dto.actions) {
      results.push(await this.applyAction(userId, action));
    }
    if (dto.deviceId) {
      await this.prisma.syncState.upsert({
        where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
        update: { lastPushedAt: new Date(), diagnosticsJson: { lastPushCount: dto.actions.length } },
        create: { userId, deviceId: dto.deviceId, lastPushedAt: new Date(), diagnosticsJson: { lastPushCount: dto.actions.length } },
      });
    }
    return this.serialize({ results, latest_revision: await this.latestRevision(userId) });
  }

  async status(userId: string) {
    const [latestRevision, pendingFailures] = await Promise.all([
      this.latestRevision(userId),
      this.prisma.clientActionLog.count({ where: { userId, status: 'rejected' } }),
    ]);
    return this.serialize({ latest_revision: latestRevision, rejected_action_count: pendingFailures });
  }

  private async applyAction(userId: string, action: SyncActionDto) {
    const existing = await this.prisma.clientActionLog.findUnique({
      where: { userId_clientActionId: { userId, clientActionId: action.clientActionId } },
    });
    if (existing) return { clientActionId: action.clientActionId, status: 'duplicate', result: existing.resultJson };
    try {
      const result = await this.dispatch(userId, action);
      await this.prisma.clientActionLog.create({
        data: {
          userId,
          clientActionId: action.clientActionId,
          actionType: action.actionType,
          status: 'accepted',
          resultJson: result as Prisma.InputJsonValue,
        },
      });
      return { clientActionId: action.clientActionId, status: 'accepted', result };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown sync error';
      await this.prisma.clientActionLog.create({
        data: { userId, clientActionId: action.clientActionId, actionType: action.actionType, status: 'rejected', reason },
      });
      return { clientActionId: action.clientActionId, status: 'rejected', reason };
    }
  }

  private dispatch(userId: string, action: SyncActionDto) {
    const payload = action.payload;
    if (action.actionType === 'goal.create') {
      return this.goals.createGoal(userId, {
        title: String(payload.title),
        category: payload.category ? String(payload.category) : undefined,
        deadline: payload.deadline ? String(payload.deadline) : undefined,
      });
    }
    if (action.actionType === 'goal.update') {
      return this.goals.updateGoal(userId, String(payload.goalId), {
        title: payload.title ? String(payload.title) : undefined,
        category: payload.category ? String(payload.category) : undefined,
        deadline: payload.deadline ? String(payload.deadline) : undefined,
        status: payload.status as never,
      });
    }
    if (action.actionType === 'goal.status') {
      return this.goals.setGoalStatus(userId, String(payload.goalId), payload.status as never);
    }
    if (action.actionType === 'goal.delete') {
      return this.goals.deleteGoal(userId, String(payload.goalId));
    }
    if (action.actionType === 'track.create') {
      return this.goals.createTrack(userId, String(payload.goalId), {
        name: String(payload.name),
        type: payload.type ? String(payload.type) : undefined,
        targetDate: payload.targetDate ? String(payload.targetDate) : undefined,
        progressWeight: payload.progressWeight === undefined ? undefined : Number(payload.progressWeight),
      });
    }
    if (action.actionType === 'track.update') {
      return this.goals.updateTrack(userId, String(payload.trackId), {
        name: payload.name ? String(payload.name) : undefined,
        type: payload.type ? String(payload.type) : undefined,
        targetDate: payload.targetDate ? String(payload.targetDate) : undefined,
        progressWeight: payload.progressWeight === undefined ? undefined : Number(payload.progressWeight),
        status: payload.status as never,
      });
    }
    if (action.actionType === 'track.status') {
      return this.goals.setTrackStatus(userId, String(payload.trackId), payload.status as never);
    }
    if (action.actionType === 'track.delete') {
      return this.goals.deleteTrack(userId, String(payload.trackId));
    }
    if (action.actionType === 'task.create') {
      return this.tasks.create(userId, {
        goalId: String(payload.goalId),
        trackId: payload.trackId ? String(payload.trackId) : undefined,
        title: String(payload.title),
        description: payload.description ? String(payload.description) : undefined,
        taskType: payload.taskType ? String(payload.taskType) : undefined,
        estimatedMinutes: payload.estimatedMinutes === undefined ? undefined : Number(payload.estimatedMinutes),
        scheduledDate: payload.scheduledDate ? String(payload.scheduledDate) : undefined,
        scheduledStartTime: payload.scheduledStartTime ? String(payload.scheduledStartTime) : undefined,
        priority: payload.priority as never,
        difficulty: payload.difficulty as never,
        deadlineType: payload.deadlineType as never,
        dependsOnTaskIds: Array.isArray(payload.dependsOnTaskIds) ? payload.dependsOnTaskIds.map(String) : undefined,
        parentTaskId: payload.parentTaskId ? String(payload.parentTaskId) : undefined,
        clientActionId: action.clientActionId,
      });
    }
    if (action.actionType === 'task.update') {
      return this.tasks.update(userId, String(payload.taskId), {
        trackId: payload.trackId ? String(payload.trackId) : undefined,
        title: payload.title ? String(payload.title) : undefined,
        description: payload.description ? String(payload.description) : undefined,
        taskType: payload.taskType ? String(payload.taskType) : undefined,
        estimatedMinutes: payload.estimatedMinutes === undefined ? undefined : Number(payload.estimatedMinutes),
        scheduledDate: payload.scheduledDate ? String(payload.scheduledDate) : undefined,
        scheduledStartTime: payload.scheduledStartTime ? String(payload.scheduledStartTime) : undefined,
        priority: payload.priority as never,
        difficulty: payload.difficulty as never,
        deadlineType: payload.deadlineType as never,
        status: payload.status as never,
      });
    }
    if (action.actionType === 'event.create') {
      return this.events.create(userId, {
        eventType: String(payload.eventType),
        eventDate: String(payload.eventDate),
        goalId: payload.goalId ? String(payload.goalId) : undefined,
        trackId: payload.trackId ? String(payload.trackId) : undefined,
        taskId: payload.taskId ? String(payload.taskId) : undefined,
        clientEventId: payload.clientEventId ? String(payload.clientEventId) : undefined,
        clientActionId: action.clientActionId,
        payloadJson: (payload.payloadJson as Record<string, unknown>) ?? {},
      });
    }
    if (action.actionType === 'history.event.append') {
      return this.history.appendDayEvent(userId, String(payload.date), String(payload.eventType), (payload.payloadJson as Record<string, unknown>) ?? {});
    }
    if (action.actionType === 'history.review.upsert') {
      return this.history.review(userId, String(payload.date), {
        mood: payload.mood ? String(payload.mood) : undefined,
        answersJson: (payload.answersJson as Record<string, unknown>) ?? {},
      });
    }
    if (action.actionType === 'review.daily.upsert') {
      return this.reviews.upsertDaily(userId, payload);
    }
    if (action.actionType === 'review.weekly.upsert') {
      return this.reviews.upsertWeekly(userId, payload);
    }
    if (action.actionType === 'review.monthly.upsert') {
      return this.reviews.upsertMonthly(userId, payload);
    }
    if (['task.start', 'task.complete', 'task.skip', 'task.undo'].includes(action.actionType)) {
      const taskId = String(payload.taskId);
      const taskAction = action.actionType.split('.')[1] as 'start' | 'complete' | 'skip' | 'undo';
      return this.tasks.action(userId, taskId, taskAction, {});
    }
    if (action.actionType === 'task.reschedule') {
      return this.tasks.reschedule(userId, String(payload.taskId), {
        scheduledDate: String(payload.scheduledDate),
        scheduledStartTime: payload.scheduledStartTime ? String(payload.scheduledStartTime) : undefined,
      });
    }
    throw new BadRequestException(`Unsupported sync action type: ${action.actionType}`);
  }

  private async latestRevision(userId: string) {
    const latest = await this.prisma.syncChangeLog.findFirst({ where: { userId }, orderBy: { revision: 'desc' } });
    return latest?.revision ?? 0n;
  }

  private serialize(value: unknown) {
    return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)));
  }
}
