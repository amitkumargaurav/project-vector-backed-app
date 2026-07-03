import { IsObject, IsOptional, IsString } from 'class-validator';

export class HistoryNoteDto {
  @IsString()
  note!: string;
}

export class HistoryReviewDto {
  @IsOptional()
  @IsString()
  mood?: string;

  @IsOptional()
  @IsObject()
  answersJson?: Record<string, unknown>;
}

