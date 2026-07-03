-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('draft', 'active', 'paused', 'completed', 'archived', 'abandoned');

-- CreateEnum
CREATE TYPE "TrackStatus" AS ENUM ('active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'in_progress', 'completed', 'skipped', 'missed', 'rescheduled', 'cancelled');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "TaskDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "DeadlineType" AS ENUM ('fixed', 'flexible');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('actual', 'partial', 'projected', 'provisional');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'moderate', 'high');

-- CreateEnum
CREATE TYPE "ClientActionStatus" AS ENUM ('accepted', 'rejected', 'duplicate');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('scheduled', 'sent', 'read', 'clicked', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleSub" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" TEXT NOT NULL DEFAULT 'en',
    "availableMinutesPerDay" INTEGER NOT NULL DEFAULT 60,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "preferencesJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "fcmToken" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "appVersion" TEXT,
    "osVersion" TEXT,
    "notificationPermission" TEXT NOT NULL DEFAULT 'unknown',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "deadline" TIMESTAMP(3),
    "overallProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'draft',
    "activeSince" TIMESTAMP(3),
    "syncRevision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalTrack" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "targetDate" TIMESTAMP(3),
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "progressWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "TrackStatus" NOT NULL DEFAULT 'active',
    "syncRevision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GoalTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapVersion" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "planJson" JSONB NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "RoadmapVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "roadmapVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "roadmapVersionId" TEXT,
    "goalId" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "trackId" TEXT,
    "dailyPlanId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskType" TEXT NOT NULL DEFAULT 'study',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "scheduledDate" TIMESTAMP(3),
    "scheduledStartTime" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "difficulty" "TaskDifficulty" NOT NULL DEFAULT 'medium',
    "deadlineType" "DeadlineType" NOT NULL DEFAULT 'flexible',
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "parentTaskId" TEXT,
    "clientActionId" TEXT,
    "syncRevision" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "missedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnTaskId" TEXT NOT NULL,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "trackId" TEXT,
    "taskId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "clientEventId" TEXT,
    "clientActionId" TEXT,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "syncRevision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "energyLevel" INTEGER,
    "mood" TEXT,
    "notes" TEXT,
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewWeekly" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "weekLabel" TEXT NOT NULL,
    "summary" TEXT,
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewWeekly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewMonthly" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "monthLabel" TEXT NOT NULL,
    "summary" TEXT,
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "plannedTaskCount" INTEGER NOT NULL DEFAULT 0,
    "completedTaskCount" INTEGER NOT NULL DEFAULT 0,
    "skippedTaskCount" INTEGER NOT NULL DEFAULT 0,
    "missedTaskCount" INTEGER NOT NULL DEFAULT 0,
    "completionPercentage" DOUBLE PRECISION,
    "probabilityPercentage" DOUBLE PRECISION,
    "consistencyScore" DOUBLE PRECISION,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "completedMinutes" INTEGER NOT NULL DEFAULT 0,
    "trackBreakdownJson" JSONB NOT NULL DEFAULT '{}',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'low',
    "dataType" "DataType" NOT NULL DEFAULT 'actual',
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "syncRevision" BIGINT NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbabilitySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "probabilityPercentage" DOUBLE PRECISION NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'low',
    "formulaVersion" TEXT NOT NULL DEFAULT 'phase0-v1',
    "inputsJson" JSONB NOT NULL DEFAULT '{}',
    "dataType" "DataType" NOT NULL DEFAULT 'actual',
    "syncRevision" BIGINT NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbabilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAdjustment" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "suggestionType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedJson" JSONB NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "PlanAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL,
    "goalId" TEXT,
    "userId" TEXT NOT NULL,
    "suggestionType" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL DEFAULT '{}',
    "outputJson" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION,
    "requiresUserApproval" BOOLEAN NOT NULL DEFAULT true,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AISuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "morningReminderTime" TEXT,
    "eveningReviewTime" TEXT,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "maxNotificationsPerDay" INTEGER NOT NULL DEFAULT 3,
    "intelligentNudgesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodEnd" TIMESTAMP(3),
    "featureFlagsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacySetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sensitiveGoalModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiDataSharingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "analyticsSharingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" "ClientActionStatus" NOT NULL,
    "reason" TEXT,
    "resultJson" JSONB NOT NULL DEFAULT '{}',
    "syncRevision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncChangeLog" (
    "revision" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncChangeLog_pkey" PRIMARY KEY ("revision")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "lastPulledRevision" BIGINT NOT NULL DEFAULT 0,
    "lastPushedAt" TIMESTAMP(3),
    "diagnosticsJson" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "GoalTrack_goalId_status_idx" ON "GoalTrack"("goalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapVersion_goalId_version_key" ON "RoadmapVersion"("goalId", "version");

-- CreateIndex
CREATE INDEX "DailyPlan_goalId_planDate_idx" ON "DailyPlan"("goalId", "planDate");

-- CreateIndex
CREATE INDEX "Task_goalId_scheduledDate_idx" ON "Task"("goalId", "scheduledDate");

-- CreateIndex
CREATE INDEX "Task_trackId_idx" ON "Task"("trackId");

-- CreateIndex
CREATE INDEX "Task_clientActionId_idx" ON "Task"("clientActionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_taskId_dependsOnTaskId_key" ON "TaskDependency"("taskId", "dependsOnTaskId");

-- CreateIndex
CREATE INDEX "ProgressEvent_userId_eventDate_idx" ON "ProgressEvent"("userId", "eventDate");

-- CreateIndex
CREATE INDEX "ProgressEvent_goalId_eventDate_idx" ON "ProgressEvent"("goalId", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressEvent_userId_clientEventId_key" ON "ProgressEvent"("userId", "clientEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDaily_userId_reviewDate_key" ON "ReviewDaily"("userId", "reviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewWeekly_userId_weekLabel_key" ON "ReviewWeekly"("userId", "weekLabel");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewMonthly_userId_monthLabel_key" ON "ReviewMonthly"("userId", "monthLabel");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_userId_periodType_periodStart_idx" ON "AnalyticsSnapshot"("userId", "periodType", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_userId_goalId_periodType_periodStart_key" ON "AnalyticsSnapshot"("userId", "goalId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "ProbabilitySnapshot_userId_goalId_periodStart_idx" ON "ProbabilitySnapshot"("userId", "goalId", "periodStart");

-- CreateIndex
CREATE INDEX "Notification_userId_status_scheduledAt_idx" ON "Notification"("userId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacySetting_userId_key" ON "PrivacySetting"("userId");

-- CreateIndex
CREATE INDEX "ClientActionLog_userId_syncRevision_idx" ON "ClientActionLog"("userId", "syncRevision");

-- CreateIndex
CREATE UNIQUE INDEX "ClientActionLog_userId_clientActionId_key" ON "ClientActionLog"("userId", "clientActionId");

-- CreateIndex
CREATE INDEX "SyncChangeLog_userId_revision_idx" ON "SyncChangeLog"("userId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_userId_deviceId_key" ON "SyncState"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTrack" ADD CONSTRAINT "GoalTrack_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapVersion" ADD CONSTRAINT "RoadmapVersion_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_roadmapVersionId_fkey" FOREIGN KEY ("roadmapVersionId") REFERENCES "RoadmapVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_roadmapVersionId_fkey" FOREIGN KEY ("roadmapVersionId") REFERENCES "RoadmapVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "GoalTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEvent" ADD CONSTRAINT "ProgressEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEvent" ADD CONSTRAINT "ProgressEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDaily" ADD CONSTRAINT "ReviewDaily_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWeekly" ADD CONSTRAINT "ReviewWeekly_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewMonthly" ADD CONSTRAINT "ReviewMonthly_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbabilitySnapshot" ADD CONSTRAINT "ProbabilitySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbabilitySnapshot" ADD CONSTRAINT "ProbabilitySnapshot_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAdjustment" ADD CONSTRAINT "PlanAdjustment_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestion" ADD CONSTRAINT "AISuggestion_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacySetting" ADD CONSTRAINT "PrivacySetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActionLog" ADD CONSTRAINT "ClientActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncChangeLog" ADD CONSTRAINT "SyncChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
