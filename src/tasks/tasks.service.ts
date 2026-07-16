import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { endOfDate, formatDateOnly, parseDateOnly } from '../common/date-utils';
import { SyncRevisionService } from '../common/sync-revision.service';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerService } from '../worker/worker.service';
import { CreateTaskDto, RescheduleTaskDto, TaskActionDto, UpdateTaskDto } from './dto';

type TaskAction = 'start' | 'complete' | 'skip' | 'undo';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalsService,
    private readonly revisions: SyncRevisionService,
    private readonly worker: WorkerService,
  ) {}

  list(userId: string) {
    return this.prisma.task.findMany({
      where: { goal: { userId }, deletedAt: null },
      include: { dependencies: true },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  listByDate(userId: string, date: string) {
    const day = parseDateOnly(date);
    return this.prisma.task.findMany({
      where: { goal: { userId }, deletedAt: null, scheduledDate: { gte: day, lte: endOfDate(day) } },
      include: { dependencies: true },
      orderBy: [{ scheduledStartTime: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateTaskDto) {
    await this.goals.assertGoalOwner(userId, dto.goalId);
    if (dto.id) {
      const existing = await this.prisma.task.findUnique({ where: { id: dto.id }, include: { dependencies: true } });
      if (existing) {
        if (existing.goalId !== dto.goalId) throw new BadRequestException('Task id already exists for a different goal.');
        await this.assertTaskOwner(userId, existing.id);
        return existing;
      }
    }
    if (dto.trackId) {
      const track = await this.goals.assertTrackOwner(userId, dto.trackId);
      if (track.goalId !== dto.goalId) throw new BadRequestException('Track must belong to the selected goal.');
    }
    if (dto.parentTaskId) await this.assertRelatedTask(userId, dto.goalId, dto.parentTaskId, 'Parent task');
    await this.assertValidDependencies(userId, dto.goalId, dto.dependsOnTaskIds ?? []);
    const task = await this.prisma.task.create({
      data: {
        id: dto.id,
        goalId: dto.goalId,
        trackId: dto.trackId,
        title: dto.title,
        description: dto.description,
        taskType: dto.taskType ?? 'study',
        estimatedMinutes: dto.estimatedMinutes ?? 0,
        scheduledDate: dto.scheduledDate ? parseDateOnly(dto.scheduledDate) : undefined,
        scheduledStartTime: dto.scheduledStartTime,
        priority: dto.priority ?? 'medium',
        difficulty: dto.difficulty ?? 'medium',
        deadlineType: dto.deadlineType ?? 'flexible',
        parentTaskId: dto.parentTaskId,
        clientActionId: dto.clientActionId,
        dependencies: dto.dependsOnTaskIds?.length
          ? { create: dto.dependsOnTaskIds.map((dependsOnTaskId) => ({ dependsOnTaskId })) }
          : undefined,
      },
      include: { dependencies: true },
    });
    await this.revisions.record(userId, 'task', task.id, 'create', task as unknown as Prisma.InputJsonValue);
    return task;
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const task = await this.assertTaskOwner(userId, taskId);
    if (task.scheduledDate && task.scheduledDate < parseDateOnly(new Date().toISOString().slice(0, 10))) {
      throw new BadRequestException('Past tasks are append-only. Add a note, review, or late offline event instead.');
    }
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        trackId: dto.trackId,
        title: dto.title,
        description: dto.description,
        taskType: dto.taskType,
        estimatedMinutes: dto.estimatedMinutes,
        scheduledDate: dto.scheduledDate ? parseDateOnly(dto.scheduledDate) : undefined,
        scheduledStartTime: dto.scheduledStartTime,
        priority: dto.priority,
        difficulty: dto.difficulty,
        deadlineType: dto.deadlineType,
        status: dto.status,
      },
    });
    await this.revisions.record(userId, 'task', updated.id, 'update', updated as unknown as Prisma.InputJsonValue);
    return updated;
  }

  async action(userId: string, taskId: string, action: TaskAction, dto: TaskActionDto) {
    const task = await this.assertTaskOwner(userId, taskId);
    const duplicate = dto.clientActionId
      ? await this.prisma.clientActionLog.findUnique({ where: { userId_clientActionId: { userId, clientActionId: dto.clientActionId } } })
      : null;
    if (duplicate) return duplicate.resultJson;

    const now = new Date();
    const data = this.actionData(action, now);
    const updated = await this.prisma.task.update({ where: { id: taskId }, data });
    const event = await this.prisma.progressEvent.create({
      data: {
        userId,
        goalId: task.goalId,
        trackId: task.trackId,
        taskId,
        eventType: `task.${action}`,
        eventDate: now,
        clientActionId: dto.clientActionId,
        payloadJson: { note: dto.note ?? null },
      },
    });
    await this.revisions.record(userId, 'task', updated.id, action, updated as unknown as Prisma.InputJsonValue);
    await this.revisions.record(userId, 'progress_event', event.id, 'create', event as unknown as Prisma.InputJsonValue);
    await this.worker.enqueueSnapshotRecalculation(userId, formatDateOnly(event.eventDate), formatDateOnly(event.eventDate));
    await this.worker.enqueueProbabilityUpdate(userId, task.goalId);
    if (dto.clientActionId) {
      await this.prisma.clientActionLog.create({
        data: {
          userId,
          clientActionId: dto.clientActionId,
          actionType: `task.${action}`,
          status: 'accepted',
          resultJson: updated as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return updated;
  }

  async reschedule(userId: string, taskId: string, dto: RescheduleTaskDto) {
    const task = await this.assertTaskOwner(userId, taskId);
    if (task.deadlineType === 'fixed') {
      throw new BadRequestException('Fixed-deadline tasks cannot be casually rescheduled.');
    }
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { scheduledDate: parseDateOnly(dto.scheduledDate), scheduledStartTime: dto.scheduledStartTime, status: 'rescheduled' },
    });
    await this.revisions.record(userId, 'task', updated.id, 'reschedule', updated as unknown as Prisma.InputJsonValue);
    return updated;
  }

  async markMissed(userId: string, taskId: string) {
    const task = await this.assertTaskOwner(userId, taskId);
    const updated = await this.prisma.task.update({ where: { id: task.id }, data: { status: 'missed', missedAt: new Date() } });
    await this.revisions.record(userId, 'task', updated.id, 'missed', updated as unknown as Prisma.InputJsonValue);
    return updated;
  }

  async assertTaskOwner(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { goal: true } });
    if (!task || task.deletedAt) throw new NotFoundException('Task not found.');
    if (task.goal.userId !== userId) throw new ForbiddenException('Task does not belong to the current user.');
    return task;
  }

  private async assertRelatedTask(userId: string, goalId: string, taskId: string, label: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { goal: true } });
    if (!task || task.deletedAt) throw new BadRequestException(`${label} does not exist.`);
    if (task.goal.userId !== userId || task.goalId !== goalId) throw new BadRequestException(`${label} must belong to the same goal.`);
    if (task.status === 'cancelled') throw new BadRequestException(`${label} cannot be cancelled.`);
    return task;
  }

  private async assertValidDependencies(userId: string, goalId: string, dependsOnTaskIds: string[]) {
    const uniqueIds = [...new Set(dependsOnTaskIds)];
    if (uniqueIds.length !== dependsOnTaskIds.length) throw new BadRequestException('Duplicate task dependencies are not allowed.');
    for (const dependsOnTaskId of uniqueIds) {
      await this.assertRelatedTask(userId, goalId, dependsOnTaskId, 'Dependency task');
    }
  }

  private actionData(action: TaskAction, now: Date): Prisma.TaskUpdateInput {
    const map: Record<TaskAction, Prisma.TaskUpdateInput> = {
      start: { status: 'in_progress', startedAt: now },
      complete: { status: 'completed', completedAt: now },
      skip: { status: 'skipped', skippedAt: now },
      undo: { status: 'pending', startedAt: null, completedAt: null, skippedAt: null, missedAt: null },
    };
    return map[action];
  }
}
