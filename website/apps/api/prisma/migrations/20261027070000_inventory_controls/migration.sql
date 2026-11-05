-- Additive controlled inventory; no existing synthetic attestation creates stock.
BEGIN;
-- CreateTable
CREATE TABLE "MaterialLot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "lotReference" TEXT NOT NULL,
    "supplierReference" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warehouse" TEXT NOT NULL DEFAULT 'Organization controlled stock',
    "receivedMilli" BIGINT NOT NULL,
    "availableMilli" BIGINT NOT NULL,
    "reservedMilli" BIGINT NOT NULL DEFAULT 0,
    "issuedMilli" BIGINT NOT NULL DEFAULT 0,
    "consumedMilli" BIGINT NOT NULL DEFAULT 0,
    "damagedMilli" BIGINT NOT NULL DEFAULT 0,
    "returnedMilli" BIGINT NOT NULL DEFAULT 0,
    "quarantineMilli" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantityMilli" BIGINT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReservation" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "quantityMilli" BIGINT NOT NULL,
    "remainingMilli" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialHandover" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "receiverOrganizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "quantityMilli" BIGINT NOT NULL,
    "consumedMilli" BIGINT NOT NULL DEFAULT 0,
    "returnedMilli" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING_RECEIVER_CONFIRMATION',
    "evidenceReference" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReceipt" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "receivedMilli" BIGINT NOT NULL,
    "damagedMilli" BIGINT NOT NULL,
    "shortageMilli" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReturn" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantityMilli" BIGINT NOT NULL,
    "condition" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'AWAITING_INSPECTION',
    "dispositionActorId" TEXT,
    "dispositionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReconciliation" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "shortageDisposition" TEXT NOT NULL DEFAULT 'LOSS_SEGREGATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialLot_organizationId_materialCode_idx" ON "MaterialLot"("organizationId", "materialCode");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialLot_organizationId_lotReference_key" ON "MaterialLot"("organizationId", "lotReference");

-- CreateIndex
CREATE INDEX "InventoryMovement_lotId_createdAt_idx" ON "InventoryMovement"("lotId", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialReservation_batchId_idx" ON "MaterialReservation"("batchId");

-- CreateIndex
CREATE INDEX "MaterialReservation_lotId_idx" ON "MaterialReservation"("lotId");

-- CreateIndex
CREATE INDEX "MaterialHandover_receiverOrganizationId_createdAt_idx" ON "MaterialHandover"("receiverOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialHandover_batchId_idx" ON "MaterialHandover"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReceipt_handoverId_key" ON "MaterialReceipt"("handoverId");

-- CreateIndex
CREATE INDEX "MaterialReturn_lotId_idx" ON "MaterialReturn"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReconciliation_handoverId_key" ON "MaterialReconciliation"("handoverId");
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_quantity_check" CHECK (
 "receivedMilli" > 0 AND "availableMilli" >= 0 AND "reservedMilli" >= 0 AND "issuedMilli" >= 0 AND "consumedMilli" >= 0 AND "damagedMilli" >= 0 AND "returnedMilli" >= 0 AND "quarantineMilli" >= 0
 AND "receivedMilli" = "availableMilli" + "reservedMilli" + "issuedMilli" + "consumedMilli" + "damagedMilli" + "quarantineMilli"
);
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_provenance_check" CHECK ("provenance" IN ('SYNTHETIC','PENDING_VERIFICATION'));
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_unit_check" CHECK ("unit" IN ('METERS','PIECES','UNITS'));
ALTER TABLE "MaterialLot" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialLot" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "InventoryMovement" ADD FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE RESTRICT;
ALTER TABLE "InventoryMovement" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "InventoryMovement" ADD CHECK ("quantityMilli" >= 0);
ALTER TABLE "MaterialReservation" ADD FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReservation" ADD FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReservation" ADD FOREIGN KEY ("requirementId") REFERENCES "BatchMaterialRequirement"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReservation" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReservation" ADD CHECK ("quantityMilli" >= 0 AND "remainingMilli" >= 0 AND "remainingMilli" <= "quantityMilli");
ALTER TABLE "MaterialReservation" ADD CHECK ("status" IN ('RESERVED','ISSUED','PARTIALLY_ISSUED','RELEASED','PARTIALLY_ISSUED_RELEASED'));
ALTER TABLE "MaterialHandover" ADD FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialHandover" ADD FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialHandover" ADD FOREIGN KEY ("reservationId") REFERENCES "MaterialReservation"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialHandover" ADD FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialHandover" ADD FOREIGN KEY ("receiverOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialHandover" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialHandover" ADD CHECK ("quantityMilli" > 0 AND "consumedMilli" >= 0 AND "returnedMilli" >= 0 AND "consumedMilli" + "returnedMilli" <= "quantityMilli");
ALTER TABLE "MaterialHandover" ADD CHECK ("status" IN ('PENDING_RECEIVER_CONFIRMATION','PENDING_INDEPENDENT_VERIFICATION','RECEIVED_CONFIRMED','DISCREPANCY_REPORTED','DISCREPANCY_RECONCILED'));
ALTER TABLE "MaterialReceipt" ADD FOREIGN KEY ("handoverId") REFERENCES "MaterialHandover"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReceipt" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReceipt" ADD FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReceipt" ADD CHECK ("receivedMilli" >= 0 AND "damagedMilli" >= 0 AND "shortageMilli" >= 0 AND "damagedMilli" <= "receivedMilli");
ALTER TABLE "MaterialReceipt" ADD CHECK (("source"='ARTISAN_DIRECT' AND "verificationStatus"='AUTHENTICATED_ACKNOWLEDGEMENT' AND "method"='DIRECT') OR ("source"='COORDINATOR_REPORTED' AND "verificationStatus"='PENDING_INDEPENDENT_VERIFICATION' AND "method" IN ('PHONE','IN_PERSON')));
ALTER TABLE "MaterialReturn" ADD FOREIGN KEY ("handoverId") REFERENCES "MaterialHandover"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReturn" ADD FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReturn" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReturn" ADD FOREIGN KEY ("dispositionActorId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReturn" ADD CHECK ("quantityMilli" > 0 AND "condition" IN ('DAMAGED','UNUSED','DEFECTIVE') AND "disposition" IN ('AWAITING_INSPECTION','RESTOCK','DAMAGED') AND ("disposition" <> 'RESTOCK' OR "condition"='UNUSED'));
CREATE FUNCTION inventory_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Inventory movements and receipts are append only'; END; $$;
CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION inventory_history_immutable();
CREATE TRIGGER material_receipt_immutable BEFORE UPDATE OR DELETE ON "MaterialReceipt" FOR EACH ROW EXECUTE FUNCTION inventory_history_immutable();
ALTER TABLE "MaterialReconciliation" ADD FOREIGN KEY ("handoverId") REFERENCES "MaterialHandover"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReconciliation" ADD FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE TRIGGER material_reconciliation_immutable BEFORE UPDATE OR DELETE ON "MaterialReconciliation" FOR EACH ROW EXECUTE FUNCTION inventory_history_immutable();
-- CreateTable
CREATE TABLE "MaterialReadiness" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialReadiness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReadiness_requirementId_key" ON "MaterialReadiness"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReadiness_batchId_materialCode_key" ON "MaterialReadiness"("batchId", "materialCode");
ALTER TABLE "MaterialReadiness" ADD FOREIGN KEY ("requirementId") REFERENCES "BatchMaterialRequirement"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReadiness" ADD FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT;
ALTER TABLE "MaterialReadiness" ADD CHECK ("readiness" IN ('DISCREPANCY_BLOCKED','RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION','SYNTHETIC_RECEIPT_ACKNOWLEDGED','RECEIPT_INCOMPLETE'));
COMMIT;
