-- In-app notifications for the order journey. Additive only.
BEGIN;

CREATE TABLE "MarketNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MarketNotification_userId_createdAt_idx" ON "MarketNotification"("userId", "createdAt");

COMMIT;
