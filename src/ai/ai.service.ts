import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goals: GoalsService,
  ) {}

  async createSuggestion(userId: string, suggestionType: string, inputJson: Record<string, unknown>, requiresUserApproval = true) {
    const goalId = inputJson.goalId ? String(inputJson.goalId) : undefined;
    if (goalId) await this.goals.assertGoalOwner(userId, goalId);
    return this.prisma.aISuggestion.create({
      data: {
        userId,
        goalId,
        suggestionType,
        promptVersion: 'phase0-v1',
        inputJson: inputJson as Prisma.InputJsonValue,
        outputJson: {
          status: 'queued',
          message: 'AI generation is queued. Workers must validate structured output before any user-visible mutation.',
        },
        requiresUserApproval,
      },
    });
  }
}
