import { Body, Controller, Delete, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto, UpdateNotificationPermissionDto, UpdateTimezoneDto, UpdateTokenDto } from './dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('register')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(user.id, dto);
  }

  @Put(':deviceId/fcm-token')
  updateToken(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string, @Body() dto: UpdateTokenDto) {
    return this.devices.update(user.id, deviceId, { fcmToken: dto.fcmToken });
  }

  @Put(':deviceId/timezone')
  updateTimezone(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string, @Body() dto: UpdateTimezoneDto) {
    return this.devices.update(user.id, deviceId, { timezone: dto.timezone });
  }

  @Put(':deviceId/notification-permission')
  updatePermission(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateNotificationPermissionDto,
  ) {
    return this.devices.update(user.id, deviceId, { notificationPermission: dto.notificationPermission });
  }

  @Delete(':deviceId')
  remove(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return this.devices.remove(user.id, deviceId);
  }
}

