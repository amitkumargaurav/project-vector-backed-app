import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notificationEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  morningReminderTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  eveningReviewTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursEnd?: string;

  @IsOptional()
  @IsObject()
  goalReminderTimes?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxNotificationsPerDay?: number;

  @IsOptional()
  @IsBoolean()
  intelligentNudgesEnabled?: boolean;
}
