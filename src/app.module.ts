import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { validateConfig } from './config/config.validation';
import { DevicesModule } from './devices/devices.module';
import { EventsModule } from './events/events.module';
import { GoalsModule } from './goals/goals.module';
import { HealthController } from './health.controller';
import { HistoryModule } from './history/history.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ReviewsModule } from './reviews/reviews.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SyncModule } from './sync/sync.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { WorkerModule } from './worker/worker.module';

const envFilePath = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
      validate: validateConfig,
    }),
    CommonModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    GoalsModule,
    TasksModule,
    EventsModule,
    SyncModule,
    HistoryModule,
    AnalyticsModule,
    ReviewsModule,
    RoadmapModule,
    NotificationsModule,
    AiModule,
    SubscriptionsModule,
    PrivacyModule,
    WorkerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
