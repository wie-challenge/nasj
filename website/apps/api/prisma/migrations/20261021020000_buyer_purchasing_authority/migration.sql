BEGIN;
-- Existing explicit grants retain their authority. A scoped denial can remove default purchasing permission.
ALTER TABLE "MembershipPermission" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
COMMIT;
