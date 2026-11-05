BEGIN;
ALTER TABLE "ProductionException" ADD COLUMN "affectedQuantity" INTEGER;
ALTER TABLE "ProductionException" ADD COLUMN "affectedDate" TIMESTAMP(3);
COMMIT;
