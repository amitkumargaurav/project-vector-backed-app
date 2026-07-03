import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TasksModule } from '../tasks/tasks.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [AnalyticsModule, TasksModule],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}

