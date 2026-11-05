CREATE TABLE "CommerceProjection" (
  "orderId" TEXT PRIMARY KEY REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT,
  "definitionVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("definitionVersion" = 1),
  "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metrics" JSONB NOT NULL
);
CREATE TABLE "CommerceNotice" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT,
  "audience" TEXT NOT NULL CHECK ("audience" IN ('BUYER', 'OPERATOR', 'ARTISAN')),
  "scopeId" TEXT NOT NULL,
  "code" TEXT NOT NULL CHECK ("code" LIKE 'commerce.%'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("eventId", "audience", "scopeId")
);
CREATE INDEX "CommerceNotice_audience_scopeId_createdAt_idx" ON "CommerceNotice"("audience", "scopeId", "createdAt");
