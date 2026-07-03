import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { addDays, parseDateOnly } from '../common/date-utils';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { SyncActionDto, SyncPushDto } from './dto';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventsService,
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
