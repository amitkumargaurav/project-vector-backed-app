import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [GoalsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}

