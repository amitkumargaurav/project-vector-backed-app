import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { WorkerService } from './worker.service';

@Module({
  imports: [AnalyticsModule],
  providers: [WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
