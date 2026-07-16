import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus } from '@prisma/client';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import { AnalyticsService } from '../analytics/analytics.service';
import { parseDateOnly } from '../common/date-utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {}

  async enqueueSnapshotRecalculation(userId: string, fromDate: string, toDate: string) {
    try {
      return await this.analytics.recalculateDailySnapshots(userId, parseDateOnly(fromDate), parseDateOnly(toDate));
    } catch (error) {
      this.logger.warn(`Snapshot recalculation failed for user ${userId}: ${this.errorMessage(error)}`);
      return { status: 'failed', reason: this.errorMessage(error) };
    }
  }

  async enqueueProbabilityUpdate(userId: string, goalId: string) {
    try {
      return await this.analytics.persistProbabilitySnapshot(userId, goalId, undefined, true);
    } catch (error) {
      this.logger.warn(`Probability update failed for goal ${goalId}: ${this.errorMessage(error)}`);
      return { status: 'failed', reason: this.errorMessage(error) };
    }
  }

  async enqueueNotification(notificationId: string) {
    try {
      return await this.sendNotification(notificationId);
    } catch (error) {
      this.logger.warn(`Notification send failed for ${notificationId}: ${this.errorMessage(error)}`);
      return this.markNotification(notificationId, 'failed');
    }
  }

  enqueueAISuggestion(suggestionId: string) {
    return this.generateAISuggestion(suggestionId);
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
    const suggestionContext = await this.buildSuggestionContext(suggestion.id, suggestion.userId, suggestion.goalId, suggestion.suggestionType, suggestion.inputJson);
    const client = new OpenAI({ apiKey });
    try {
      const response = await client.chat.completions.create({
        model: this.config.get<string>('OPENAI_MODEL', 'gpt-5.4-mini'),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: this.coachSystemPrompt() },
          {
            role: 'user',
            content: this.stringifyJsonSafe({
              suggestionType: this.normalizeSuggestionType(suggestion.suggestionType),
              input: suggestion.inputJson,
              priorAISuggestions: suggestionContext,
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
    return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? value : this.stringifyJsonSafe(value)]));
  }

  private markAISuggestionFailed(suggestionId: string, reason: string) {
    return this.prisma.aISuggestion.update({
      where: { id: suggestionId },
      data: { outputJson: { status: 'failed', reason } },
    });
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private stringifyJsonSafe(value: unknown) {
    return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
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

  private async buildSuggestionContext(suggestionId: string, userId: string, goalId: string | null, suggestionType: string, inputJson: unknown) {
    const conversationId = this.conversationIdFromInput(inputJson);
    if (!goalId && !conversationId) return [];

    const normalizedType = this.normalizeSuggestionType(suggestionType);
    const candidates = await this.prisma.aISuggestion.findMany({
      where: {
        userId,
        id: { not: suggestionId },
        ...(goalId ? { goalId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        goalId: true,
        suggestionType: true,
        inputJson: true,
        outputJson: true,
        createdAt: true,
      },
    });
    return candidates
      .filter((candidate) => {
        if (goalId) return true;
        return this.normalizeSuggestionType(candidate.suggestionType) === normalizedType && this.conversationIdFromInput(candidate.inputJson) === conversationId;
      })
      .slice(0, 6)
      .reverse()
      .map((candidate) => ({
        id: candidate.id,
        createdAt: candidate.createdAt.toISOString(),
        suggestionType: this.normalizeSuggestionType(candidate.suggestionType),
        input: candidate.inputJson,
        outputSummary: this.suggestionOutputSummary(candidate.outputJson),
      }));
  }

  private conversationIdFromInput(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
    const json = input as Record<string, unknown>;
    const value = json.aiConversationId ?? json.conversationId ?? json.threadId ?? json.intakeSessionId;
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private suggestionOutputSummary(output: unknown) {
    if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
    const json = output as Record<string, unknown>;
    const intake = json.intake && typeof json.intake === 'object' && !Array.isArray(json.intake) ? (json.intake as Record<string, unknown>) : undefined;
    return {
      status: json.status,
      summary: json.summary,
      intake: intake
        ? {
            status: intake.status,
            nextQuestion: intake.nextQuestion,
            questionReason: intake.questionReason,
            currentState: intake.currentState,
            remainingUnknowns: intake.remainingUnknowns,
          }
        : undefined,
      goal: json.goal,
    };
  }

  private coachSystemPrompt() {
    return [
      'You are an execution coach for a goal-planning app. Return only valid JSON.',
      'The user defines what they want. First understand both the target and the user current state, then clarify the goal, identify tracks with different natures of work, and plan down to daily tasks when requested.',
      'Treat priorAISuggestions as compact conversation memory. Use it to preserve facts already learned and to continue the intake flow. Ignore prior suggestions only when they are clearly unrelated to the current goal or current user input.',
      'If priorAISuggestions contains currentState facts, carry those facts forward unless the latest input corrects them. Do not ask for a fact that is already present in currentState, the latest input, the goal, or priorAISuggestions.',
      'If priorAISuggestions contains prior intake.nextQuestion values, do not repeat those questions. If the latest input answers a prior question, incorporate the answer and ask the next different question only if it is truly blocking.',
      'If the input is incomplete, vague, contradictory, unrealistic, or absurd, do not force a plan. Return an intake object with status needs_clarification and ask exactly one high-value follow-up question. Never ask multiple questions in one response.',
      'Use prior conversation turns and collected currentState when present. Ask the next question that most reduces planning uncertainty, such as attempt history, baseline level, graduation year, CGPA, prior score, available hours, constraints, or syllabus progress.',
      'For repeated attempts, ask about previous attempt year, score, weak subjects, and what changed. For first attempts, ask about academic background, current preparation level, graduation year, CGPA if relevant, and weekly availability.',
      'For exam, certification, course, or syllabus-driven goals, do not create generic tasks such as "study", "practice", "revise", or "mock test" without naming the exact subject, unit, chapter, topic, paper, or question type. Every task title must include a concrete topic and a concrete action.',
      'You do not have live web access in this integration. If the exact current syllabus, exam pattern, or topic list is missing, ask the user for the official syllabus text/link/topic list or ask for permission/context to proceed with clearly stated assumptions. Prefer asking for the syllabus over inventing it.',
      'If a user provides syllabus topics, decompose them into day-level tasks. Each daily task must map to a specific syllabus topic or revision/mock-test activity; avoid filler tasks.',
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
      tasks: [
        {
          title: 'specific syllabus/topic action string; never generic',
          trackName: 'string or null',
          scheduledDate: 'ISO date or null',
          syllabusTopic: 'string or null',
          priority: 'low|medium|high|critical',
        },
      ],
      revisionStrategy: { applies: 'boolean', cycles: [{ name: 'string', dateRange: 'string', purpose: 'string' }] },
      adjustment: { action: 'no_adjustment|propose_adjustment', reason: 'string', changes: ['string'] },
      confidence: 'number 0-1',
    };
  }
}
