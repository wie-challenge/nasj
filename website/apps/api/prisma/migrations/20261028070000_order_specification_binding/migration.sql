BEGIN;
-- One specification authority. The binding lives on the mutable order header, not on the
-- append-only ProcurementRevision (see the ProcurementRevision_immutable trigger).
ALTER TABLE "CommercialOrder" ADD COLUMN "productSpecificationRevisionId" TEXT;
CREATE UNIQUE INDEX "CommercialOrder_productSpecificationRevisionId_key"
  ON "CommercialOrder"("productSpecificationRevisionId");
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_productSpecificationRevisionId_fkey"
  FOREIGN KEY ("productSpecificationRevisionId") REFERENCES "ProductSpecificationRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
