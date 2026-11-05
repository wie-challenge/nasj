-- Marketplace journey: billing details, association steps, delivery details, ratings and artisane pay.
-- Additive only.
BEGIN;

CREATE TABLE "MarketBillingProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "buyerOrgId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "billingAddress" TEXT NOT NULL,
  "shippingAddress" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketBillingProfile_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketBillingProfile_paymentMethod_check" CHECK ("paymentMethod" IN ('DHMAD', 'BANK_TRANSFER'))
);
CREATE UNIQUE INDEX "MarketBillingProfile_buyerOrgId_key" ON "MarketBillingProfile"("buyerOrgId");

CREATE TABLE "MarketArtisanDetail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "artisanProfileId" TEXT NOT NULL,
  "idNumber" TEXT NOT NULL,
  "phone" TEXT,
  CONSTRAINT "MarketArtisanDetail_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketArtisanDetail_artisanProfileId_key" ON "MarketArtisanDetail"("artisanProfileId");

CREATE TABLE "MarketOrderRating" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "stars" INTEGER NOT NULL,
  "qualityStars" INTEGER,
  "comment" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketOrderRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketOrderRating_role_check" CHECK ("role" IN ('COMPANY', 'ASSOCIATION')),
  CONSTRAINT "MarketOrderRating_stars_check" CHECK ("stars" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "MarketOrderRating_orderId_role_key" ON "MarketOrderRating"("orderId", "role");

ALTER TABLE "MarketProduct" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "MarketProduct" DROP CONSTRAINT "MarketProduct_status_check";
ALTER TABLE "MarketProduct" ADD CONSTRAINT "MarketProduct_status_check" CHECK ("status" IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'));

ALTER TABLE "MarketOrder" ADD COLUMN "billingSnapshot" JSONB;
ALTER TABLE "MarketOrder" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "MarketOrder" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "MarketOrder" ADD COLUMN "estimatedFinishAt" TIMESTAMP(3);
ALTER TABLE "MarketOrder" ADD COLUMN "almostReadyAt" TIMESTAMP(3);
ALTER TABLE "MarketOrder" ADD COLUMN "associationDelivery" JSONB;
ALTER TABLE "MarketOrder" ADD COLUMN "nasjDelivery" JSONB;
ALTER TABLE "MarketOrder" ADD COLUMN "qrToken" TEXT;
CREATE UNIQUE INDEX "MarketOrder_qrToken_key" ON "MarketOrder"("qrToken");

ALTER TABLE "MarketOrderArtisan" ADD COLUMN "payMillimes" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "MarketOrderArtisan" ADD COLUMN "paidRecordedAt" TIMESTAMP(3);
ALTER TABLE "MarketOrderArtisan" ADD COLUMN "paymentCheckedAt" TIMESTAMP(3);
ALTER TABLE "MarketOrderArtisan" ADD COLUMN "paymentCheckedById" TEXT;

COMMIT;
