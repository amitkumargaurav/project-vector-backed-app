import { BadRequestException } from '@nestjs/common';
import { GoalsService } from '../src/goals/goals.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('goal track progress', () => {
  it('recalculates focus-area and goal progress from linked task completion', async () => {
    const prisma = {
      goalTrack: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'track-1',
          goalId: 'goal-1',
          progress: 0,
          progressWeight: 50,
          status: 'active',
          deletedAt: null,
          goal: { userId: 'user-1' },
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'track-1', progress: 50, progressWeight: 50 },
          { id: 'track-2', progress: 0, progressWeight: 50 },
        ]),
        update: jest.fn().mockResolvedValue({ id: 'track-1', goalId: 'goal-1', progress: 50, status: 'active' }),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'completed', estimatedMinutes: 30 },
          { status: 'pending', estimatedMinutes: 30 },
        ]),
      },
      goal: {
        findUnique: jest.fn().mockResolvedValue({ id: 'goal-1', userId: 'user-1', deletedAt: null, overallProgress: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'goal-1', overallProgress: 0 }),
        update: jest.fn().mockResolvedValue({ id: 'goal-1', overallProgress: 25 }),
      },
    };
    const revisions = { record: jest.fn().mockResolvedValue({}) };
    const service = new GoalsService(prisma as never, revisions as never);

    await service.recalculateTrackProgress('user-1', 'track-1');

    expect(prisma.goalTrack.update).toHaveBeenCalledWith({
      where: { id: 'track-1' },
      data: { progress: 50, status: 'active' },
    });
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal-1' },
      data: { overallProgress: 25 },
    });
  });

  it('rejects creating a task without a focus area', async () => {
    const service = new TasksService({} as never, {} as never, {} as never, {} as never);

    await expect(
      service.create('user-1', {
        goalId: 'goal-1',
        title: 'Read chapter 1',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
