import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { HistoryNoteDto, HistoryReviewDto } from './dto';
import { HistoryService } from './history.service';

@ApiTags('history')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('calendar/month')
  month(@CurrentUser() user: AuthUser, @Query('month') month: string) {
    return this.history.calendarMonth(user.id, month);
  }

  @Get('history/context')
  context(
    @CurrentUser() user: AuthUser,
    @Query('date') date: string,
    @Query('period') period = 'daily',
    @Query('before') before = '7',
    @Query('after') after = '7',
  ) {
    return this.history.context(user.id, date, period, Number(before), Number(after));
  }

  @Get('history/date/:date')
  date(@CurrentUser() user: AuthUser, @Param('date') date: string) {
    return this.history.date(user.id, date);
  }

  @Get('history/range')
  range(@CurrentUser() user: AuthUser, @Query('period') period = 'daily', @Query('from') from: string, @Query('to') to: string) {
    return this.history.range(user.id, period, from, to);
  }

  @Post('history/days/:date/mark-empty')
  markEmpty(@CurrentUser() user: AuthUser, @Param('date') date: string) {
    return this.history.appendDayEvent(user.id, date, 'day.mark_empty', {});
  }

  @Post('history/days/:date/mark-skipped')
  markSkipped(@CurrentUser() user: AuthUser, @Param('date') date: string, @Body() body: HistoryNoteDto) {
    return this.history.appendDayEvent(user.id, date, 'day.mark_skipped', { ...body });
  }

  @Post('history/days/:date/note')
  note(@CurrentUser() user: AuthUser, @Param('date') date: string, @Body() body: HistoryNoteDto) {
    return this.history.appendDayEvent(user.id, date, 'day.note', { ...body });
  }

  @Post('history/days/:date/review')
  review(@CurrentUser() user: AuthUser, @Param('date') date: string, @Body() body: HistoryReviewDto) {
    return this.history.review(user.id, date, body);
  }

  @Post('history/tasks/:taskId/mark-skipped')
  taskSkipped(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() body: HistoryNoteDto) {
    return this.history.markPastTaskSkipped(user.id, taskId, body.note);
  }
}
