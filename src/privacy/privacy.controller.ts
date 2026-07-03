import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PrivacyService } from './privacy.service';

@ApiTags('privacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('export')
  export(@CurrentUser() user: AuthUser) {
    return this.privacy.exportUser(user.id);
  }

  @Post('request-delete-account')
  requestDelete(@CurrentUser() user: AuthUser) {
    return this.privacy.requestDeleteAccount(user.id);
  }

  @Post('delete-account/confirm')
  confirmDelete(@CurrentUser() user: AuthUser) {
    return this.privacy.confirmDeleteAccount(user.id);
  }

  @Post('delete-goal')
  deleteGoal(@CurrentUser() user: AuthUser, @Body('goalId') goalId: string) {
    return this.privacy.deleteGoal(user.id, goalId);
  }

  @Put('data-sharing-preferences')
  sharing(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.privacy.updateSharing(user.id, body);
  }
}

