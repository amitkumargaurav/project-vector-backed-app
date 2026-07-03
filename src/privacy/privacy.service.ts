import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncRevisionService } from '../common/sync-revision.service';

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SyncRevisionService,
  ) {}

  exportUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        goals: { include: { tracks: true, tasks: true, roadmapVersions: true } },
        progressEvents: true,
        analytics: true,
        probabilities: true,
        notifications: true,
        privacySettings: true,
      },
    });
  }

  async requestDeleteAccount(userId: string) {
    return this.prisma.auditLog.create({ data: { userId, action: 'delete_account_requested' } });
  }

  async confirmDeleteAccount(userId: string) {
    await this.prisma.auditLog.create({ data: { userId, action: 'delete_account_confirmed' } });
    return this.prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
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
