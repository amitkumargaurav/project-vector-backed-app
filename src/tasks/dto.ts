import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DeadlineType, TaskDifficulty, TaskPriority, TaskStatus } from '@prisma/client';

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  goalId!: string;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  taskType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedMinutes?: number;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  scheduledStartTime?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskDifficulty)
  difficulty?: TaskDifficulty;

  @IsOptional()
  @IsEnum(DeadlineType)
  deadlineType?: DeadlineType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOnTaskIds?: string[];

  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsOptional()
  @IsString()
  clientActionId?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  trackId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  taskType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedMinutes?: number;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  scheduledStartTime?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskDifficulty)
  difficulty?: TaskDifficulty;

  @IsOptional()
  @IsEnum(DeadlineType)
  deadlineType?: DeadlineType;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class TaskActionDto {
  @IsOptional()
  @IsString()
  clientActionId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RescheduleTaskDto extends TaskActionDto {
  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  scheduledStartTime?: string;
}
