-- CreateTable
CREATE TABLE "CommercialRfq" (
    "id" TEXT NOT NULL,
    "buyerOrganizationId" TEXT NOT NULL,
    "operatorOrganizationId" TEXT NOT NULL,
    "craftSkillId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "designRequirements" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "deliveryAt" TIMESTAMP(3) NOT NULL,
    "deliveryLocation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "quoteMillimes" BIGINT,
    "quoteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialRfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrder" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "materialsResolved" BOOLEAN NOT NULL DEFAULT false,
    "dispositionNote" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOffer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "capacityDeclarationId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPayMillimes" BIGINT NOT NULL,
    "estimatedHours" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "materials" TEXT NOT NULL,
    "reworkTerms" TEXT NOT NULL,
    "paymentConditions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "acceptedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialBatch" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "produced" INTEGER NOT NULL DEFAULT 0,
    "submitted" INTEGER NOT NULL DEFAULT 0,
    "approved" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialInspection" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "batchVersion" INTEGER NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "approved" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "pending" INTEGER NOT NULL,
    "submitted" INTEGER NOT NULL,
    "defectReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyntheticPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "batchId" TEXT,
    "kind" TEXT NOT NULL,
    "amountMillimes" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "evidenceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyntheticPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialRfq_buyerOrganizationId_createdAt_idx" ON "CommercialRfq"("buyerOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialRfq_operatorOrganizationId_status_idx" ON "CommercialRfq"("operatorOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_rfqId_key" ON "CommercialOrder"("rfqId");

-- CreateIndex
CREATE INDEX "CommercialOffer_orderId_status_idx" ON "CommercialOffer"("orderId", "status");

-- CreateIndex
CREATE INDEX "CommercialOffer_artisanProfileId_status_idx" ON "CommercialOffer"("artisanProfileId", "status");

-- CreateIndex
CREATE INDEX "CommercialOffer_capacityDeclarationId_status_idx" ON "CommercialOffer"("capacityDeclarationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialBatch_offerId_key" ON "CommercialBatch"("offerId");

-- CreateIndex
CREATE INDEX "CommercialBatch_orderId_idx" ON "CommercialBatch"("orderId");

-- CreateIndex
CREATE INDEX "CommercialBatch_artisanProfileId_status_idx" ON "CommercialBatch"("artisanProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialInspection_batchId_batchVersion_key" ON "CommercialInspection"("batchId", "batchVersion");

-- CreateIndex
CREATE INDEX "SyntheticPayment_orderId_kind_status_idx" ON "SyntheticPayment"("orderId", "kind", "status");

-- CreateIndex
CREATE INDEX "SyntheticPayment_batchId_status_idx" ON "SyntheticPayment"("batchId", "status");

-- AddForeignKey
ALTER TABLE "CommercialRfq" ADD CONSTRAINT "CommercialRfq_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRfq" ADD CONSTRAINT "CommercialRfq_operatorOrganizationId_fkey" FOREIGN KEY ("operatorOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRfq" ADD CONSTRAINT "CommercialRfq_craftSkillId_fkey" FOREIGN KEY ("craftSkillId") REFERENCES "CraftSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_capacityDeclarationId_fkey" FOREIGN KEY ("capacityDeclarationId") REFERENCES "CapacityDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "CommercialOffer_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialBatch" ADD CONSTRAINT "CommercialBatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialBatch" ADD CONSTRAINT "CommercialBatch_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialBatch" ADD CONSTRAINT "CommercialBatch_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialInspection" ADD CONSTRAINT "CommercialInspection_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticPayment" ADD CONSTRAINT "SyntheticPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticPayment" ADD CONSTRAINT "SyntheticPayment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Synthetic-only boundary and durable row-level bounds; cross-row rules run under IAM transaction locks.
ALTER TABLE "CommercialRfq" ADD CONSTRAINT "rfq_synthetic" CHECK (provenance = 'SYNTHETIC'), ADD CONSTRAINT "rfq_quantity" CHECK (quantity BETWEEN 1 AND 1000000), ADD CONSTRAINT "rfq_state" CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','QUOTED','ACCEPTED','DECLINED','EXPIRED')), ADD CONSTRAINT "rfq_money" CHECK ("quoteMillimes" IS NULL OR "quoteMillimes" > 0), ADD CONSTRAINT "rfq_version" CHECK (version > 0);
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "order_synthetic" CHECK (provenance = 'SYNTHETIC'), ADD CONSTRAINT "order_state" CHECK (status IN ('APPROVED','FUNDING_CONFIRMED','PLANNING','IN_PRODUCTION','QUALITY_REVIEW','READY_TO_SHIP','IN_TRANSIT','DELIVERED','BUYER_ACCEPTED','SETTLED','CLOSED','DISPUTED','CANCELLED','AMENDED')), ADD CONSTRAINT "order_counts" CHECK (delivered >= 0 AND version > 0);
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "offer_synthetic" CHECK (provenance = 'SYNTHETIC'), ADD CONSTRAINT "offer_state" CHECK (status IN ('PLANNED','OFFERED','ACCEPTED','DECLINED','EXPIRED')), ADD CONSTRAINT "offer_bounds" CHECK (quantity BETWEEN 1 AND 1000000 AND "unitPayMillimes" > 0 AND version > 0);
ALTER TABLE "CommercialBatch" ADD CONSTRAINT "batch_synthetic" CHECK (provenance = 'SYNTHETIC'), ADD CONSTRAINT "batch_state" CHECK (status IN ('ACCEPTED','MATERIAL_READY','IN_PROGRESS','SUBMITTED','INSPECTION','APPROVED','REWORK_REQUESTED','DISPUTED','COMPLETED')), ADD CONSTRAINT "batch_reconciliation" CHECK (produced >= 0 AND submitted >= 0 AND submitted <= produced AND approved >= 0 AND rejected >= 0 AND pending >= 0 AND approved + rejected + pending = submitted AND version > 0);
ALTER TABLE "CommercialInspection" ADD CONSTRAINT "inspection_reconciliation" CHECK (approved >= 0 AND rejected >= 0 AND pending >= 0 AND approved + rejected + pending = submitted AND "batchVersion" > 0);
ALTER TABLE "SyntheticPayment" ADD CONSTRAINT "payment_synthetic" CHECK (provenance = 'SYNTHETIC'), ADD CONSTRAINT "payment_state" CHECK (status IN ('SCHEDULED','APPROVED','INITIATED','SETTLED','FAILED','CANCELLED','DISPUTED')), ADD CONSTRAINT "payment_bounds" CHECK ("amountMillimes" > 0 AND version > 0), ADD CONSTRAINT "payment_kind" CHECK ((kind = 'BUYER_RECEIPT' AND "batchId" IS NULL) OR (kind = 'ARTISAN_PAYOUT' AND "batchId" IS NOT NULL)), ADD CONSTRAINT "payment_simulated_evidence" CHECK ((status = 'SETTLED' AND "evidenceType" IS NOT NULL AND "evidenceType" = 'SIMULATED_SETTLEMENT') OR (status <> 'SETTLED' AND "evidenceType" IS NULL));
