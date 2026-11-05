-- Versioned visitor-owned synthetic scenario registry; no existing records changed.
BEGIN;
-- CreateTable
CREATE TABLE "DemoVisitor" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "activeScenarioId" TEXT,
    "sessionEpoch" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoScenario" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "seedSpec" JSONB NOT NULL,
    "organizationIds" JSONB NOT NULL,
    "rfqId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "DemoScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoIdentity" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "persona" TEXT NOT NULL,

    CONSTRAINT "DemoIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoCommand" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoVisitor_tokenHash_key" ON "DemoVisitor"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DemoVisitor_activeScenarioId_key" ON "DemoVisitor"("activeScenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoScenario_rfqId_key" ON "DemoScenario"("rfqId");

-- CreateIndex
CREATE INDEX "DemoScenario_visitorId_status_idx" ON "DemoScenario"("visitorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DemoScenario_visitorId_generation_key" ON "DemoScenario"("visitorId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "DemoIdentity_userId_key" ON "DemoIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoIdentity_scenarioId_persona_key" ON "DemoIdentity"("scenarioId", "persona");

-- CreateIndex
CREATE UNIQUE INDEX "DemoCommand_visitorId_keyHash_key" ON "DemoCommand"("visitorId", "keyHash");
ALTER TABLE "DemoScenario" ADD FOREIGN KEY ("visitorId") REFERENCES "DemoVisitor"("id") ON DELETE RESTRICT;
ALTER TABLE "DemoScenario" ADD FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT;
ALTER TABLE "DemoVisitor" ADD FOREIGN KEY ("activeScenarioId") REFERENCES "DemoScenario"("id") ON DELETE RESTRICT;
ALTER TABLE "DemoVisitor" ADD CHECK ("sessionEpoch" >= 0);
ALTER TABLE "DemoScenario" ADD CHECK ("generation" > 0 AND "version" > 0 AND "status" IN ('ACTIVE','ARCHIVED') AND (("status"='ACTIVE' AND "archivedAt" IS NULL) OR ("status"='ARCHIVED' AND "archivedAt" IS NOT NULL)));
CREATE UNIQUE INDEX "DemoScenario_active_visitor_key" ON "DemoScenario"("visitorId") WHERE "status"='ACTIVE';
ALTER TABLE "DemoIdentity" ADD FOREIGN KEY ("scenarioId") REFERENCES "DemoScenario"("id") ON DELETE RESTRICT;
ALTER TABLE "DemoIdentity" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "DemoIdentity" ADD CHECK ("persona" IN ('buyer','artisan','coordinator','production','qa','finance'));
ALTER TABLE "DemoCommand" ADD FOREIGN KEY ("visitorId") REFERENCES "DemoVisitor"("id") ON DELETE RESTRICT;
ALTER TABLE "DemoCommand" ADD FOREIGN KEY ("scenarioId") REFERENCES "DemoScenario"("id") ON DELETE RESTRICT;
ALTER TABLE "DemoCommand" ADD CHECK ("operation" IN ('start','switch','reset'));
CREATE TRIGGER "DemoCommand_immutable" BEFORE UPDATE OR DELETE ON "DemoCommand" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "DemoIdentity_immutable" BEFORE UPDATE OR DELETE ON "DemoIdentity" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
COMMIT;
