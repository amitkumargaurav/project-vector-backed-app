import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncRevisionService } from '../common/sync-revision.service';

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async exportUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        devices: true,
        goals: {
          include: {
            tracks: true,
            tasks: { include: { dependencies: true } },
            roadmapVersions: { include: { milestones: true, dailyPlans: true } },
            reviewsDaily: true,
            reviewsWeekly: true,
            reviewsMonthly: true,
            planAdjustments: true,
            aiSuggestions: true,
          },
        },
        progressEvents: true,
        analytics: true,
        probabilities: true,
        clientActions: true,
        syncChanges: true,
        syncStates: true,
        notifications: true,
        preferences: true,
        privacySettings: true,
        subscription: true,
        auditLogs: true,
      },
    });
    return {
      format: 'json',
      exported_at: new Date().toISOString(),
      user,
    };
  }

  async requestDeleteAccount(userId: string) {
    return this.prisma.auditLog.create({ data: { userId, action: 'delete_account_requested' } });
  }

  async confirmDeleteAccount(userId: string) {
    const now = new Date();
    await this.prisma.auditLog.create({ data: { userId, action: 'delete_account_confirmed' } });
    return this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.device.updateMany({ where: { userId, deletedAt: null }, data: { isActive: false, deletedAt: now } });
      await tx.goal.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now, status: 'archived' } });
      await tx.task.updateMany({ where: { goal: { userId }, deletedAt: null }, data: { deletedAt: now, status: 'cancelled' } });
      await tx.notification.updateMany({ where: { userId, status: { in: ['scheduled', 'failed'] } }, data: { status: 'cancelled' } });
      await tx.syncState.updateMany({ where: { userId }, data: { diagnosticsJson: { accountDeletedAt: now.toISOString() } } });
      return tx.user.update({ where: { id: userId }, data: { deletedAt: now } });
    });
  }

  async deleteGoal(userId: string, goalId: string) {
    const goal = await this.prisma.goal.update({ where: { id: goalId, userId }, data: { deletedAt: new Date(), status: 'archived' } });
    await this.revisions.record(userId, 'goal', goal.id, 'privacy_delete', { id: goal.id });
    return goal;
  }

  updateSharing(userId: string, body: Record<string, unknown>) {
    return this.prisma.privacySetting.upsert({
      where: { userId },
      update: body,
      create: { userId, ...body },
    });
  }
}
