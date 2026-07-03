import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UpdatePrivacyDto, UpdateProfileDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Put()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Put('preferences')
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: Pick<UpdateProfileDto, 'preferencesJson'>) {
    return this.users.updateProfile(user.id, dto);
  }

  @Put('privacy')
  updatePrivacy(@CurrentUser() user: AuthUser, @Body() dto: UpdatePrivacyDto) {
    return this.users.updatePrivacy(user.id, dto);
  }

  @Put('notification-settings')
  updateNotificationSettings(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.users.updateNotificationSettings(user.id, body);
  }
}

