import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RoadmapService } from './roadmap.service';

@ApiTags('roadmap')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('goals/:goalId/roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string, @Body() body: Record<string, unknown>) {
    return this.roadmap.generate(user.id, goalId, body);
  }

  @Get()
  current(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.roadmap.current(user.id, goalId);
  }

  @Get('versions')
  versions(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.roadmap.versions(user.id, goalId);
  }

  @Post('recalculate')
  recalculate(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string, @Body() body: Record<string, unknown>) {
    return this.roadmap.recalculate(user.id, goalId, body);
  }

  @Post('adjustments/:adjustmentId/accept')
  accept(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string, @Param('adjustmentId') adjustmentId: string) {
    return this.roadmap.decideAdjustment(user.id, goalId, adjustmentId, 'accepted');
  }

  @Post('adjustments/:adjustmentId/reject')
  reject(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string, @Param('adjustmentId') adjustmentId: string) {
    return this.roadmap.decideAdjustment(user.id, goalId, adjustmentId, 'rejected');
  }
}

