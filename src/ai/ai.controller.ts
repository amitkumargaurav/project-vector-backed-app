import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AiService } from './ai.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('generate-goal-plan')
  generateGoalPlan(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.ai.createSuggestion(user.id, 'goal_plan', body);
  }

  @Post('explain-roadmap')
  explainRoadmap(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.ai.createSuggestion(user.id, 'roadmap_explanation', body, false);
  }

  @Post('daily-guidance')
  dailyGuidance(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.ai.createSuggestion(user.id, 'daily_guidance', body, false);
  }

  @Post('weekly-review-summary')
  weeklyReviewSummary(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.ai.createSuggestion(user.id, 'weekly_review_summary', body, false);
  }

  @Post('analyze-blocker')
  analyzeBlocker(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.ai.createSuggestion(user.id, 'blocker_analysis', body);
  }
}

