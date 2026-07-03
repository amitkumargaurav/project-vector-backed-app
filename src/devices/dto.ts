import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  platform!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  osVersion?: string;

  @IsOptional()
  @IsString()
  notificationPermission?: string;
}

export class UpdateTokenDto {
  @IsString()
  fcmToken!: string;
}

export class UpdateTimezoneDto {
  @IsString()
  timezone!: string;
}

export class UpdateNotificationPermissionDto {
  @IsString()
  notificationPermission!: string;
}

