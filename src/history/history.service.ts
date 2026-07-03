import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { addDays, endOfDate, formatDateOnly, parseDateOnly } from '../common/date-utils';
import { SyncRevisionService } from '../common/sync-revision.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { HistoryReviewDto } from './dto';

@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly tasks: TasksService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async calendarMonth(userId: string, month: string) {
    const first = parseDateOnly(`${month}-01`);
    const gridStart = addDays(first, -first.getUTCDay());
    const gridEnd = addDays(gridStart, 41);
    const rows = await this.analytics.dailyRows(userId, gridStart, gridEnd);
    return { month, cells: rows };
  }

  async context(userId: string, date: string, period: string, before: number, after: number) {
    if (period !== 'daily') {
      return this.range(userId, period, formatDateOnly(addDays(parseDateOnly(date), -before)), formatDateOnly(addDays(parseDateOnly(date), after)));
    }
    const graph = await this.analytics.graphContext(userId, date, before, after);
    return { ...graph, selected_day_detail: await this.date(userId, date) };
  }

  async date(userId: string, date: string) {
    const day = parseDateOnly(date);
    const [tasks, reviews, events] = await Promise.all([
      this.prisma.task.findMany({ where: { goal: { userId }, scheduledDate: { gte: day, lte: endOfDate(day) }, deletedAt: null } }),
      this.prisma.reviewDaily.findUnique({ where: { userId_reviewDate: { userId, reviewDate: day } } }),
      this.prisma.progressEvent.findMany({ where: { userId, eventDate: { gte: day, lte: endOfDate(day) } }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { date, tasks, review: reviews, events };
  }

  range(userId: string, period: string, from: string, to: string) {
    return this.analytics.history(userId, period, from, to);
  }

  async appendDayEvent(userId: string, date: string, eventType: string, payload: Record<string, unknown>) {
    const eventDate = parseDateOnly(date);
    if (eventDate > parseDateOnly(new Date().toISOString().slice(0, 10))) {
      throw new BadRequestException('Future history rows can only be projected from plans.');
    }
    const event = await this.prisma.progressEvent.create({ data: { userId, eventType, eventDate, payloadJson: payload as Prisma.InputJsonValue } });
    await this.revisions.record(userId, 'progress_event', event.id, 'create', event as never);
    return event;
  }

  async review(userId: string, date: string, dto: HistoryReviewDto) {
    const reviewDate = parseDateOnly(date);
    const review = await this.prisma.reviewDaily.upsert({
      where: { userId_reviewDate: { userId, reviewDate } },
      update: { mood: dto.mood, answersJson: (dto.answersJson ?? {}) as Prisma.InputJsonValue },
      create: { userId, reviewDate, mood: dto.mood, answersJson: (dto.answersJson ?? {}) as Prisma.InputJsonValue },
    });
    await this.revisions.record(userId, 'review_daily', review.id, 'upsert', review as never);
    return review;
  }

  async markPastTaskSkipped(userId: string, taskId: string, note?: string) {
    const task = await this.tasks.assertTaskOwner(userId, taskId);
    if (!task.scheduledDate || task.scheduledDate >= parseDateOnly(new Date().toISOString().slice(0, 10))) {
      return this.tasks.action(userId, taskId, 'skip', { note });
    }
    if (task.status === 'completed') {
      return this.appendDayEvent(userId, formatDateOnly(task.scheduledDate), 'task.past_skip_context', { taskId, note });
    }
    return this.tasks.action(userId, taskId, 'skip', { note });
  }
}
