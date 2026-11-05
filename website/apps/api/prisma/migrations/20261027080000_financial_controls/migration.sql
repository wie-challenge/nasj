BEGIN;
-- Financial controls: no provider integration or verified evidence authority is configured.
CREATE TABLE "BuyerDepositRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "buyerOrganizationId" TEXT NOT NULL,
  "expectedMillimes" BIGINT NOT NULL,
  "amountMillimes" BIGINT NOT NULL,
  "paymentReference" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "evidence" TEXT NOT NULL,
  "provenance" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "actorId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BuyerDepositRecord_buyerOrganizationId_paymentReference_key" ON "BuyerDepositRecord" ("buyerOrganizationId", "paymentReference");
CREATE INDEX "BuyerDepositRecord_orderId_idx" ON "BuyerDepositRecord" ("orderId");
CREATE TABLE "PayoutRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "amountMillimes" BIGINT NOT NULL,
  "payableSnapshotMillimes" BIGINT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "approverId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PayoutRequest_orderId_idx" ON "PayoutRequest" ("orderId");
CREATE INDEX "PayoutRequest_payableId_idx" ON "PayoutRequest" ("payableId");
CREATE TABLE "PayoutExecutionRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payoutId" TEXT NOT NULL,
  "amountMillimes" BIGINT NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "evidence" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "actorId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "bankVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PayoutExecutionRecord_payoutId_idx" ON "PayoutExecutionRecord" ("payoutId");
CREATE TABLE "PaymentDispute" (
  "responseDueAt" TIMESTAMP(3) NOT NULL,
  "escalation" TEXT NOT NULL DEFAULT 'FINANCE_REVIEW_QUEUE',
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "payableId" TEXT,
  "artisanProfileId" TEXT NOT NULL,
  "amountMillimes" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "handlerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PaymentDispute_orderId_idx" ON "PaymentDispute" ("orderId");
CREATE INDEX "PaymentDispute_artisanProfileId_idx" ON "PaymentDispute" ("artisanProfileId");
CREATE TABLE "FinancialAdjustment" (
  "snapshot" JSONB NOT NULL,
  "evidence" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'REVIEW_ONLY',
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "amountMillimes" BIGINT NOT NULL,
  "kind" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "makerId" TEXT NOT NULL,
  "checkerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FinancialAdjustment_orderId_idx" ON "FinancialAdjustment" ("orderId");
CREATE TABLE "FinanceRecordEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FinanceRecordEvent_targetId_createdAt_idx" ON "FinanceRecordEvent" ("targetId", "createdAt");
CREATE TABLE "OrderClosureAssessment" (
  "snapshot" JSONB NOT NULL,
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "blockers" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OrderClosureAssessment_orderId_idx" ON "OrderClosureAssessment" ("orderId");

ALTER TABLE "BuyerDepositRecord" ADD CONSTRAINT "deposit_money" CHECK ("amountMillimes" > 0 AND "expectedMillimes" >= 0), ADD CONSTRAINT "deposit_unverified" CHECK ("status" IN ('PENDING_VERIFICATION','REJECTED','DISPUTED') AND "provenance" IN ('SYNTHETIC','PENDING_VERIFICATION'));
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "payout_money" CHECK ("amountMillimes" > 0 AND "amountMillimes" <= "payableSnapshotMillimes"), ADD CONSTRAINT "payout_checker" CHECK ("approverId" IS NULL OR "approverId" <> "requesterId"), ADD CONSTRAINT "payout_status" CHECK ("status" IN ('REQUESTED','APPROVED','EXECUTION_PENDING','VERIFICATION_PENDING','FAILED'));
ALTER TABLE "PayoutExecutionRecord" ADD CONSTRAINT "execution_unverified" CHECK (NOT "bankVerified" AND "status" IN ('VERIFICATION_PENDING','FAILED') AND "amountMillimes" > 0);
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "adjustment_checker" CHECK ("checkerId" IS NULL OR "checkerId" <> "makerId"), ADD CONSTRAINT "adjustment_amount" CHECK ("amountMillimes" > 0);
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "dispute_amount" CHECK ("amountMillimes" > 0);
ALTER TABLE "OrderClosureAssessment" ADD CONSTRAINT "closure_blocked" CHECK ("status" IN ('BLOCKED','NEEDS_REVIEW'));
ALTER TABLE "BuyerDepositRecord" ADD CONSTRAINT "BuyerDepositRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerDepositRecord" ADD CONSTRAINT "BuyerDepositRecord_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "ArtisanPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutExecutionRecord" ADD CONSTRAINT "PayoutExecutionRecord_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PayoutRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "ArtisanPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderClosureAssessment" ADD CONSTRAINT "OrderClosureAssessment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Repair historical projection only; no commercial state is changed.
UPDATE "CommercialOrder" o SET "delivered" = COALESCE((SELECT SUM(c."accepted") FROM "BuyerDeliveryConfirmation" c JOIN "Shipment" s ON s.id=c."shipmentId" WHERE s."orderId"=o.id),0) WHERE EXISTS (SELECT 1 FROM "CommercialRfq" r WHERE r.id=o."rfqId" AND r."procurementManaged"=true);
CREATE FUNCTION "finance_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial evidence history is append-only'; END; $$;
CREATE TRIGGER "finance_event_immutable" BEFORE UPDATE OR DELETE ON "FinanceRecordEvent" FOR EACH ROW EXECUTE FUNCTION "finance_append_only"();
CREATE TRIGGER "finance_execution_immutable" BEFORE UPDATE OR DELETE ON "PayoutExecutionRecord" FOR EACH ROW EXECUTE FUNCTION "finance_append_only"();

CREATE TRIGGER "finance_closure_immutable" BEFORE UPDATE OR DELETE ON "OrderClosureAssessment" FOR EACH ROW EXECUTE FUNCTION "finance_append_only"();
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "payout_approval_metadata" CHECK ("policyVersion"=1 AND ("status"='REQUESTED' OR ("approverId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approverId"<>"requesterId")));
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "adjustment_approval_metadata" CHECK ("status" IN ('PENDING_REVIEW','APPROVED_PENDING_POLICY') AND ("status"='PENDING_REVIEW' OR "checkerId" IS NOT NULL)), ADD CONSTRAINT "adjustment_direction" CHECK ("direction" IN ('INCREASE','DECREASE','REVIEW_ONLY'));
CREATE FUNCTION "finance_adjustment_terms_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Adjustment proposals cannot be deleted'; END IF;
IF ROW(NEW."orderId",NEW."amountMillimes",NEW.kind,NEW.reason,NEW."makerId",NEW.snapshot,NEW.evidence,NEW.direction,NEW."createdAt") IS DISTINCT FROM ROW(OLD."orderId",OLD."amountMillimes",OLD.kind,OLD.reason,OLD."makerId",OLD.snapshot,OLD.evidence,OLD.direction,OLD."createdAt") THEN RAISE EXCEPTION 'Adjustment proposal terms are immutable'; END IF;
RETURN NEW; END; $$;
CREATE TRIGGER "finance_adjustment_terms_immutable" BEFORE UPDATE OR DELETE ON "FinancialAdjustment" FOR EACH ROW EXECUTE FUNCTION "finance_adjustment_terms_immutable"();
ALTER TABLE "BuyerDepositRecord" ADD CONSTRAINT "BuyerDepositRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerDepositRecord" ADD CONSTRAINT "BuyerDepositRecord_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutExecutionRecord" ADD CONSTRAINT "PayoutExecutionRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentDispute" ADD CONSTRAINT "PaymentDispute_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAdjustment" ADD CONSTRAINT "FinancialAdjustment_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecordEvent" ADD CONSTRAINT "FinanceRecordEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderClosureAssessment" ADD CONSTRAINT "OrderClosureAssessment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
