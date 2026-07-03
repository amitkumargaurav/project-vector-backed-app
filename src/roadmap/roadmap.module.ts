import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';

@Module({
  imports: [GoalsModule],
  controllers: [RoadmapController],
  providers: [RoadmapService],
})
export class RoadmapModule {}

