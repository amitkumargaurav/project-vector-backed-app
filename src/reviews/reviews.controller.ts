import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('daily')
  daily(@CurrentUser() user: AuthUser, @Query('date') date: string) {
    return this.reviews.getDaily(user.id, date);
  }

  @Post('daily')
  postDaily(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.reviews.upsertDaily(user.id, body);
  }

  @Get('weekly')
  weekly(@CurrentUser() user: AuthUser, @Query('week') week: string) {
    return this.reviews.getWeekly(user.id, week);
  }

  @Post('weekly')
  postWeekly(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.reviews.upsertWeekly(user.id, body);
  }

  @Get('monthly')
  monthly(@CurrentUser() user: AuthUser, @Query('month') month: string) {
    return this.reviews.getMonthly(user.id, month);
  }

  @Post('monthly')
  postMonthly(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.reviews.upsertMonthly(user.id, body);
  }
}

