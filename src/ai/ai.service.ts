import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerService } from '../worker/worker.service';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalsService,
    private readonly worker: WorkerService,
  ) {}

  async createSuggestion(userId: string, suggestionType: string, inputJson: Record<string, unknown>, requiresUserApproval = true) {
    const goalId = inputJson.goalId ? String(inputJson.goalId) : undefined;
    if (goalId) await this.goals.assertGoalOwner(userId, goalId);
    const inputWithConversation = this.withConversationId(inputJson, goalId);
    const suggestion = await this.prisma.aISuggestion.create({
      data: {
        userId,
        goalId,
        suggestionType,
        promptVersion: 'phase0-v1',
        inputJson: inputWithConversation as Prisma.InputJsonValue,
        outputJson: {
          status: 'queued',
          message: 'AI generation is queued. Workers must validate structured output before any user-visible mutation.',
        },
        requiresUserApproval,
      },
    });
    await this.worker.enqueueAISuggestion(suggestion.id);
    return suggestion;
  }

  async getSuggestion(userId: string, suggestionId: string) {
    const suggestion = await this.prisma.aISuggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) throw new NotFoundException('AI suggestion not found.');
    if (suggestion.userId !== userId) throw new ForbiddenException('AI suggestion does not belong to the current user.');
    return suggestion;
  }

  private withConversationId(inputJson: Record<string, unknown>, goalId?: string) {
    if (goalId) return inputJson;
    const conversationId = this.isConversationContinuation(inputJson) ? this.conversationIdFromInput(inputJson) ?? this.newConversationId() : this.newConversationId();
    return { ...inputJson, aiConversationId: conversationId };
  }

  private newConversationId() {
    return `ai_${randomBytes(16).toString('hex')}`;
  }

  private isConversationContinuation(inputJson: Record<string, unknown>) {
    return inputJson.continueConversation === true || inputJson.continueAiConversation === true || inputJson.isFollowUp === true;
  }

  private conversationIdFromInput(inputJson: Record<string, unknown>) {
    const value = inputJson.aiConversationId ?? inputJson.conversationId ?? inputJson.threadId ?? inputJson.intakeSessionId;
    return typeof value === 'string' && value.trim() ? value : undefined;
  }
}
