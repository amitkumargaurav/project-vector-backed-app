import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { TracksController } from './tracks.controller';

@Module({
  controllers: [GoalsController, TracksController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}

