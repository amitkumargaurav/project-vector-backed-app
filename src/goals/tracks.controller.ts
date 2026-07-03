import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UpdateTrackDto } from './dto';
import { GoalsService } from './goals.service';

@ApiTags('tracks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tracks')
export class TracksController {
  constructor(private readonly goals: GoalsService) {}

  @Get(':trackId')
  get(@CurrentUser() user: AuthUser, @Param('trackId') trackId: string) {
    return this.goals.getTrack(user.id, trackId);
  }

  @Put(':trackId')
  update(@CurrentUser() user: AuthUser, @Param('trackId') trackId: string, @Body() dto: UpdateTrackDto) {
    return this.goals.updateTrack(user.id, trackId, dto);
  }

  @Post(':trackId/pause')
  pause(@CurrentUser() user: AuthUser, @Param('trackId') trackId: string) {
    return this.goals.setTrackStatus(user.id, trackId, 'paused');
  }

  @Post(':trackId/resume')
  resume(@CurrentUser() user: AuthUser, @Param('trackId') trackId: string) {
    return this.goals.setTrackStatus(user.id, trackId, 'active');
  }

  @Post(':trackId/complete')
  complete(@CurrentUser() user: AuthUser, @Param('trackId') trackId: string) {
    return this.goals.setTrackStatus(user.id, trackId, 'completed');
  }

  @Delete(':trackId')
  remove(@CurrentUser() user: AuthUser, @Param('trackId') trackId: string) {
    return this.goals.deleteTrack(user.id, trackId);
  }
}

