CREATE TABLE "CommandOutcome" (
 "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "resourceId" TEXT NOT NULL,
 "operation" TEXT NOT NULL, "keyHash" TEXT NOT NULL, "payloadHash" TEXT NOT NULL,
 "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CommandOutcome_actorId_resourceId_operation_keyHash_key" ON "CommandOutcome" ("actorId", "resourceId", "operation", "keyHash");
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'RETRY', 'DELIVERED', 'FAILED');
CREATE TABLE "OutboxEvent" (
 "id" TEXT PRIMARY KEY, "auditEventId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "actorId" TEXT NOT NULL, "organizationId" TEXT,
 "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "correlationId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deliveredAt" TIMESTAMP(3),
 "lastErrorCode" TEXT, "durationMs" INTEGER,
 CONSTRAINT "outbox_attempts_valid" CHECK ("attempts" >= 0),
 CONSTRAINT "outbox_version_valid" CHECK ("version" = 1)
);
CREATE UNIQUE INDEX "OutboxEvent_auditEventId_key" ON "OutboxEvent" ("auditEventId");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent" ("status", "availableAt");
CREATE TABLE "EventReceipt" (
 "eventId" TEXT PRIMARY KEY REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
