-- Additive metadata only: no declarations, obligations, identities or sessions are deleted.
BEGIN;
ALTER TABLE "CapacityDeclaration" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CapacityDeclaration" ADD COLUMN "previousDeclarationId" TEXT;
WITH revisions AS (
  SELECT id,
    ROW_NUMBER() OVER w AS revision,
    LAG(id) OVER w AS predecessor
  FROM "CapacityDeclaration"
  WINDOW w AS (PARTITION BY "artisanProfileId", "craftSkillId", "unitType", "effectiveFrom", "effectiveTo"
               ORDER BY "createdAt", id)
)
UPDATE "CapacityDeclaration" c SET "version" = r.revision, "previousDeclarationId" = r.predecessor
FROM revisions r WHERE c.id = r.id;
CREATE UNIQUE INDEX "CapacityDeclaration_previousDeclarationId_key" ON "CapacityDeclaration"("previousDeclarationId");
ALTER TABLE "CapacityDeclaration" ADD CONSTRAINT "CapacityDeclaration_previousDeclarationId_fkey"
FOREIGN KEY ("previousDeclarationId") REFERENCES "CapacityDeclaration"(id) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "CapacityDeclaration" ADD CONSTRAINT "CapacityDeclaration_version_positive" CHECK (version > 0);
COMMIT;
