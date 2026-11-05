BEGIN;
-- Batch 10 completion: preserved forecast snapshots, consented observed production time,
-- deduplicated alerts and reviewed reporting policy.
CREATE TABLE "ForecastSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "forecastedFor" TIMESTAMP(3) NOT NULL,
    "assumptions" JSONB NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ForecastSnapshot_batchId_createdAt_idx" ON "ForecastSnapshot"("batchId", "createdAt");
ALTER TABLE "ForecastSnapshot" ADD CONSTRAINT "ForecastSnapshot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ForecastSnapshot" ADD CONSTRAINT "ForecastSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ForecastComparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forecastId" TEXT NOT NULL,
    "actualCompletedAt" TIMESTAMP(3) NOT NULL,
    "observedDifferenceDays" INTEGER NOT NULL,
    "absoluteErrorDays" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ForecastComparison_forecastId_key" ON "ForecastComparison"("forecastId");
ALTER TABLE "ForecastComparison" ADD CONSTRAINT "ForecastComparison_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "ForecastSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProductionTimeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "consented" BOOLEAN NOT NULL DEFAULT false,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "unitContext" TEXT NOT NULL,
    "observedMinutes" INTEGER,
    "evidence" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "correctionOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProductionTimeRecord_correctionOfId_key" ON "ProductionTimeRecord"("correctionOfId");
CREATE INDEX "ProductionTimeRecord_batchId_createdAt_idx" ON "ProductionTimeRecord"("batchId", "createdAt");
ALTER TABLE "ProductionTimeRecord" ADD CONSTRAINT "ProductionTimeRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionTimeRecord" ADD CONSTRAINT "ProductionTimeRecord_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionTimeRecord" ADD CONSTRAINT "ProductionTimeRecord_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionTimeRecord" ADD CONSTRAINT "ProductionTimeRecord_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "ProductionTimeRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BatchAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "reasonHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "ownerRole" TEXT NOT NULL DEFAULT 'PRODUCTION_MANAGER',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BatchAlert_batchId_ruleVersion_reasonHash_key" ON "BatchAlert"("batchId", "ruleVersion", "reasonHash");
CREATE INDEX "BatchAlert_status_createdAt_idx" ON "BatchAlert"("status", "createdAt");
ALTER TABLE "BatchAlert" ADD CONSTRAINT "BatchAlert_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchAlert" ADD CONSTRAINT "BatchAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReportingPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "value" JSONB NOT NULL,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ReportingPolicy_key_key" ON "ReportingPolicy"("key");
ALTER TABLE "ReportingPolicy" ADD CONSTRAINT "ReportingPolicy_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
