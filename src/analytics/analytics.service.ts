import { Injectable } from '@nestjs/common';
import { DataType, PeriodType, Prisma, RiskLevel } from '@prisma/client';
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
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const snapshot = await this.prisma.probabilitySnapshot.findFirst({
      where: { userId, goalId: activeGoal.id, periodType: 'daily', periodStart: today },
      orderBy: { calculatedAt: 'desc' },
    });
    if (snapshot) {
      return { goal_id: activeGoal.id, probability_percentage: snapshot.probabilityPercentage, risk_level: snapshot.riskLevel };
    }
    const { probability } = await this.calculateProbability(userId, activeGoal.id, today);
    await this.persistProbabilitySnapshot(userId, activeGoal.id, today);
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
    const rows =
      period === 'weekly'
        ? await this.weeklyRows(userId, parseDateOnly(from), parseDateOnly(to))
        : period === 'monthly'
          ? await this.monthlyRows(userId, this.monthStart(from), this.monthStart(to))
          : await this.dailyRows(userId, parseDateOnly(from), parseDateOnly(to));
    return rows.map((row) => this.serializeClientSnapshot(period as PeriodType, row));
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

  async recalculateDailySnapshots(userId: string, from: Date, to: Date) {
    const rows = [];
    const activeGoal = await this.prisma.goal.findFirst({ where: { userId, status: 'active', deletedAt: null } });
    const syncRevision = await this.latestRevision(userId);
    for (let cursor = parseDateOnly(formatDateOnly(from)); cursor <= to; cursor = addDays(cursor, 1)) {
      const row = await this.calculateAggregateRow(userId, 'daily', cursor, endOfDate(cursor));
      const existing = await this.prisma.analyticsSnapshot.findFirst({
        where: { userId, goalId: activeGoal?.id, periodType: 'daily', periodStart: cursor },
      });
      const snapshot = existing
        ? await this.prisma.analyticsSnapshot.update({
            where: { id: existing.id },
            data: this.snapshotUpdateData(row, syncRevision),
          })
        : await this.prisma.analyticsSnapshot.create({
            data: {
              ...this.snapshotCreateData(row, syncRevision),
              userId,
              goalId: activeGoal?.id,
              periodType: 'daily',
              periodStart: cursor,
              periodEnd: endOfDate(cursor),
            },
          });
      rows.push(this.serializeSnapshot(snapshot));
    }
    return rows;
  }

  async persistProbabilitySnapshot(userId: string, goalId: string, periodStart = parseDateOnly(new Date().toISOString().slice(0, 10)), triggerAdjustment = false) {
    const previous = await this.prisma.probabilitySnapshot.findFirst({
      where: { userId, goalId },
      orderBy: { calculatedAt: 'desc' },
    });
    const { probability, rows, missed, completion } = await this.calculateProbability(userId, goalId, periodStart);
    const snapshot = await this.prisma.probabilitySnapshot.create({
      data: {
        userId,
        goalId,
        periodType: 'daily',
        periodStart,
        periodEnd: endOfDate(periodStart),
        probabilityPercentage: probability,
        riskLevel: this.riskFromProbability(probability),
        inputsJson: { windowDays: rows.length, averageCompletion: completion, missedTaskCount: missed } as Prisma.InputJsonValue,
        dataType: periodStart > parseDateOnly(new Date().toISOString().slice(0, 10)) ? 'projected' : 'actual',
        syncRevision: await this.latestRevision(userId),
      },
    });
    if (triggerAdjustment && previous && probability < previous.probabilityPercentage) {
      await this.prisma.planAdjustment.create({
        data: {
          goalId,
          suggestionType: 'probability_drop',
          reason: `Success probability dropped from ${previous.probabilityPercentage}% to ${probability}% after a progress update.`,
          proposedJson: {
            previous_probability_percentage: previous.probabilityPercentage,
            current_probability_percentage: probability,
            trigger: 'progress_update',
            recommendation: 'Generate an AI-assisted plan adjustment for user approval.',
          } as Prisma.InputJsonValue,
        },
      });
    }
    return snapshot;
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

  private monthStart(value: string) {
    return `${value.slice(0, 7)}-01`;
  }

  private async buildDailyRow(userId: string, date: Date) {
    return this.aggregateRow(userId, 'daily', date, endOfDate(date));
  }

  private async aggregateRow(userId: string, periodType: PeriodType, start: Date, end: Date) {
    const snapshot = await this.prisma.analyticsSnapshot.findFirst({ where: { userId, periodType, periodStart: start } });
    if (snapshot) {
      return this.serializeSnapshot(snapshot);
    }
    return this.calculateAggregateRow(userId, periodType, start, end);
  }

  private async calculateAggregateRow(userId: string, periodType: PeriodType, start: Date, end: Date) {
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

  private async calculateProbability(userId: string, goalId: string, periodStart: Date) {
    const rows = await this.dailyRows(userId, addDays(periodStart, -13), periodStart);
    const completion = rows.length ? rows.reduce((sum, row) => sum + (row.completion_percentage ?? 0), 0) / rows.length : 0;
    const missed = rows.reduce((sum, row) => sum + row.missed_task_count, 0);
    const probability = Math.max(5, Math.min(95, Math.round(50 + completion * 0.4 - missed * 2)));
    return { goalId, probability, rows, completion, missed };
  }

  private snapshotUpdateData(
    row: Awaited<ReturnType<AnalyticsService['calculateAggregateRow']>>,
    syncRevision: bigint,
  ): Prisma.AnalyticsSnapshotUncheckedUpdateInput {
    return {
      periodEnd: parseDateOnly(row.period_end),
      plannedTaskCount: row.planned_task_count,
      completedTaskCount: row.completed_task_count,
      skippedTaskCount: row.skipped_task_count,
      missedTaskCount: row.missed_task_count,
      completionPercentage: row.completion_percentage,
      probabilityPercentage: row.probability_percentage,
      plannedMinutes: row.planned_minutes,
      completedMinutes: row.completed_minutes,
      riskLevel: row.risk_level,
      dataType: row.data_type,
      syncRevision,
      calculatedAt: new Date(),
    };
  }

  private snapshotCreateData(
    row: Awaited<ReturnType<AnalyticsService['calculateAggregateRow']>>,
    syncRevision: bigint,
  ): Omit<Prisma.AnalyticsSnapshotUncheckedCreateInput, 'userId' | 'goalId' | 'periodType' | 'periodStart' | 'periodEnd'> {
    return {
      plannedTaskCount: row.planned_task_count,
      completedTaskCount: row.completed_task_count,
      skippedTaskCount: row.skipped_task_count,
      missedTaskCount: row.missed_task_count,
      completionPercentage: row.completion_percentage,
      probabilityPercentage: row.probability_percentage,
      plannedMinutes: row.planned_minutes,
      completedMinutes: row.completed_minutes,
      riskLevel: row.risk_level,
      dataType: row.data_type,
      syncRevision,
      calculatedAt: new Date(),
    };
  }

  private async latestRevision(userId: string) {
    const latest = await this.prisma.syncChangeLog.findFirst({ where: { userId }, orderBy: { revision: 'desc' } });
    return latest?.revision ?? 0n;
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

  private serializeClientSnapshot(
    period: PeriodType,
    snapshot: {
      period_label: string;
      period_start: string;
      period_end: string;
      completion_percentage: number | null;
      probability_percentage: number | null;
      planned_task_count: number;
      completed_task_count: number;
      skipped_task_count: number;
      missed_task_count: number;
      planned_minutes: number;
      completed_minutes: number;
      data_type: DataType;
      sync_revision: string;
    },
  ) {
    return {
      id: `${period}-${snapshot.period_start}`,
      period,
      periodLabel: snapshot.period_label,
      periodStart: snapshot.period_start,
      periodEnd: snapshot.period_end,
      completionPercentage: snapshot.completion_percentage ?? 0,
      probabilityPercentage: snapshot.probability_percentage ?? 0,
      plannedTaskCount: snapshot.planned_task_count,
      completedTaskCount: snapshot.completed_task_count,
      skippedTaskCount: snapshot.skipped_task_count,
      missedTaskCount: snapshot.missed_task_count,
      plannedMinutes: snapshot.planned_minutes,
      completedMinutes: snapshot.completed_minutes,
      dataType: snapshot.data_type,
      syncStatus: 'synced',
      syncRevision: snapshot.sync_revision,
      updatedAt: new Date().toISOString(),
    };
  }

  private riskFromProbability(probability: number): RiskLevel {
    if (probability < 40) return 'high';
    if (probability < 65) return 'moderate';
    return 'low';
  }
}
