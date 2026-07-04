import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsModule } from '../events/events.module';
import { GoalsModule } from '../goals/goals.module';
import { HistoryModule } from '../history/history.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { TasksModule } from '../tasks/tasks.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [ConfigModule, EventsModule, GoalsModule, HistoryModule, ReviewsModule, TasksModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
