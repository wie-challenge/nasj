-- Additive production eligibility, prepared offers and assisted-decision records.
-- Existing commercial, capacity and quotation rows are preserved.
BEGIN;
CREATE TABLE "EligibilityAssessment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "unknowns" JSONB NOT NULL,
    "knownRemaining" DECIMAL(12,2),
    "unitType" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EligibilityAssessment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AssistedOfferDecision" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "reportedDecision" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistedOfferDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EligibilityAssessment_orderId_version_artisanProfileId_key" ON "EligibilityAssessment"("orderId", "version", "artisanProfileId");
CREATE INDEX "EligibilityAssessment_orderId_createdAt_idx" ON "EligibilityAssessment"("orderId", "createdAt");
CREATE UNIQUE INDEX "AssistedOfferDecision_offerId_key" ON "AssistedOfferDecision"("offerId");
CREATE INDEX "AssistedOfferDecision_artisanProfileId_idx" ON "AssistedOfferDecision"("artisanProfileId");
ALTER TABLE "CommercialOffer" ADD COLUMN "quoteId" TEXT,
ADD COLUMN "eligibilityAssessmentId" TEXT,
ADD COLUMN "compensationMethod" TEXT,
ADD COLUMN "collectionArrangement" TEXT,
ADD COLUMN "instructions" TEXT,
ADD COLUMN "termsSha256" TEXT,
ADD COLUMN "associationOrganizationId" TEXT;
CREATE INDEX "CommercialOffer_eligibilityAssessmentId_idx" ON "CommercialOffer"("eligibilityAssessmentId");
ALTER TABLE "CommercialOffer" DROP CONSTRAINT "offer_state";
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "offer_state" CHECK (status IN ('PLANNED','PREPARED','OFFERED','ACCEPTED','DECLINED','EXPIRED'));
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_decision_known" CHECK (decision IN ('ELIGIBLE', 'INELIGIBLE', 'NEEDS_REVIEW'));
ALTER TABLE "AssistedOfferDecision" ADD CONSTRAINT "AssistedOfferDecision_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistedOfferDecision" ADD CONSTRAINT "AssistedOfferDecision_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistedOfferDecision" ADD CONSTRAINT "AssistedOfferDecision_reported" CHECK ("reportedDecision" IN ('ACCEPT', 'DECLINE') AND method = 'IN_PERSON_REPORTED' AND "verificationStatus" = 'PENDING_UNAPPROVED_METHOD');
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ProcurementQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_eligibilityAssessmentId_fkey" FOREIGN KEY ("eligibilityAssessmentId") REFERENCES "EligibilityAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_associationOrganizationId_fkey" FOREIGN KEY ("associationOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER "EligibilityAssessment_immutable" BEFORE UPDATE OR DELETE ON "EligibilityAssessment" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "AssistedOfferDecision_immutable" BEFORE UPDATE OR DELETE ON "AssistedOfferDecision" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
COMMENT ON COLUMN "AssistedOfferDecision"."verificationStatus" IS 'Pending until an approved pilot verification method exists. A coordinator report is not artisan acceptance.';
COMMIT;
