import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Post('test')
  test(@CurrentUser() user: AuthUser) {
    return this.notifications.create(user.id, {
      type: 'test',
      title: 'Vector test',
      body: 'Notifications are connected.',
      payloadJson: {},
    });
  }

  @Post('preferences')
  preferences(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.notifications.updatePreferences(user.id, body);
  }

  @Put(':notificationId/read')
  read(@CurrentUser() user: AuthUser, @Param('notificationId') notificationId: string) {
    return this.notifications.mark(user.id, notificationId, 'read');
  }

  @Post(':notificationId/clicked')
  clicked(@CurrentUser() user: AuthUser, @Param('notificationId') notificationId: string) {
    return this.notifications.mark(user.id, notificationId, 'clicked');
  }
}

