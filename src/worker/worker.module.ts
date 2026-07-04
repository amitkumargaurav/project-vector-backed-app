import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { VECTOR_QUEUE } from './worker.constants';
import { WorkerProcessor } from './worker.processor';
import { WorkerService } from './worker.service';

@Module({
  imports: [AnalyticsModule, BullModule.registerQueue({ name: VECTOR_QUEUE })],
  providers: [WorkerService, WorkerProcessor],
  exports: [WorkerService],
})
export class WorkerModule {}
