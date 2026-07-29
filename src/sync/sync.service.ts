import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataType, Prisma, TaskStatus } from '@prisma/client';
import { addDays, formatDateOnly, parseDateOnly } from '../common/date-utils';
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

  async appBootstrap(userId: string) {
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const pastDays = this.config.get<number>('OFFLINE_BOOTSTRAP_PAST_DAYS', 90);
    const futureDays = this.config.get<number>('OFFLINE_BOOTSTRAP_FUTURE_DAYS', 30);
    const [user, goals, subscription, snapshots, reviews, latest] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true, preferences: true, privacySettings: true } }),
      this.prisma.goal.findMany({
        where: { userId, deletedAt: null },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        include: {
          tracks: { where: { deletedAt: null } },
          tasks: {
            where: {
              deletedAt: null,
              scheduledDate: { gte: addDays(today, -pastDays), lte: addDays(today, futureDays) },
            },
          },
          roadmapVersions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: { milestones: { orderBy: { sortOrder: 'asc' } } },
          },
          probabilities: { orderBy: { calculatedAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.subscription.upsert({
        where: { userId },
        update: {},
        create: { userId, tier: 'free', status: 'active' },
      }),
      this.prisma.analyticsSnapshot.findMany({
        where: { userId, periodStart: { gte: addDays(today, -pastDays), lte: addDays(today, futureDays) } },
        orderBy: { periodStart: 'asc' },
      }),
      this.prisma.reviewDaily.findMany({
        where: { userId, reviewDate: { gte: addDays(today, -pastDays), lte: today } },
        orderBy: { reviewDate: 'desc' },
      }),
      this.latestRevision(userId),
    ]);

    const clientGoals = goals.map((goal) => this.toClientGoal(goal));
    return this.serialize({
      profile: this.toClientProfile(user),
      goal: clientGoals[0] ?? null,
      goals: clientGoals,
      tracks: goals.flatMap((goal) => goal.tracks.map((track) => this.toClientTrack(track))),
      roadmap: goals.flatMap((goal) =>
        goal.roadmapVersions[0]?.milestones.map((milestone, index) => this.toClientRoadmapItem(goal.id, milestone, index)) ?? [],
      ),
      tasks: goals.flatMap((goal) => goal.tasks.map((task) => this.toClientTask(task))),
      reviews: reviews.map((review) => this.toClientReview(review)),
      snapshots: snapshots.map((snapshot) => this.toClientSnapshot(snapshot)),
      subscription: this.toClientSubscription(subscription),
      syncRevision: latest,
    });
  }

  async changes(userId: string, sinceRevision: bigint) {
    const changes = await this.prisma.syncChangeLog.findMany({
      where: { userId, revision: { gt: sinceRevision } },
      orderBy: { revision: 'asc' },
      take: 500,
    });
    const latestRevision = await this.latestRevision(userId);
    return this.serialize({
      changes: changes.map((change) => ({
        revision: change.revision,
        entityType: change.entityType,
        entityId: change.entityId,
        action: change.action,
        payload: change.payloadJson,
        createdAt: change.createdAt,
      })),
      latestRevision,
      latest_revision: latestRevision,
      hasMore: changes.length === 500 && changes[changes.length - 1]?.revision < latestRevision,
    });
  }

  async push(userId: string, dto: SyncPushDto) {
    const max = this.config.get<number>('MAX_SYNC_ACTIONS_PER_PUSH', 100);
    if (dto.actions.length > max) throw new BadRequestException(`At most ${max} actions can be pushed at once.`);
    const results = [];
    for (const action of dto.actions) {
      results.push(await this.applyAction(userId, this.normalizeAction(action)));
    }
    if (dto.deviceId) {
      await this.prisma.syncState.upsert({
        where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
        update: { lastPushedAt: new Date(), diagnosticsJson: { lastPushCount: dto.actions.length } },
        create: { userId, deviceId: dto.deviceId, lastPushedAt: new Date(), diagnosticsJson: { lastPushCount: dto.actions.length } },
      });
    }
    const acceptedActionIds = results
      .filter((result) => result.status === 'accepted' || result.status === 'duplicate')
      .map((result) => result.clientActionId);
    const rejectedActionIds = results.filter((result) => result.status === 'rejected').map((result) => result.clientActionId);
    const duplicateActionIds = results.filter((result) => result.status === 'duplicate').map((result) => result.clientActionId);
    const latestRevision = await this.latestRevision(userId);
    return this.serialize({
      acceptedActionIds,
      rejectedActionIds,
      duplicateActionIds,
      partialAcceptActionIds: [],
      results,
      latestRevision,
      latest_revision: latestRevision,
    });
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
    if (existing?.status === 'accepted') return { clientActionId: action.clientActionId, status: 'duplicate', result: existing.resultJson };
    try {
      const result = await this.dispatch(userId, action);
      try {
        if (existing) {
          await this.prisma.clientActionLog.update({
            where: { userId_clientActionId: { userId, clientActionId: action.clientActionId } },
            data: {
              actionType: action.actionType ?? 'unknown',
              status: 'accepted',
              reason: null,
              resultJson: result as Prisma.InputJsonValue,
            },
          });
        } else {
          await this.prisma.clientActionLog.create({
            data: {
              userId,
              clientActionId: action.clientActionId,
              actionType: action.actionType ?? 'unknown',
              status: 'accepted',
              resultJson: result as Prisma.InputJsonValue,
            },
          });
        }
      } catch (error) {
        if (this.isClientActionUniqueConflict(error)) return this.duplicateActionResult(userId, action.clientActionId);
        throw error;
      }
      return { clientActionId: action.clientActionId, status: 'accepted', result };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown sync error';
      try {
        if (existing) {
          await this.prisma.clientActionLog.update({
            where: { userId_clientActionId: { userId, clientActionId: action.clientActionId } },
            data: { actionType: action.actionType ?? 'unknown', status: 'rejected', reason },
          });
        } else {
          await this.prisma.clientActionLog.create({
            data: { userId, clientActionId: action.clientActionId, actionType: action.actionType ?? 'unknown', status: 'rejected', reason },
          });
        }
      } catch (logError) {
        if (this.isClientActionUniqueConflict(logError)) return this.duplicateActionResult(userId, action.clientActionId);
        throw logError;
      }
      return { clientActionId: action.clientActionId, status: 'rejected', reason };
    }
  }

  private async duplicateActionResult(userId: string, clientActionId: string) {
    const existing = await this.prisma.clientActionLog.findUnique({
      where: { userId_clientActionId: { userId, clientActionId } },
    });
    return { clientActionId, status: 'duplicate', result: existing?.resultJson, reason: existing?.reason };
  }

  private isClientActionUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private dispatch(userId: string, action: SyncActionDto) {
    const payload = action.payload;
    if (!action.actionType) throw new BadRequestException('Sync action is missing actionType/type.');
    if (action.actionType === 'goal.create') {
      return this.goals.createGoal(userId, {
        id: payload.id ? String(payload.id) : undefined,
        title: String(payload.title),
        category: payload.category ? String(payload.category) : undefined,
        deadline: payload.deadline ? String(payload.deadline) : undefined,
        status: payload.status as never,
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
        id: payload.id ? String(payload.id) : undefined,
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
      if (!payload.trackId) throw new BadRequestException('Tasks must be linked to a focus area.');
      return this.tasks.create(userId, {
        id: payload.id ? String(payload.id) : undefined,
        goalId: String(payload.goalId),
        trackId: String(payload.trackId),
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

  private normalizeAction(action: SyncActionDto): SyncActionDto {
    const actionType = action.actionType ?? this.clientActionType(action.type);
    const payload = { ...action.payload };
    if (action.clientEventId && !payload.clientEventId) payload.clientEventId = action.clientEventId;
    if (action.type === 'past_day_marked_empty' && !payload.eventType) payload.eventType = 'day.mark_empty';
    if (action.type === 'past_day_marked_skipped' && !payload.eventType) payload.eventType = 'day.mark_skipped';
    if (action.type === 'past_note_added' && !payload.eventType) payload.eventType = 'day.note';
    if ((action.type === 'review_submitted' || action.type === 'past_review_added') && !payload.date) {
      payload.date = payload.periodStart ?? payload.reviewDate;
    }
    return { ...action, actionType, payload };
  }

  private clientActionType(type?: string) {
    const mapping: Record<string, string> = {
      task_started: 'task.start',
      task_completed: 'task.complete',
      task_skipped: 'task.skip',
      task_rescheduled: 'task.reschedule',
      goal_created: 'goal.create',
      track_created: 'track.create',
      task_created: 'task.create',
      task_updated: 'task.update',
      review_submitted: 'history.review.upsert',
      past_day_marked_empty: 'history.event.append',
      past_day_marked_skipped: 'history.event.append',
      past_note_added: 'history.event.append',
      past_review_added: 'history.review.upsert',
    };
    return type ? mapping[type] : undefined;
  }

  private toClientProfile(user: Prisma.UserGetPayload<{ include: { profile: true; preferences: true; privacySettings: true } }>) {
    return {
      id: user.id,
      displayName: user.displayName ?? user.email,
      timezone: user.profile?.timezone ?? 'UTC',
      onboardingComplete: user.profile?.onboardingCompleted ?? false,
      sensitiveGoalMode: user.privacySettings?.sensitiveGoalModeEnabled ?? false,
      syncStatus: 'synced',
      updatedAt: user.updatedAt,
    };
  }

  private toClientGoal(goal: Prisma.GoalGetPayload<{ include: { probabilities: true } }>) {
    return {
      id: goal.id,
      title: goal.title,
      deadline: goal.deadline ? formatDateOnly(goal.deadline) : '',
      weeklyAvailableMinutes: 0,
      privacyMode: 'standard',
      progressPercentage: Math.round(goal.overallProgress),
      probabilityPercentage: Math.round(goal.probabilities[0]?.probabilityPercentage ?? 50),
      syncStatus: 'synced',
      syncRevision: goal.syncRevision,
      updatedAt: goal.updatedAt,
    };
  }

  private toClientTrack(track: Prisma.GoalTrackGetPayload<object>) {
    return {
      id: track.id,
      goalId: track.goalId,
      name: track.name,
      progressPercentage: Math.round(track.progress),
      status: track.status === 'paused' ? 'paused' : track.progress < 50 ? 'needs_attention' : 'on_track',
      syncStatus: 'synced',
      syncRevision: track.syncRevision,
      updatedAt: track.updatedAt,
    };
  }

  private toClientRoadmapItem(goalId: string, milestone: Prisma.MilestoneGetPayload<object>, index: number) {
    return {
      id: milestone.id,
      goalId,
      title: milestone.title,
      targetDate: milestone.targetDate ? formatDateOnly(milestone.targetDate) : '',
      state: index === 0 ? 'active' : 'planned',
      note: typeof milestone.metadataJson === 'object' && milestone.metadataJson && 'note' in milestone.metadataJson ? String(milestone.metadataJson.note) : undefined,
      syncStatus: 'synced',
      updatedAt: new Date(),
    };
  }

  private toClientTask(task: Prisma.TaskGetPayload<object>) {
    return {
      id: task.id,
      goalId: task.goalId,
      trackId: task.trackId ?? undefined,
      title: task.title,
      plannedDate: task.scheduledDate ? formatDateOnly(task.scheduledDate) : '',
      estimatedMinutes: task.estimatedMinutes,
      status: this.toClientTaskStatus(task.status),
      syncStatus: 'synced',
      syncRevision: task.syncRevision,
      updatedAt: task.updatedAt,
    };
  }

  private toClientTaskStatus(status: TaskStatus) {
    const mapping: Record<TaskStatus, string> = {
      pending: 'planned',
      in_progress: 'started',
      completed: 'completed',
      skipped: 'skipped',
      missed: 'missed',
      rescheduled: 'planned',
      cancelled: 'skipped',
    };
    return mapping[status];
  }

  private toClientReview(review: Prisma.ReviewDailyGetPayload<object>) {
    return {
      id: review.id,
      goalId: review.goalId,
      period: 'daily',
      periodStart: formatDateOnly(review.reviewDate),
      mood: review.mood,
      note: review.notes ?? '',
      syncStatus: 'synced',
      updatedAt: review.updatedAt,
    };
  }

  private toClientSnapshot(snapshot: {
    id: string;
    periodType: string;
    periodStart: Date;
    periodEnd: Date;
    completionPercentage: number | null;
    probabilityPercentage: number | null;
    plannedTaskCount: number;
    completedTaskCount: number;
    skippedTaskCount: number;
    missedTaskCount: number;
    plannedMinutes: number;
    completedMinutes: number;
    dataType: DataType;
    syncRevision: bigint;
    calculatedAt: Date;
  }) {
    return {
      id: snapshot.id,
      period: snapshot.periodType,
      periodLabel: formatDateOnly(snapshot.periodStart),
      periodStart: formatDateOnly(snapshot.periodStart),
      periodEnd: formatDateOnly(snapshot.periodEnd),
      completionPercentage: snapshot.completionPercentage ?? 0,
      probabilityPercentage: snapshot.probabilityPercentage ?? 0,
      plannedTaskCount: snapshot.plannedTaskCount,
      completedTaskCount: snapshot.completedTaskCount,
      skippedTaskCount: snapshot.skippedTaskCount,
      missedTaskCount: snapshot.missedTaskCount,
      plannedMinutes: snapshot.plannedMinutes,
      completedMinutes: snapshot.completedMinutes,
      dataType: snapshot.dataType,
      syncStatus: 'synced',
      syncRevision: snapshot.syncRevision,
      updatedAt: snapshot.calculatedAt,
    };
  }

  private toClientSubscription(subscription: { userId: string; tier: string; status: string; currentPeriodEnd: Date | null; updatedAt: Date }) {
    return {
      userId: subscription.userId,
      plan: subscription.tier === 'premium' ? 'premium' : 'free',
      status: subscription.status,
      premiumUntil: subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : undefined,
      syncStatus: 'synced',
      updatedAt: subscription.updatedAt,
    };
  }
}
