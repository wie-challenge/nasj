-- Additive commercial decision records. No existing quotation, order, identity or capacity row is deleted.
BEGIN;
CREATE TABLE "EffortAssumption" (
    "id" TEXT NOT NULL,
    "craftSkillId" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "minPerUnit" DECIMAL(12,2) NOT NULL,
    "maxPerUnit" DECIMAL(12,2) NOT NULL,
    "effortUnit" TEXT NOT NULL DEFAULT 'HOURS',
    "source" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EffortAssumption_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FeasibilityAssessment" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rfqVersion" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "requestedQuantity" DECIMAL(12,2) NOT NULL,
    "knownRemaining" DECIMAL(12,2),
    "shortage" DECIMAL(12,2),
    "effortMin" DECIMAL(12,2),
    "effortMax" DECIMAL(12,2),
    "effortAssumptionId" TEXT,
    "constraints" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeasibilityAssessment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CostEstimate" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "feasibilityAssessmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TND',
    "components" JSONB NOT NULL,
    "subtotalMillimes" BIGINT NOT NULL,
    "marginMethod" TEXT NOT NULL,
    "marginBasisPoints" INTEGER NOT NULL,
    "sellingMillimes" BIGINT,
    "taxStatus" TEXT NOT NULL DEFAULT 'PENDING_LEGAL_REVIEW',
    "incomplete" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostEstimate_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProcurementQuote" ADD COLUMN "feasibilityAssessmentId" TEXT,
ADD COLUMN "costEstimateId" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ISSUED',
ADD COLUMN "termsSha256" TEXT;
CREATE UNIQUE INDEX "EffortAssumption_craftSkillId_unitType_version_key" ON "EffortAssumption"("craftSkillId", "unitType", "version");
CREATE UNIQUE INDEX "FeasibilityAssessment_rfqId_version_key" ON "FeasibilityAssessment"("rfqId", "version");
CREATE INDEX "FeasibilityAssessment_rfqId_createdAt_idx" ON "FeasibilityAssessment"("rfqId", "createdAt");
CREATE UNIQUE INDEX "CostEstimate_rfqId_version_key" ON "CostEstimate"("rfqId", "version");
CREATE INDEX "CostEstimate_rfqId_createdAt_idx" ON "CostEstimate"("rfqId", "createdAt");
ALTER TABLE "EffortAssumption" ADD CONSTRAINT "EffortAssumption_craftSkillId_fkey" FOREIGN KEY ("craftSkillId") REFERENCES "CraftSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EffortAssumption" ADD CONSTRAINT "EffortAssumption_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_effortAssumptionId_fkey" FOREIGN KEY ("effortAssumptionId") REFERENCES "EffortAssumption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_feasibilityAssessmentId_fkey" FOREIGN KEY ("feasibilityAssessmentId") REFERENCES "FeasibilityAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementQuote" ADD CONSTRAINT "ProcurementQuote_feasibilityAssessmentId_fkey" FOREIGN KEY ("feasibilityAssessmentId") REFERENCES "FeasibilityAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementQuote" ADD CONSTRAINT "ProcurementQuote_costEstimateId_fkey" FOREIGN KEY ("costEstimateId") REFERENCES "CostEstimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EffortAssumption" ADD CONSTRAINT "EffortAssumption_version_positive" CHECK (version > 0 AND "minPerUnit" >= 0 AND "maxPerUnit" >= "minPerUnit");
ALTER TABLE "FeasibilityAssessment" ADD CONSTRAINT "FeasibilityAssessment_result_known" CHECK (result IN ('FEASIBLE', 'NOT_FEASIBLE', 'NEEDS_REVIEW'));
ALTER TABLE "ProcurementQuote" ADD CONSTRAINT "ProcurementQuote_status_known" CHECK (status IN ('ISSUED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'));
COMMENT ON COLUMN "ProcurementQuote"."status" IS 'Insert-time marker. Effective status is derived from acceptance, rejection, a later version, or expiry because this row is append-only.';
CREATE TABLE "ProcurementQuoteRejection" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcurementQuoteRejection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProcurementQuoteRejection_quoteId_key" ON "ProcurementQuoteRejection"("quoteId");
ALTER TABLE "ProcurementQuoteRejection" ADD CONSTRAINT "ProcurementQuoteRejection_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ProcurementQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementQuoteRejection" ADD CONSTRAINT "ProcurementQuoteRejection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementQuoteRejection" ADD CONSTRAINT "ProcurementQuoteRejection_reason_bounds" CHECK (char_length(reason) BETWEEN 2 AND 500);
CREATE TRIGGER "ProcurementQuoteRejection_immutable" BEFORE UPDATE OR DELETE ON "ProcurementQuoteRejection" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "EffortAssumption_immutable" BEFORE UPDATE OR DELETE ON "EffortAssumption" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "FeasibilityAssessment_immutable" BEFORE UPDATE OR DELETE ON "FeasibilityAssessment" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "CostEstimate_immutable" BEFORE UPDATE OR DELETE ON "CostEstimate" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
COMMIT;
