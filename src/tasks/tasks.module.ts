import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { WorkerModule } from '../worker/worker.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [GoalsModule, WorkerModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
