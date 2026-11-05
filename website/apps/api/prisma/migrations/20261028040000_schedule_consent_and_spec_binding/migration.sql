BEGIN;
-- Contractual consent for a schedule change requires every affected party, not platform authority.
ALTER TABLE "ScheduleRevision" ADD COLUMN "buyerApprovedById" TEXT;
ALTER TABLE "ScheduleRevision" ADD COLUMN "buyerApprovedAt" TIMESTAMP(3);
ALTER TABLE "ScheduleRevision" ADD COLUMN "artisanApprovedById" TEXT;
ALTER TABLE "ScheduleRevision" ADD COLUMN "artisanApprovedAt" TIMESTAMP(3);

ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_buyerApprovedById_fkey"
  FOREIGN KEY ("buyerApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleRevision" ADD CONSTRAINT "ScheduleRevision_artisanApprovedById_fkey"
  FOREIGN KEY ("artisanApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
