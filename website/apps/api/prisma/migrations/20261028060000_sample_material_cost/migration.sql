BEGIN;
ALTER TABLE "ProductSampleRequest" ADD COLUMN "materialCostMillimes" BIGINT;
COMMIT;
