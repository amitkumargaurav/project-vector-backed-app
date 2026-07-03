import { Injectable } from '@nestjs/common';
import { SyncRevisionService } from '../common/sync-revision.service';
import { parseDateOnly } from '../common/date-utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SyncRevisionService,
  ) {}

  getDaily(userId: string, date: string) {
    return this.prisma.reviewDaily.findUnique({ where: { userId_reviewDate: { userId, reviewDate: parseDateOnly(date) } } });
  }

  async upsertDaily(userId: string, body: Record<string, unknown>) {
    const reviewDate = parseDateOnly(String(body.date ?? new Date().toISOString().slice(0, 10)));
    const review = await this.prisma.reviewDaily.upsert({
      where: { userId_reviewDate: { userId, reviewDate } },
      update: {
        goalId: body.goalId ? String(body.goalId) : undefined,
        energyLevel: body.energyLevel === undefined ? undefined : Number(body.energyLevel),
        mood: body.mood ? String(body.mood) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        answersJson: (body.answersJson as object) ?? {},
      },
      create: {
        userId,
        goalId: body.goalId ? String(body.goalId) : undefined,
        reviewDate,
        energyLevel: body.energyLevel === undefined ? undefined : Number(body.energyLevel),
        mood: body.mood ? String(body.mood) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        answersJson: (body.answersJson as object) ?? {},
      },
    });
    await this.revisions.record(userId, 'review_daily', review.id, 'upsert', review as never);
    return review;
  }

  getWeekly(userId: string, weekLabel: string) {
    return this.prisma.reviewWeekly.findUnique({ where: { userId_weekLabel: { userId, weekLabel } } });
  }

  async upsertWeekly(userId: string, body: Record<string, unknown>) {
    const weekLabel = String(body.week);
    const review = await this.prisma.reviewWeekly.upsert({
      where: { userId_weekLabel: { userId, weekLabel } },
      update: { summary: body.summary ? String(body.summary) : undefined, answersJson: (body.answersJson as object) ?? {} },
      create: { userId, weekLabel, summary: body.summary ? String(body.summary) : undefined, answersJson: (body.answersJson as object) ?? {} },
    });
    await this.revisions.record(userId, 'review_weekly', review.id, 'upsert', review as never);
    return review;
  }

  getMonthly(userId: string, monthLabel: string) {
    return this.prisma.reviewMonthly.findUnique({ where: { userId_monthLabel: { userId, monthLabel } } });
  }

  async upsertMonthly(userId: string, body: Record<string, unknown>) {
    const monthLabel = String(body.month);
    const review = await this.prisma.reviewMonthly.upsert({
      where: { userId_monthLabel: { userId, monthLabel } },
      update: { summary: body.summary ? String(body.summary) : undefined, answersJson: (body.answersJson as object) ?? {} },
      create: { userId, monthLabel, summary: body.summary ? String(body.summary) : undefined, answersJson: (body.answersJson as object) ?? {} },
    });
    await this.revisions.record(userId, 'review_monthly', review.id, 'upsert', review as never);
    return review;
  }
}
