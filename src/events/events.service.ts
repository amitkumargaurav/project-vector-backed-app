import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SyncRevisionService } from '../common/sync-revision.service';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalsService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async create(userId: string, dto: CreateEventDto) {
    await this.assertReferences(userId, dto);
    if (dto.clientEventId) {
      const existing = await this.prisma.progressEvent.findUnique({
        where: { userId_clientEventId: { userId, clientEventId: dto.clientEventId } },
      });
      if (existing) return existing;
    }
    const event = await this.prisma.progressEvent.create({
      data: {
        userId,
        goalId: dto.goalId,
        trackId: dto.trackId,
        taskId: dto.taskId,
        eventType: dto.eventType,
        eventDate: new Date(dto.eventDate),
        clientEventId: dto.clientEventId,
        clientActionId: dto.clientActionId,
        payloadJson: (dto.payloadJson ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.revisions.record(userId, 'progress_event', event.id, 'create', event as unknown as Prisma.InputJsonValue);
    return event;
  }

  async batch(userId: string, events: CreateEventDto[]) {
    const results = [];
    for (const event of events) {
      results.push(await this.create(userId, event));
    }
    return { accepted: results.length, events: results };
  }

  private async assertReferences(userId: string, dto: CreateEventDto) {
    if (dto.goalId) await this.goals.assertGoalOwner(userId, dto.goalId);
    if (dto.trackId) await this.goals.assertTrackOwner(userId, dto.trackId);
    if (dto.taskId) {
      const task = await this.prisma.task.findUnique({ where: { id: dto.taskId }, include: { goal: true } });
      if (!task || task.goal.userId !== userId) throw new ForbiddenException('Task does not belong to the current user.');
    }
  }
}
