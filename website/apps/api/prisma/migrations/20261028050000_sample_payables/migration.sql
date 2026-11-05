BEGIN;
-- A completed paid sample creates a recognised obligation even if the sample or bulk order is
-- rejected. It is a separate record from ArtisanPayable, which requires an accepted batch.
CREATE TABLE "SamplePayable" (
    "id" TEXT NOT NULL,
    "sampleRequestId" TEXT NOT NULL,
    "offerId" TEXT,
    "artisanProfileId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL DEFAULT 'SAMPLE_ACCEPTED_TERMS',
    "amountMillimes" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TND',
    "status" TEXT NOT NULL DEFAULT 'RECOGNIZED',
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceEventId" TEXT NOT NULL,
    "termsSnapshot" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SamplePayable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SamplePayable_sampleRequestId_milestone_key" ON "SamplePayable"("sampleRequestId", "milestone");
CREATE INDEX "SamplePayable_artisanProfileId_idx" ON "SamplePayable"("artisanProfileId");
ALTER TABLE "SamplePayable" ADD CONSTRAINT "SamplePayable_sampleRequestId_fkey" FOREIGN KEY ("sampleRequestId") REFERENCES "ProductSampleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SamplePayable" ADD CONSTRAINT "SamplePayable_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SamplePayable" ADD CONSTRAINT "SamplePayable_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
