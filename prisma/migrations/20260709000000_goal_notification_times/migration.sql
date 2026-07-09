ALTER TABLE "NotificationPreference"
ADD COLUMN "goalReminderTimes" JSONB NOT NULL DEFAULT '{}';
