import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateGoalDto, CreateTrackDto, UpdateGoalDto } from './dto';
import { GoalsService } from './goals.service';

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.goals.createGoal(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.goals.listGoals(user.id);
  }

  @Get(':goalId')
  get(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.goals.getGoal(user.id, goalId);
  }

  @Put(':goalId')
  update(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string, @Body() dto: UpdateGoalDto) {
    return this.goals.updateGoal(user.id, goalId, dto);
  }

  @Post(':goalId/activate')
  activate(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.goals.setGoalStatus(user.id, goalId, 'active');
  }

  @Post(':goalId/pause')
  pause(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.goals.setGoalStatus(user.id, goalId, 'paused');
  }

  @Post(':goalId/resume')
  resume(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.goals.setGoalStatus(user.id, goalId, 'active');
  }

  @Post(':goalId/complete')
  complete(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.goals.setGoalStatus(user.id, goalId, 'completed');
  }

  @Delete(':goalId')
  remove(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.goals.deleteGoal(user.id, goalId);
  }

  @Post(':goalId/tracks')
  createTrack(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string, @Body() dto: CreateTrackDto) {
    return this.goals.createTrack(user.id, goalId, dto);
  }

  @Get(':goalId/tracks')
  listTracks(@CurrentUser() user: AuthUser, @Param('goalId') goalId: string) {
    return this.goals.listTracks(user.id, goalId);
  }
}

