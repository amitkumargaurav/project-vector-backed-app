import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.analytics.dashboard(user.id);
  }

  @Get('consistency')
  consistency(@CurrentUser() user: AuthUser) {
    return this.analytics.consistency(user.id);
  }

  @Get('probability')
  probability(@CurrentUser() user: AuthUser) {
    return this.analytics.probability(user.id);
  }

  @Get('time-usage')
  timeUsage(@CurrentUser() user: AuthUser) {
    return this.analytics.timeUsage(user.id);
  }

  @Get('risk')
  risk(@CurrentUser() user: AuthUser) {
    return this.analytics.risk(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('period') period = 'daily', @Query('from') from: string, @Query('to') to: string) {
    return this.analytics.history(user.id, period, from, to);
  }

  @Get('graph-context')
  graphContext(@CurrentUser() user: AuthUser, @Query('date') date: string, @Query('before') before = '7', @Query('after') after = '7') {
    return this.analytics.graphContext(user.id, date, Number(before), Number(after));
  }
}

