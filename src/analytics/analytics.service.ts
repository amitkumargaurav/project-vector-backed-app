import { Injectable } from '@nestjs/common';
import { DataType, PeriodType, RiskLevel } from '@prisma/client';
import { addDays, endOfDate, formatDateOnly, parseDateOnly, startOfMonth, startOfWeek } from '../common/date-utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(userId: string) {
    const [activeGoal, today, probability] = await Promise.all([
      this.prisma.goal.findFirst({ where: { userId, status: 'active', deletedAt: null }, include: { tracks: true } }),
      this.buildDailyRow(userId, parseDateOnly(new Date().toISOString().slice(0, 10))),
      this.probability(userId),
    ]);
    return { active_goal: activeGoal, today, probability };
  }

  async consistency(userId: string) {
    const to = parseDateOnly(new Date().toISOString().slice(0, 10));
    const from = addDays(to, -29);
    const rows = await this.dailyRows(userId, from, to);
    const activeDays = rows.filter((row) => row.completed_task_count > 0).length;
    return { active_days: activeDays, expected_days: rows.length, consistency_score: rows.length ? Math.round((activeDays / rows.length) * 100) : 0 };
  }

  async probability(userId: string) {
    const activeGoal = await this.prisma.goal.findFirst({ where: { userId, status: 'active', deletedAt: null } });
    if (!activeGoal) return { probability_percentage: null, risk_level: 'low' };
    const rows = await this.dailyRows(userId, addDays(new Date(), -13), new Date());
    const completion = rows.length ? rows.reduce((sum, row) => sum + (row.completion_percentage ?? 0), 0) / rows.length : 0;
    const missed = rows.reduce((sum, row) => sum + row.missed_task_count, 0);
    const probability = Math.max(5, Math.min(95, Math.round(50 + completion * 0.4 - missed * 2)));
    return { goal_id: activeGoal.id, probability_percentage: probability, risk_level: this.riskFromProbability(probability) };
  }

  async timeUsage(userId: string) {
    const rows = await this.dailyRows(userId, addDays(new Date(), -29), new Date());
    return {
      planned_minutes: rows.reduce((sum, row) => sum + row.planned_minutes, 0),
      completed_minutes: rows.reduce((sum, row) => sum + row.completed_minutes, 0),
    };
  }

  async risk(userId: string) {
    const probability = await this.probability(userId);
    return { risk_level: probability.risk_level, probability_percentage: probability.probability_percentage };
  }

  async history(userId: string, period: string, from: string, to: string) {
    if (period === 'weekly') return { rows: await this.weeklyRows(userId, parseDateOnly(from), parseDateOnly(to)) };
    if (period === 'monthly') return { rows: await this.monthlyRows(userId, `${from}-01`, `${to}-01`) };
    return { rows: await this.dailyRows(userId, parseDateOnly(from), parseDateOnly(to)) };
  }

  async graphContext(userId: string, date: string, before: number, after: number) {
    const selected = parseDateOnly(date);
    const from = addDays(selected, -before);
    const to = addDays(selected, after);
    const series = await this.dailyRows(userId, from, to);
    const selectedDay = series.find((row) => row.period_start === formatDateOnly(selected)) ?? (await this.buildDailyRow(userId, selected));
    const previous = series.filter((row) => row.period_start < formatDateOnly(selected)).slice(-7);
    const previousAvg = previous.length ? Math.round(previous.reduce((sum, row) => sum + (row.completion_percentage ?? 0), 0) / previous.length) : null;
    return {
      selected_date: date,
      range: { from: formatDateOnly(from), to: formatDateOnly(to) },
      selected_day: selectedDay,
      series,
      comparison: {
        previous_7_day_avg_completion: previousAvg,
        selected_day_completion: selectedDay.completion_percentage,
        trend: previousAvg === null ? 'unknown' : (selectedDay.completion_percentage ?? 0) >= previousAvg ? 'improving' : 'declining',
      },
    };
  }

  async dailyRows(userId: string, from: Date, to: Date) {
    const rows = [];
    for (let cursor = parseDateOnly(formatDateOnly(from)); cursor <= to; cursor = addDays(cursor, 1)) {
      rows.push(await this.buildDailyRow(userId, cursor));
    }
    return rows;
  }

  private async weeklyRows(userId: string, from: Date, to: Date) {
    const rows = [];
    for (let cursor = startOfWeek(from); cursor <= to; cursor = addDays(cursor, 7)) {
      rows.push(await this.aggregateRow(userId, 'weekly', cursor, addDays(cursor, 6)));
    }
    return rows;
  }

  private async monthlyRows(userId: string, fromMonth: string, toMonth: string) {
    const rows = [];
    for (let cursor = startOfMonth(parseDateOnly(fromMonth)); cursor <= parseDateOnly(toMonth); cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
      const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      rows.push(await this.aggregateRow(userId, 'monthly', cursor, end));
    }
    return rows;
  }

  private async buildDailyRow(userId: string, date: Date) {
    return this.aggregateRow(userId, 'daily', date, endOfDate(date));
  }

  private async aggregateRow(userId: string, periodType: PeriodType, start: Date, end: Date) {
    const snapshot = await this.prisma.analyticsSnapshot.findFirst({ where: { userId, periodType, periodStart: start } });
    if (snapshot) {
      return this.serializeSnapshot(snapshot);
    }
    const tasks = await this.prisma.task.findMany({
      where: { goal: { userId }, deletedAt: null, scheduledDate: { gte: start, lte: end } },
      include: { track: true },
    });
    const planned = tasks.length;
    const completed = tasks.filter((task) => task.status === 'completed').length;
    const skipped = tasks.filter((task) => task.status === 'skipped').length;
    const missed = tasks.filter((task) => task.status === 'missed').length;
    const plannedMinutes = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
    const completedMinutes = tasks.filter((task) => task.status === 'completed').reduce((sum, task) => sum + task.estimatedMinutes, 0);
    const completion = planned ? Math.round((completed / planned) * 100) : null;
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const dataType: DataType = start > today ? 'projected' : end >= today ? 'partial' : 'actual';
    const probability = dataType === 'projected' ? null : completion;
    return {
      period_label: periodType === 'daily' ? formatDateOnly(start) : `${formatDateOnly(start)}..${formatDateOnly(end)}`,
      period_start: formatDateOnly(start),
      period_end: formatDateOnly(end),
      completion_percentage: completion,
      probability_percentage: probability,
      planned_task_count: planned,
      completed_task_count: completed,
      skipped_task_count: skipped,
      missed_task_count: missed,
      planned_minutes: plannedMinutes,
      completed_minutes: completedMinutes,
      risk_level: this.riskFromProbability(probability ?? 50),
      data_type: dataType,
      sync_revision: '0',
    };
  }

  private serializeSnapshot(snapshot: {
    periodStart: Date;
    periodEnd: Date;
    completionPercentage: number | null;
    probabilityPercentage: number | null;
    plannedTaskCount: number;
    completedTaskCount: number;
    skippedTaskCount: number;
    missedTaskCount: number;
    plannedMinutes: number;
    completedMinutes: number;
    riskLevel: RiskLevel;
    dataType: DataType;
    syncRevision: bigint;
  }) {
    return {
      period_label: formatDateOnly(snapshot.periodStart),
      period_start: formatDateOnly(snapshot.periodStart),
      period_end: formatDateOnly(snapshot.periodEnd),
      completion_percentage: snapshot.completionPercentage,
      probability_percentage: snapshot.probabilityPercentage,
      planned_task_count: snapshot.plannedTaskCount,
      completed_task_count: snapshot.completedTaskCount,
      skipped_task_count: snapshot.skippedTaskCount,
      missed_task_count: snapshot.missedTaskCount,
      planned_minutes: snapshot.plannedMinutes,
      completed_minutes: snapshot.completedMinutes,
      risk_level: snapshot.riskLevel,
      data_type: snapshot.dataType,
      sync_revision: snapshot.syncRevision.toString(),
    };
  }

  private riskFromProbability(probability: number): RiskLevel {
    if (probability < 40) return 'high';
    if (probability < 65) return 'moderate';
    return 'low';
  }
}
