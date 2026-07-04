import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { WorkerModule } from '../worker/worker.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [GoalsModule, WorkerModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
