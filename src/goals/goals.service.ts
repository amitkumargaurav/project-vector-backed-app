import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus, Prisma, TrackStatus } from '@prisma/client';
import { SyncRevisionService } from '../common/sync-revision.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto, CreateTrackDto, UpdateGoalDto, UpdateTrackDto } from './dto';

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async createGoal(userId: string, dto: CreateGoalDto) {
    const goal = await this.prisma.goal.create({
      data: {
        id: dto.id,
        userId,
        title: dto.title,
        category: dto.category,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        status: dto.status,
        activeSince: dto.status === 'active' ? new Date() : undefined,
      },
      include: { tracks: true },
    });
    await this.revisions.record(userId, 'goal', goal.id, 'create', goal as unknown as Prisma.InputJsonValue);
    return goal;
  }

  listGoals(userId: string) {
    return this.prisma.goal.findMany({
      where: { userId, deletedAt: null },
      include: { tracks: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGoal(userId: string, goalId: string) {
    await this.assertGoalOwner(userId, goalId);
    return this.prisma.goal.findUnique({
      where: { id: goalId },
      include: { tracks: { where: { deletedAt: null } }, tasks: { where: { deletedAt: null } } },
    });
  }

  async updateGoal(userId: string, goalId: string, dto: UpdateGoalDto) {
    await this.assertGoalOwner(userId, goalId);
    const goal = await this.prisma.goal.update({
      where: { id: goalId },
      data: {
        title: dto.title,
        category: dto.category,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        status: dto.status,
      },
    });
    await this.revisions.record(userId, 'goal', goal.id, 'update', goal as unknown as Prisma.InputJsonValue);
    return goal;
  }

  async setGoalStatus(userId: string, goalId: string, status: GoalStatus) {
    await this.assertGoalOwner(userId, goalId);
    const goal = await this.prisma.goal.update({
      where: { id: goalId },
      data: { status, activeSince: status === 'active' ? new Date() : undefined },
    });
    await this.revisions.record(userId, 'goal', goal.id, status, goal as unknown as Prisma.InputJsonValue);
    return goal;
  }

  async deleteGoal(userId: string, goalId: string) {
    await this.assertGoalOwner(userId, goalId);
    const goal = await this.prisma.goal.update({ where: { id: goalId }, data: { deletedAt: new Date(), status: 'archived' } });
    await this.revisions.record(userId, 'goal', goal.id, 'delete', { id: goal.id });
    return goal;
  }

  async createTrack(userId: string, goalId: string, dto: CreateTrackDto) {
    await this.assertGoalOwner(userId, goalId);
    const progressWeight = dto.progressWeight ?? 1;
    await this.assertTrackWeightBudget(goalId, progressWeight);
    const track = await this.prisma.goalTrack.create({
      data: {
        id: dto.id,
        goalId,
        name: dto.name,
        type: dto.type,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        progressWeight,
      },
    });
    await this.revisions.record(userId, 'goal_track', track.id, 'create', track as unknown as Prisma.InputJsonValue);
    await this.recalculateGoalProgress(userId, goalId);
    return track;
  }

  async listTracks(userId: string, goalId: string) {
    await this.assertGoalOwner(userId, goalId);
    return this.prisma.goalTrack.findMany({ where: { goalId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  }

  async getTrack(userId: string, trackId: string) {
    await this.assertTrackOwner(userId, trackId);
    return this.prisma.goalTrack.findUnique({ where: { id: trackId }, include: { tasks: { where: { deletedAt: null } } } });
  }

  async updateTrack(userId: string, trackId: string, dto: UpdateTrackDto) {
    const existing = await this.assertTrackOwner(userId, trackId);
    if (dto.progressWeight !== undefined) await this.assertTrackWeightBudget(existing.goalId, dto.progressWeight, trackId);
    const track = await this.prisma.goalTrack.update({
      where: { id: trackId },
      data: {
        name: dto.name,
        type: dto.type,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        progressWeight: dto.progressWeight,
        status: dto.status,
      },
    });
    await this.revisions.record(userId, 'goal_track', track.id, 'update', track as unknown as Prisma.InputJsonValue);
    await this.recalculateGoalProgress(userId, existing.goalId);
    return track;
  }

  async setTrackStatus(userId: string, trackId: string, status: TrackStatus) {
    const existing = await this.assertTrackOwner(userId, trackId);
    const track = await this.prisma.goalTrack.update({ where: { id: trackId }, data: { status } });
    await this.revisions.record(userId, 'goal_track', track.id, status, track as unknown as Prisma.InputJsonValue);
    await this.recalculateGoalProgress(userId, existing.goalId);
    return track;
  }

  async deleteTrack(userId: string, trackId: string) {
    await this.assertTrackOwner(userId, trackId);
    const track = await this.prisma.goalTrack.update({ where: { id: trackId }, data: { deletedAt: new Date(), status: 'archived' } });
    await this.revisions.record(userId, 'goal_track', track.id, 'delete', { id: track.id });
    await this.recalculateGoalProgress(userId, track.goalId);
    return track;
  }

  async recalculateTrackProgress(userId: string, trackId: string) {
    const track = await this.assertTrackOwner(userId, trackId);
    const tasks = await this.prisma.task.findMany({
      where: { trackId, deletedAt: null, status: { not: 'cancelled' } },
      select: { status: true, estimatedMinutes: true },
    });
    const totalWeight = tasks.reduce((sum, task) => sum + this.taskProgressWeight(task.estimatedMinutes), 0);
    const completedWeight = tasks
      .filter((task) => task.status === 'completed')
      .reduce((sum, task) => sum + this.taskProgressWeight(task.estimatedMinutes), 0);
    const progress = totalWeight ? Math.round((completedWeight / totalWeight) * 10000) / 100 : 0;
    const status = this.derivedTrackStatus(track.status, progress);
    if (Math.abs(track.progress - progress) > 0.001 || track.status !== status) {
      const updated = await this.prisma.goalTrack.update({ where: { id: trackId }, data: { progress, status } });
      await this.revisions.record(userId, 'goal_track', updated.id, 'progress', updated as unknown as Prisma.InputJsonValue);
    }
    await this.recalculateGoalProgress(userId, track.goalId);
  }

  async recalculateGoalProgress(userId: string, goalId: string) {
    await this.assertGoalOwner(userId, goalId);
    const [goal, tracks] = await Promise.all([
      this.prisma.goal.findUniqueOrThrow({ where: { id: goalId } }),
      this.prisma.goalTrack.findMany({ where: { goalId, deletedAt: null, status: { not: 'archived' } } }),
    ]);
    const totalWeight = tracks.reduce((sum, track) => sum + track.progressWeight, 0);
    const overallProgress = tracks.length
      ? totalWeight > 0
        ? tracks.reduce((sum, track) => sum + track.progress * track.progressWeight, 0) / totalWeight
        : tracks.reduce((sum, track) => sum + track.progress, 0) / tracks.length
      : 0;
    const rounded = Math.round(overallProgress * 100) / 100;
    if (Math.abs(goal.overallProgress - rounded) > 0.001) {
      const updated = await this.prisma.goal.update({ where: { id: goalId }, data: { overallProgress: rounded } });
      await this.revisions.record(userId, 'goal', updated.id, 'progress', updated as unknown as Prisma.InputJsonValue);
    }
  }

  async assertGoalOwner(userId: string, goalId: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal || goal.deletedAt) throw new NotFoundException('Goal not found.');
    if (goal.userId !== userId) throw new ForbiddenException('Goal does not belong to the current user.');
    return goal;
  }

  async assertTrackOwner(userId: string, trackId: string) {
    const track = await this.prisma.goalTrack.findUnique({ where: { id: trackId }, include: { goal: true } });
    if (!track || track.deletedAt) throw new NotFoundException('Track not found.');
    if (track.goal.userId !== userId) throw new ForbiddenException('Track does not belong to the current user.');
    return track;
  }

  private async assertTrackWeightBudget(goalId: string, progressWeight: number, excludeTrackId?: string) {
    const tracks = await this.prisma.goalTrack.findMany({
      where: { goalId, deletedAt: null, id: excludeTrackId ? { not: excludeTrackId } : undefined },
    });
    const total = tracks.reduce((sum, track) => sum + track.progressWeight, 0) + progressWeight;
    if (total > 100) throw new BadRequestException('Active track progress weights cannot exceed 100 for a goal.');
  }

  private taskProgressWeight(estimatedMinutes: number) {
    return estimatedMinutes > 0 ? estimatedMinutes : 1;
  }

  private derivedTrackStatus(currentStatus: TrackStatus, progress: number): TrackStatus {
    if (currentStatus === 'archived') return currentStatus;
    if (progress >= 100) return 'completed';
    if (currentStatus === 'completed') return 'active';
    return currentStatus;
  }
}
