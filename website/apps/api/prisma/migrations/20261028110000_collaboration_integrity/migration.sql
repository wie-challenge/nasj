BEGIN;
ALTER TABLE "CommercialOffer" DROP CONSTRAINT "offer_state";
ALTER TABLE "CommercialOffer" ADD CONSTRAINT "offer_state" CHECK (status IN ('PLANNED','PREPARED','OFFERED','ACCEPTED','DECLINED','EXPIRED','REPLACED'));
ALTER TABLE "CommercialOffer" ADD COLUMN "deliveryDeadline" TIMESTAMP(3);
ALTER TABLE "Counteroffer" ADD COLUMN "revisedOfferId" TEXT, ADD COLUMN "originalTerms" JSONB;
CREATE UNIQUE INDEX "Counteroffer_revisedOfferId_key" ON "Counteroffer"("revisedOfferId");
ALTER TABLE "Counteroffer" ADD CONSTRAINT "Counteroffer_revisedOfferId_fkey" FOREIGN KEY ("revisedOfferId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvailabilityPause" ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SupportTicket" ADD COLUMN "privacyScope" TEXT NOT NULL DEFAULT 'SUPPORT_ONLY';
ALTER TABLE "NotificationDelivery" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en', ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "SupportTicketAttachment" (
"id" TEXT NOT NULL PRIMARY KEY, "ticketId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "filename" TEXT NOT NULL,
"mime" TEXT NOT NULL, "bytes" BYTEA NOT NULL, "sha256" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "SupportTicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT,
CONSTRAINT "SupportTicketAttachment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "SupportTicketAttachment_ticketId_createdAt_idx" ON "SupportTicketAttachment"("ticketId", "createdAt");
COMMIT;
