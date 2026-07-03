import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  availableMinutesPerDay?: number;

  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;

  @IsOptional()
  @IsObject()
  preferencesJson?: Record<string, unknown>;
}

export class UpdatePrivacyDto {
  @IsOptional()
  @IsBoolean()
  sensitiveGoalModeEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  aiDataSharingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  analyticsSharingEnabled?: boolean;
}

