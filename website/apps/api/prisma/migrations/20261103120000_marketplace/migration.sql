-- Marketplace: products, cart, orders and tracking. Additive only.
BEGIN;

CREATE TABLE "MarketFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketProduct" (
    "id" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "craft" TEXT NOT NULL,
    "priceMillimes" BIGINT NOT NULL,
    "artisanPayMillimes" BIGINT NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "imagePath" TEXT,
    "imageFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketCartItem" (
    "id" TEXT NOT NULL,
    "buyerOrgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCartItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "buyerOrgId" TEXT NOT NULL,
    "associationId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "note" TEXT,
    "neededBy" TIMESTAMP(3),
    "photoFileId" TEXT,
    "quantity" INTEGER NOT NULL,
    "totalMillimes" BIGINT,
    "artisanPayMillimes" BIGINT,
    "priceStatus" TEXT NOT NULL DEFAULT 'NOT_NEEDED',
    "qualityStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    "invoiceCheckedAt" TIMESTAMP(3),
    "invoiceCheckedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMillimes" BIGINT NOT NULL,
    "unitPayMillimes" BIGINT NOT NULL,

    CONSTRAINT "MarketOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketOrderArtisan" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketOrderArtisan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketFile_organizationId_purpose_createdAt_idx" ON "MarketFile"("organizationId", "purpose", "createdAt");

CREATE INDEX "MarketProduct_status_craft_idx" ON "MarketProduct"("status", "craft");

CREATE INDEX "MarketProduct_associationId_status_idx" ON "MarketProduct"("associationId", "status");

CREATE UNIQUE INDEX "MarketCartItem_buyerOrgId_productId_key" ON "MarketCartItem"("buyerOrgId", "productId");

CREATE UNIQUE INDEX "MarketOrder_number_key" ON "MarketOrder"("number");

CREATE INDEX "MarketOrder_buyerOrgId_createdAt_idx" ON "MarketOrder"("buyerOrgId", "createdAt");

CREATE INDEX "MarketOrder_associationId_status_idx" ON "MarketOrder"("associationId", "status");

CREATE INDEX "MarketOrder_status_createdAt_idx" ON "MarketOrder"("status", "createdAt");

CREATE INDEX "MarketOrderItem_orderId_idx" ON "MarketOrderItem"("orderId");

CREATE INDEX "MarketOrderEvent_orderId_createdAt_idx" ON "MarketOrderEvent"("orderId", "createdAt");

CREATE UNIQUE INDEX "MarketOrderArtisan_orderId_artisanProfileId_key" ON "MarketOrderArtisan"("orderId", "artisanProfileId");

ALTER TABLE "MarketFile" ADD CONSTRAINT "MarketFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketProduct" ADD CONSTRAINT "MarketProduct_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketCartItem" ADD CONSTRAINT "MarketCartItem_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketCartItem" ADD CONSTRAINT "MarketCartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketOrderItem" ADD CONSTRAINT "MarketOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketOrderItem" ADD CONSTRAINT "MarketOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketOrderEvent" ADD CONSTRAINT "MarketOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketOrderArtisan" ADD CONSTRAINT "MarketOrderArtisan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketOrderArtisan" ADD CONSTRAINT "MarketOrderArtisan_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER SEQUENCE "MarketOrder_number_seq" RESTART WITH 1001;
ALTER TABLE "MarketProduct" ADD CONSTRAINT "MarketProduct_status_check" CHECK ("status" IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'));
ALTER TABLE "MarketProduct" ADD CONSTRAINT "MarketProduct_pay_check" CHECK ("artisanPayMillimes" >= 0 AND "artisanPayMillimes" <= "priceMillimes");
ALTER TABLE "MarketCartItem" ADD CONSTRAINT "MarketCartItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_status_check" CHECK ("status" IN ('SENT', 'AWAITING_APPROVAL', 'WORKING', 'AT_NASJ', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'));

COMMIT;
