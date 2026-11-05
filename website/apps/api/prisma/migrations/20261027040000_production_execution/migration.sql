-- Additive production execution, material requirements, inspection and consolidation.
-- Existing orders, offers, batches and capacity rows are preserved.
BEGIN;
CREATE TABLE "SpecificationMaterialLine" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "perItemMilli" INTEGER NOT NULL,
    "wastageBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpecificationMaterialLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InspectionCriterion" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "tolerance" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InspectionCriterion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BatchRelease" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "fundingAttestation" TEXT NOT NULL,
    "materialAttestation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchRelease_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BatchMaterialRequirement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "perItemMilli" INTEGER NOT NULL,
    "wastageBps" INTEGER NOT NULL,
    "batchQuantity" INTEGER NOT NULL,
    "requiredMilli" INTEGER NOT NULL,
    "readiness" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchMaterialRequirement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductionProgressEvent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "associationOrganizationId" TEXT,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "cumulative" INTEGER NOT NULL,
    "previousCumulative" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "priorEventId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "permissionUsed" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionProgressEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProductionLedgerEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "batchId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "artisanProfileId" TEXT,
    "source" TEXT NOT NULL,
    "quantity" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "correlationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionLedgerEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QualityInspectionAttempt" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "priorAttemptId" TEXT,
    "inspectorId" TEXT NOT NULL,
    "scopeQuantity" INTEGER NOT NULL,
    "approved" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "pending" INTEGER NOT NULL,
    "defectReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityInspectionAttempt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InspectionCriterionResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "InspectionCriterionResult_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ShipmentPreparation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentPreparation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ShipmentPreparationItem" (
    "id" TEXT NOT NULL,
    "preparationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "ShipmentPreparationItem_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CommercialBatch" ADD COLUMN "revisionId" TEXT;
CREATE UNIQUE INDEX "SpecificationMaterialLine_revisionId_materialCode_key" ON "SpecificationMaterialLine"("revisionId", "materialCode");
CREATE UNIQUE INDEX "InspectionCriterion_revisionId_code_key" ON "InspectionCriterion"("revisionId", "code");
CREATE UNIQUE INDEX "BatchRelease_batchId_key" ON "BatchRelease"("batchId");
CREATE UNIQUE INDEX "BatchMaterialRequirement_batchId_materialCode_key" ON "BatchMaterialRequirement"("batchId", "materialCode");
CREATE INDEX "ProductionProgressEvent_batchId_recordedAt_idx" ON "ProductionProgressEvent"("batchId", "recordedAt");
CREATE INDEX "ProductionLedgerEvent_orderId_recordedAt_idx" ON "ProductionLedgerEvent"("orderId", "recordedAt");
CREATE INDEX "ProductionLedgerEvent_batchId_recordedAt_idx" ON "ProductionLedgerEvent"("batchId", "recordedAt");
CREATE UNIQUE INDEX "QualityInspectionAttempt_batchId_attempt_key" ON "QualityInspectionAttempt"("batchId", "attempt");
CREATE UNIQUE INDEX "QualityInspectionAttempt_priorAttemptId_key" ON "QualityInspectionAttempt"("priorAttemptId");
CREATE UNIQUE INDEX "InspectionCriterionResult_attemptId_criterionId_key" ON "InspectionCriterionResult"("attemptId", "criterionId");
CREATE INDEX "ShipmentPreparation_orderId_createdAt_idx" ON "ShipmentPreparation"("orderId", "createdAt");
CREATE INDEX "ShipmentPreparationItem_batchId_idx" ON "ShipmentPreparationItem"("batchId");
CREATE INDEX "CommercialBatch_revisionId_idx" ON "CommercialBatch"("revisionId");
ALTER TABLE "SpecificationMaterialLine" ADD CONSTRAINT "SpecificationMaterialLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionCriterion" ADD CONSTRAINT "InspectionCriterion_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchRelease" ADD CONSTRAINT "BatchRelease_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchRelease" ADD CONSTRAINT "BatchRelease_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchRelease" ADD CONSTRAINT "BatchRelease_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchRelease" ADD CONSTRAINT "BatchRelease_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "ProcurementSample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchMaterialRequirement" ADD CONSTRAINT "BatchMaterialRequirement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchMaterialRequirement" ADD CONSTRAINT "BatchMaterialRequirement_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "BatchRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionProgressEvent" ADD CONSTRAINT "ProductionProgressEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionProgressEvent" ADD CONSTRAINT "ProductionProgressEvent_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionProgressEvent" ADD CONSTRAINT "ProductionProgressEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionProgressEvent" ADD CONSTRAINT "ProductionProgressEvent_associationOrganizationId_fkey" FOREIGN KEY ("associationOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionProgressEvent" ADD CONSTRAINT "ProductionProgressEvent_priorEventId_fkey" FOREIGN KEY ("priorEventId") REFERENCES "ProductionProgressEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionLedgerEvent" ADD CONSTRAINT "ProductionLedgerEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionLedgerEvent" ADD CONSTRAINT "ProductionLedgerEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionLedgerEvent" ADD CONSTRAINT "ProductionLedgerEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspectionAttempt" ADD CONSTRAINT "QualityInspectionAttempt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspectionAttempt" ADD CONSTRAINT "QualityInspectionAttempt_priorAttemptId_fkey" FOREIGN KEY ("priorAttemptId") REFERENCES "QualityInspectionAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspectionAttempt" ADD CONSTRAINT "QualityInspectionAttempt_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionCriterionResult" ADD CONSTRAINT "InspectionCriterionResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityInspectionAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionCriterionResult" ADD CONSTRAINT "InspectionCriterionResult_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "InspectionCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentPreparation" ADD CONSTRAINT "ShipmentPreparation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentPreparation" ADD CONSTRAINT "ShipmentPreparation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentPreparationItem" ADD CONSTRAINT "ShipmentPreparationItem_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "ShipmentPreparation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentPreparationItem" ADD CONSTRAINT "ShipmentPreparationItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialBatch" ADD CONSTRAINT "CommercialBatch_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpecificationMaterialLine" ADD CONSTRAINT "material_line_exact" CHECK (unit IN ('METERS','PIECES','UNITS') AND "perItemMilli" > 0 AND "wastageBps" >= 0 AND "wastageBps" <= 1000);
ALTER TABLE "BatchRelease" ADD CONSTRAINT "release_attestation" CHECK ("fundingAttestation" = 'SYNTHETIC_DEMO_NOT_A_PAYMENT' AND "materialAttestation" = 'SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT');
ALTER TABLE "BatchMaterialRequirement" ADD CONSTRAINT "requirement_readiness" CHECK (readiness IN ('AVAILABILITY_UNKNOWN','SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT') AND "requiredMilli" >= 0 AND "batchQuantity" > 0);
ALTER TABLE "ProductionProgressEvent" ADD CONSTRAINT "progress_event_shape" CHECK (kind IN ('REPORT','CORRECTION','FLAG') AND mode = 'CUMULATIVE' AND source IN ('ARTISAN','COORDINATOR','OPERATOR') AND cumulative >= 0 AND "previousCumulative" >= 0);
ALTER TABLE "QualityInspectionAttempt" ADD CONSTRAINT "inspection_attempt_reconcile" CHECK (kind IN ('INITIAL','REINSPECTION') AND approved >= 0 AND rejected >= 0 AND pending >= 0 AND approved + rejected + pending = "scopeQuantity" AND attempt > 0);
ALTER TABLE "InspectionCriterionResult" ADD CONSTRAINT "criterion_outcome" CHECK (outcome IN ('PASS','FAIL','NOT_APPLICABLE'));
ALTER TABLE "ShipmentPreparation" ADD CONSTRAINT "preparation_status" CHECK (status = 'PREPARED');
ALTER TABLE "ShipmentPreparationItem" ADD CONSTRAINT "preparation_quantity" CHECK (quantity > 0);
CREATE TRIGGER "SpecificationMaterialLine_immutable" BEFORE UPDATE OR DELETE ON "SpecificationMaterialLine" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "InspectionCriterion_immutable" BEFORE UPDATE OR DELETE ON "InspectionCriterion" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "BatchRelease_immutable" BEFORE UPDATE OR DELETE ON "BatchRelease" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "BatchMaterialRequirement_immutable" BEFORE UPDATE OR DELETE ON "BatchMaterialRequirement" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProductionProgressEvent_immutable" BEFORE UPDATE OR DELETE ON "ProductionProgressEvent" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProductionLedgerEvent_immutable" BEFORE UPDATE OR DELETE ON "ProductionLedgerEvent" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "QualityInspectionAttempt_immutable" BEFORE UPDATE OR DELETE ON "QualityInspectionAttempt" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "InspectionCriterionResult_immutable" BEFORE UPDATE OR DELETE ON "InspectionCriterionResult" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ShipmentPreparation_immutable" BEFORE UPDATE OR DELETE ON "ShipmentPreparation" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ShipmentPreparationItem_immutable" BEFORE UPDATE OR DELETE ON "ShipmentPreparationItem" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
COMMIT;
