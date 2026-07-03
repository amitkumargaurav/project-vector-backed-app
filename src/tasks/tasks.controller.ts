import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateTaskDto, RescheduleTaskDto, TaskActionDto, UpdateTaskDto } from './dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.tasks.listByDate(user.id, new Date().toISOString().slice(0, 10));
  }

  @Get('tasks')
  list(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return date ? this.tasks.listByDate(user.id, date) : this.tasks.list(user.id);
  }

  @Post('tasks')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.id, dto);
  }

  @Put('tasks/:taskId')
  update(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user.id, taskId, dto);
  }

  @Post('tasks/:taskId/start')
  start(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: TaskActionDto) {
    return this.tasks.action(user.id, taskId, 'start', dto);
  }

  @Post('tasks/:taskId/complete')
  complete(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: TaskActionDto) {
    return this.tasks.action(user.id, taskId, 'complete', dto);
  }

  @Post('tasks/:taskId/skip')
  skip(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: TaskActionDto) {
    return this.tasks.action(user.id, taskId, 'skip', dto);
  }

  @Post('tasks/:taskId/reschedule')
  reschedule(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: RescheduleTaskDto) {
    return this.tasks.reschedule(user.id, taskId, dto);
  }

  @Post('tasks/:taskId/undo')
  undo(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: TaskActionDto) {
    return this.tasks.action(user.id, taskId, 'undo', dto);
  }
}

