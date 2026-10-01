-- CreateTable
CREATE TABLE "AITokenUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "suggestionId" TEXT,
    "suggestionType" TEXT,
    "source" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AITokenUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AITokenUsageLog_userId_createdAt_idx" ON "AITokenUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AITokenUsageLog_suggestionId_idx" ON "AITokenUsageLog"("suggestionId");

-- CreateIndex
CREATE INDEX "AITokenUsageLog_goalId_idx" ON "AITokenUsageLog"("goalId");

-- AddForeignKey
ALTER TABLE "AITokenUsageLog" ADD CONSTRAINT "AITokenUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITokenUsageLog" ADD CONSTRAINT "AITokenUsageLog_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITokenUsageLog" ADD CONSTRAINT "AITokenUsageLog_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "AISuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
