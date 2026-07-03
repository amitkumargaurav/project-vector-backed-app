import { IsArray, IsDateString, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEventDto {
  @IsString()
  eventType!: string;

  @IsDateString()
  eventDate!: string;

  @IsOptional()
  @IsString()
  goalId?: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  clientEventId?: string;

  @IsOptional()
  @IsString()
  clientActionId?: string;

  @IsOptional()
  @IsObject()
  payloadJson?: Record<string, unknown>;
}

export class BatchEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events!: CreateEventDto[];
}

