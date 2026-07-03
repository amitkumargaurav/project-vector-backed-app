import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { VECTOR_QUEUE } from './worker.constants';
import { WorkerProcessor } from './worker.processor';
import { WorkerService } from './worker.service';

@Module({
  imports: [BullModule.registerQueue({ name: VECTOR_QUEUE })],
  providers: [WorkerService, WorkerProcessor],
  exports: [WorkerService],
})
export class WorkerModule {}
