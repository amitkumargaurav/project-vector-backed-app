import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus } from '@prisma/client';
import * as admin from 'firebase-admin';
import { Job } from 'bullmq';
import OpenAI from 'openai';
import { AnalyticsService } from '../analytics/analytics.service';
import { parseDateOnly } from '../common/date-utils';
import { PrismaService } from '../prisma/prisma.service';
import { VECTOR_QUEUE } from './worker.constants';

@Processor(VECTOR_QUEUE)
export class WorkerProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'notification.send') return this.sendNotification(String(job.data.notificationId));
    if (job.name === 'snapshot.recalculate') {
      return this.analytics.recalculateDailySnapshots(String(job.data.userId), parseDateOnly(String(job.data.fromDate)), parseDateOnly(String(job.data.toDate)));
    }
    if (job.name === 'probability.update') {
      return this.analytics.persistProbabilitySnapshot(String(job.data.userId), String(job.data.goalId), undefined, true);
    }
    if (job.name === 'ai.suggestion.generate') return this.generateAISuggestion(String(job.data.suggestionId));
    return {
      job: job.name,
      status: 'accepted',
      note: 'No concrete worker is registered for this job yet.',
    };
  }

  private async generateAISuggestion(suggestionId: string) {
    const suggestion = await this.prisma.aISuggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) return { suggestionId, status: 'skipped' };
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) return this.markAISuggestionFailed(suggestionId, 'OPENAI_API_KEY is not configured.');

    const goal = suggestion.goalId
      ? await this.prisma.goal.findUnique({
          where: { id: suggestion.goalId },
          include: { tracks: { where: { deletedAt: null } }, tasks: { where: { deletedAt: null }, orderBy: { scheduledDate: 'asc' }, take: 200 } },
        })
      : null;
    const client = new OpenAI({ apiKey });
    try {
      const response = await client.chat.completions.create({
        model: this.config.get<string>('OPENAI_MODEL', 'gpt-4.1-mini'),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: this.coachSystemPrompt() },
          {
            role: 'user',
            content: JSON.stringify({
              suggestionType: this.normalizeSuggestionType(suggestion.suggestionType),
              input: suggestion.inputJson,
              goal,
              requiredOutput: this.requiredOutputShape(),
            }),
          },
        ],
      });
      const content = response.choices[0]?.message.content;
      if (!content) return this.markAISuggestionFailed(suggestionId, 'OpenAI returned an empty response.');
      const output = JSON.parse(content) as Record<string, unknown>;
      return this.prisma.aISuggestion.update({
        where: { id: suggestionId },
        data: {
          outputJson: { status: 'completed', ...output },
          confidence: typeof output.confidence === 'number' ? output.confidence : undefined,
        },
      });
    } catch (error) {
      return this.markAISuggestionFailed(suggestionId, error instanceof Error ? error.message : 'AI generation failed.');
    }
  }

  private async sendNotification(notificationId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification || notification.status !== 'scheduled') return { notificationId, status: 'skipped' };
    const tokens = await this.prisma.device.findMany({
      where: { userId: notification.userId, isActive: true, deletedAt: null, fcmToken: { not: null } },
      select: { fcmToken: true },
    });
    if (!tokens.length) return this.markNotification(notificationId, 'failed');

    const app = this.firebaseApp();
    if (!app) return this.markNotification(notificationId, 'failed');

    const result = await admin.messaging(app).sendEachForMulticast({
      tokens: tokens.map((device) => device.fcmToken).filter((token): token is string => Boolean(token)),
      notification: { title: notification.title, body: notification.body },
      data: this.stringPayload(notification.payloadJson),
    });
    return this.markNotification(notificationId, result.successCount > 0 ? 'sent' : 'failed');
  }

  private firebaseApp() {
    if (admin.apps.length) return admin.apps[0] ?? undefined;
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return undefined;
    return admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  private async markNotification(notificationId: string, status: Extract<NotificationStatus, 'sent' | 'failed'>) {
    const now = new Date();
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: status === 'sent' ? { status, sentAt: now } : { status, failedAt: now },
    });
  }

  private stringPayload(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  }

  private markAISuggestionFailed(suggestionId: string, reason: string) {
    return this.prisma.aISuggestion.update({
      where: { id: suggestionId },
      data: { outputJson: { status: 'failed', reason } },
    });
  }

  private normalizeSuggestionType(type: string) {
    const aliases: Record<string, string> = {
      goal_plan: 'goal_setup',
      goal_requirement_refinement: 'goal_setup',
      goal_intake: 'goal_setup',
      daily_guidance: 'daily_plan',
      roadmap_explanation: 'roadmap_generation',
    };
    return aliases[type] ?? type;
  }

  private coachSystemPrompt() {
    return [
      'You are an execution coach for a goal-planning app. Return only valid JSON.',
      'The user defines what they want. First understand both the target and the user current state, then clarify the goal, identify tracks with different natures of work, and plan down to daily tasks when requested.',
      'If the input is incomplete, vague, contradictory, unrealistic, or absurd, do not force a plan. Return an intake object with status needs_clarification and ask exactly one high-value follow-up question.',
      'Use prior conversation turns and collected currentState when present. Ask the next question that most reduces planning uncertainty, such as attempt history, baseline level, graduation year, CGPA, prior score, available hours, constraints, or syllabus progress.',
      'For repeated attempts, ask about previous attempt year, score, weak subjects, and what changed. For first attempts, ask about academic background, current preparation level, graduation year, CGPA if relevant, and weekly availability.',
      'When enough context is available, set intake.status to ready_to_plan and return the proposed plan. Include currentState with the facts learned and remainingUnknowns with non-blocking gaps.',
      'Use the deadline when present. Schedule every day; do not skip weekends. Do not impose a daily duration cap unless the input explicitly gives availability.',
      'Milestones are AI-assisted and optional: create as many as useful, but never force a fixed count.',
      'For educational or exam-preparation goals, reserve explicit time for revision cycles before the deadline. Use 2nd, 3rd, and 4th revisions depending on exam scale, syllabus size, and stakes. Include mock tests, error-log review, and final high-yield review when relevant.',
      'Plan adjustments are allowed only when the input says progress was updated and probability decreased. If progress was not updated, return no_adjustment with a short reason.',
      'Do not claim certainty about success. Do not directly mutate product truth; return proposed goals, tracks, roadmap, tasks, daily plans, or adjustments for user approval.',
    ].join('\n');
  }

  private requiredOutputShape() {
    return {
      summary: 'string',
      intake: {
        status: 'needs_clarification|ready_to_plan',
        nextQuestion: 'string or null',
        questionReason: 'string or null',
        currentState: {
          attemptHistory: 'string or null',
          baselineLevel: 'string or null',
          education: 'string or null',
          availability: 'string or null',
          constraints: ['string'],
          motivation: 'string or null',
        },
        remainingUnknowns: ['string'],
      },
      goal: { title: 'string', deadline: 'ISO date or null', successCriteria: ['string'], assumptions: ['string'] },
      tracks: [{ name: 'string', nature: 'string', reason: 'string', progressWeight: 'number 0-100' }],
      milestones: [{ title: 'string', targetDate: 'ISO date or null', trackName: 'string or null' }],
      dailyPlans: [{ date: 'ISO date', focus: 'string', tasks: ['string'] }],
      tasks: [{ title: 'string', trackName: 'string or null', scheduledDate: 'ISO date or null', priority: 'low|medium|high|critical' }],
      revisionStrategy: { applies: 'boolean', cycles: [{ name: 'string', dateRange: 'string', purpose: 'string' }] },
      adjustment: { action: 'no_adjustment|propose_adjustment', reason: 'string', changes: ['string'] },
      confidence: 'number 0-1',
    };
  }
}
