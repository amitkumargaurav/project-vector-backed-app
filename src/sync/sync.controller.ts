import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { SyncPushDto } from './dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('bootstrap')
  bootstrap(@CurrentUser() user: AuthUser) {
    return this.sync.bootstrap(user.id);
  }

  @Get('changes')
  changes(
    @CurrentUser() user: AuthUser,
    @Query('since_revision') sinceRevision?: string,
    @Query('sync_revision') syncRevision?: string,
  ) {
    return this.sync.changes(user.id, BigInt(sinceRevision ?? syncRevision ?? 0));
  }

  @Post('push')
  push(@CurrentUser() user: AuthUser, @Body() dto: SyncPushDto) {
    return this.sync.push(user.id, dto);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.sync.status(user.id);
  }
}

@ApiTags('app')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('app')
export class AppBootstrapController {
  constructor(private readonly sync: SyncService) {}

  @Get('bootstrap')
  bootstrap(@CurrentUser() user: AuthUser) {
    return this.sync.appBootstrap(user.id);
  }
}
