import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SuggestionStatus } from '@prisma/client';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncRevisionService } from '../common/sync-revision.service';

@Injectable()
export class RoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalsService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async generate(userId: string, goalId: string, planJson: Record<string, unknown>) {
    await this.goals.assertGoalOwner(userId, goalId);
    const latest = await this.prisma.roadmapVersion.findFirst({ where: { goalId }, orderBy: { version: 'desc' } });
    const roadmap = await this.prisma.$transaction(async (tx) => {
      const version = await tx.roadmapVersion.create({
        data: { goalId, version: (latest?.version ?? 0) + 1, status: 'draft', planJson: planJson as Prisma.InputJsonValue, generatedBy: 'system' },
      });
      const milestones = this.arrayOfObjects(planJson.milestones);
      if (milestones.length) {
        await tx.milestone.createMany({
          data: milestones.map((milestone, index) => ({
            roadmapVersionId: version.id,
            title: String(milestone.title ?? `Milestone ${index + 1}`),
            targetDate: milestone.targetDate ? new Date(String(milestone.targetDate)) : undefined,
            sortOrder: index,
            metadataJson: milestone as Prisma.InputJsonValue,
          })),
        });
      }
      const dailyPlans = this.arrayOfObjects(planJson.dailyPlans);
      if (dailyPlans.length) {
        await tx.dailyPlan.createMany({
          data: dailyPlans
            .filter((plan) => plan.date || plan.planDate)
            .map((plan) => ({
              roadmapVersionId: version.id,
              goalId,
              planDate: new Date(String(plan.date ?? plan.planDate)),
              plannedMinutes: plan.plannedMinutes === undefined ? 0 : Number(plan.plannedMinutes),
              metadataJson: plan as Prisma.InputJsonValue,
            })),
        });
      }
      return tx.roadmapVersion.findUniqueOrThrow({ where: { id: version.id }, include: { milestones: true, dailyPlans: true } });
    });
    await this.revisions.record(userId, 'roadmap_version', roadmap.id, 'create', roadmap as never);
    return roadmap;
  }

  async current(userId: string, goalId: string) {
    await this.goals.assertGoalOwner(userId, goalId);
    return this.prisma.roadmapVersion.findFirst({ where: { goalId }, orderBy: { version: 'desc' }, include: { milestones: true, dailyPlans: true } });
  }

  async versions(userId: string, goalId: string) {
    await this.goals.assertGoalOwner(userId, goalId);
    return this.prisma.roadmapVersion.findMany({ where: { goalId }, orderBy: { version: 'desc' } });
  }

  async recalculate(userId: string, goalId: string, proposedJson: Record<string, unknown>) {
    await this.goals.assertGoalOwner(userId, goalId);
    if (proposedJson.progressUpdated === false || proposedJson.probabilityDecreased === false) {
      return {
        status: 'no_adjustment',
        reason: 'Plan adjustments are only created after a progress update causes success probability to decrease.',
      };
    }
    return this.prisma.planAdjustment.create({
      data: {
        goalId,
        suggestionType: 'roadmap_recalculation',
        reason: String(proposedJson.reason ?? 'Roadmap recalculation requested.'),
        proposedJson: proposedJson as Prisma.InputJsonValue,
      },
    });
  }

  async decideAdjustment(userId: string, goalId: string, adjustmentId: string, status: SuggestionStatus) {
    await this.goals.assertGoalOwner(userId, goalId);
    const adjustment = await this.prisma.planAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adjustment) throw new NotFoundException('Plan adjustment not found.');
    if (adjustment.goalId !== goalId) throw new ForbiddenException('Adjustment does not belong to this goal.');
    const updated = await this.prisma.planAdjustment.update({ where: { id: adjustmentId }, data: { status, decidedAt: new Date() } });
    await this.revisions.record(userId, 'plan_adjustment', updated.id, status, updated as never);
    return updated;
  }

  private arrayOfObjects(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  }
}
