import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const subscription = await this.prisma.subscription.upsert({
      where: { userId },
      update: {},
      create: { userId, tier: 'free', status: 'active' },
    });
    return {
      userId: subscription.userId,
      plan: subscription.tier === 'premium' ? 'premium' : 'free',
      tier: subscription.tier,
      status: subscription.status,
      premiumUntil: subscription.currentPeriodEnd,
      current_period_end: subscription.currentPeriodEnd,
      feature_flags: subscription.featureFlagsJson,
      syncStatus: 'synced',
      updatedAt: subscription.updatedAt,
    };
  }
}
