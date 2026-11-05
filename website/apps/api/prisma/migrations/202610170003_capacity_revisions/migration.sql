-- Preserve all declaration values; explicitly mark historical revisions.
ALTER TABLE "CapacityDeclaration" ADD COLUMN "supersededAt" TIMESTAMP(3);
-- If an earlier deployment contains overlapping declarations, latest declaration wins.
-- Metadata-only backfill preserves original quantity, effective dates and provenance.
UPDATE "CapacityDeclaration" old SET "supersededAt" = now()
WHERE EXISTS (
 SELECT 1 FROM "CapacityDeclaration" newer
 WHERE newer."artisanProfileId" = old."artisanProfileId"
 AND newer."craftSkillId" = old."craftSkillId" AND newer."unitType" = old."unitType"
 AND newer."effectiveFrom" < old."effectiveTo" AND newer."effectiveTo" > old."effectiveFrom"
 AND (newer."createdAt",newer.id) > (old."createdAt",old.id)
);
CREATE INDEX "capacity_current_scope" ON "CapacityDeclaration" ("artisanProfileId","craftSkillId","unitType","effectiveFrom") WHERE "supersededAt" IS NULL;
