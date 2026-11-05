BEGIN;
ALTER TABLE "ProductSampleRequest" ADD COLUMN "termsSha256" TEXT, ADD COLUMN "acceptedTermsSha256" TEXT, ADD COLUMN "acceptedById" TEXT, ADD COLUMN "acceptedAt" TIMESTAMP(3), ADD COLUMN "reimburseMaterials" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductSampleRequest" ADD CONSTRAINT "sample_acceptor_user_fk" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ArtisanPayable" ALTER COLUMN "offerId" DROP NOT NULL, ALTER COLUMN "orderId" DROP NOT NULL, ALTER COLUMN "batchId" DROP NOT NULL, ADD COLUMN "sampleRequestId" TEXT;
ALTER TABLE "ArtisanPayable" ADD CONSTRAINT "ArtisanPayable_sampleRequestId_fkey" FOREIGN KEY ("sampleRequestId") REFERENCES "ProductSampleRequest"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "ArtisanPayable_sampleRequestId_key" ON "ArtisanPayable"("sampleRequestId");
ALTER TABLE "ArtisanPayable" ADD CONSTRAINT "payable_source_integrity" CHECK (("sampleRequestId" IS NOT NULL AND "offerId" IS NULL AND "orderId" IS NULL AND "batchId" IS NULL) OR ("sampleRequestId" IS NULL AND "offerId" IS NOT NULL AND "orderId" IS NOT NULL AND "batchId" IS NOT NULL));
ALTER TABLE "ArtisanPayable" DROP CONSTRAINT "ArtisanPayable_milestone_check", ADD CONSTRAINT "ArtisanPayable_milestone_check" CHECK ("milestone" IN ('BUYER_ACCEPTED_PIECE','SAMPLE_COMPLETION','SAMPLE_ACCEPTED_TERMS'));
ALTER TABLE "ArtisanPayable" DROP CONSTRAINT "ArtisanPayable_provenance_check", ADD CONSTRAINT "ArtisanPayable_provenance_check" CHECK ("provenance" IN ('SYNTHETIC','DECLARED'));
-- Preserve preexisting sample obligations in the same authoritative finance ledger. The legacy
-- SamplePayable table remains historical evidence; application code no longer writes to it.
INSERT INTO "ArtisanPayable" ("id","sampleRequestId","artisanProfileId","milestone","policyVersion","quantity","unitPayMillimes","amountMillimes","currency","status","sourceEventId","termsSnapshot","provenance","createdAt") SELECT 'sample-ledger-' || "id", "sampleRequestId", "artisanProfileId", "milestone", "policyVersion",1,"amountMillimes","amountMillimes","currency","status","sourceEventId","termsSnapshot","provenance","createdAt" FROM "SamplePayable" ON CONFLICT ("sampleRequestId") DO NOTHING;
DROP INDEX IF EXISTS "CommercialOrder_productSpecificationRevisionId_key";
CREATE INDEX "CommercialOrder_productSpecificationRevisionId_idx" ON "CommercialOrder"("productSpecificationRevisionId");
ALTER TABLE "ProcurementSample" ADD COLUMN "catalogueApprovalId" TEXT;
ALTER TABLE "ProcurementSample" ADD CONSTRAINT "ProcurementSample_catalogueApprovalId_fkey" FOREIGN KEY ("catalogueApprovalId") REFERENCES "BuyerSampleApproval"("id") ON DELETE RESTRICT;
CREATE INDEX "ProcurementSample_catalogueApprovalId_idx" ON "ProcurementSample"("catalogueApprovalId");
CREATE FUNCTION preserve_approved_catalogue_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Specification history cannot be deleted'; END IF;
 IF OLD."status" IN ('APPROVED','SUPERSEDED') AND (to_jsonb(NEW) - 'status' - 'supersededById') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'supersededById') THEN RAISE EXCEPTION 'Approved specification content is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER approved_catalogue_immutable BEFORE UPDATE OR DELETE ON "ProductSpecificationRevision" FOR EACH ROW EXECUTE FUNCTION preserve_approved_catalogue_content();
CREATE FUNCTION preserve_buyer_sample_decision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Buyer sample decisions are immutable'; END; $$;
CREATE TRIGGER buyer_sample_decision_immutable BEFORE UPDATE OR DELETE ON "BuyerSampleApproval" FOR EACH ROW EXECUTE FUNCTION preserve_buyer_sample_decision();
ALTER TABLE "ProductSpecificationRevision" ADD COLUMN "instructionLanguage" TEXT NOT NULL DEFAULT 'en', ADD COLUMN "instructionTranslations" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CommercialOrder" ADD COLUMN "catalogueProcurementRevisionId" TEXT;
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_catalogueProcurementRevisionId_fkey" FOREIGN KEY ("catalogueProcurementRevisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "CommercialOrder_catalogueProcurementRevisionId_key" ON "CommercialOrder"("catalogueProcurementRevisionId");
ALTER TABLE "ProductSampleRequest" ADD COLUMN "actualMaterialCostMillimes" BIGINT, ADD COLUMN "actualMaterialUsage" TEXT NOT NULL DEFAULT '';
COMMIT;
