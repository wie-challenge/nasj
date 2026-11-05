BEGIN;
-- Abort with identities requiring an owner-reviewed decision; never delete or reassign.
DO $$ DECLARE conflicts text; BEGIN
 SELECT string_agg(x."userId", ', ') INTO conflicts FROM (
 SELECT m."userId" FROM "OrganizationMember" m JOIN "MembershipRole" r ON r."membershipId"=m.id
 WHERE m.status='ACTIVE' AND r.role='ASSOCIATION_COORDINATOR' GROUP BY m."userId" HAVING count(*)>1) x;
 IF conflicts IS NOT NULL THEN RAISE EXCEPTION 'Coordinator conflict report (user IDs): %', conflicts; END IF;
 SELECT string_agg(x."artisanProfileId", ', ') INTO conflicts FROM (
 SELECT "artisanProfileId" FROM "AssociationMembership" WHERE status='ACTIVE' AND "endedAt" IS NULL
 GROUP BY "artisanProfileId" HAVING count(*)>1) x;
 IF conflicts IS NOT NULL THEN RAISE EXCEPTION 'Artisan management conflict report (profile IDs): %', conflicts; END IF;
END $$;
-- AlterEnum
ALTER TYPE "OrganizationType" ADD VALUE 'PARTNER_COOPERATIVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessRole" ADD VALUE 'BUYER_REPRESENTATIVE';
ALTER TYPE "BusinessRole" ADD VALUE 'HIRFACARE_OPERATOR';

-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "isCoordinator" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ArtisanProfile" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "participantStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MembershipPermission" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtisanManagement" (
    "id" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,

    CONSTRAINT "ArtisanManagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtisanAssignment" (
    "id" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,

    CONSTRAINT "ArtisanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationPolicy" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "methods" TEXT[],
    "reviewReference" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingAuthorization" (
    "id" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "language" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "witnessReference" TEXT,
    "evidenceReference" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAssignment" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OperatorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPermission_membershipId_permission_key" ON "MembershipPermission"("membershipId", "permission");

-- CreateIndex
CREATE INDEX "ArtisanManagement_organizationId_endedAt_idx" ON "ArtisanManagement"("organizationId", "endedAt");

-- CreateIndex
CREATE INDEX "ArtisanManagement_artisanProfileId_endedAt_idx" ON "ArtisanManagement"("artisanProfileId", "endedAt");

-- CreateIndex
CREATE INDEX "ArtisanAssignment_coordinatorId_organizationId_endedAt_idx" ON "ArtisanAssignment"("coordinatorId", "organizationId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationPolicy_version_key" ON "AuthorizationPolicy"("version");

-- CreateIndex
CREATE INDEX "OnboardingAuthorization_artisanProfileId_purpose_withdrawnA_idx" ON "OnboardingAuthorization"("artisanProfileId", "purpose", "withdrawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAssignment_operatorId_organizationId_key" ON "OperatorAssignment"("operatorId", "organizationId");

-- AddForeignKey
ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtisanManagement" ADD CONSTRAINT "ArtisanManagement_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtisanAssignment" ADD CONSTRAINT "ArtisanAssignment_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAuthorization" ADD CONSTRAINT "OnboardingAuthorization_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAuthorization" ADD CONSTRAINT "OnboardingAuthorization_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AuthorizationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "ArtisanProfile" SET "createdById"="userId" WHERE "createdById" IS NULL;
UPDATE "OrganizationMember" m SET "isCoordinator"=true WHERE EXISTS(SELECT 1 FROM "MembershipRole" r WHERE r."membershipId"=m.id AND r.role='ASSOCIATION_COORDINATOR');
CREATE UNIQUE INDEX "one_active_coordinator_affiliation" ON "OrganizationMember"("userId") WHERE "isCoordinator" AND status='ACTIVE';
CREATE UNIQUE INDEX "one_active_artisan_management" ON "ArtisanManagement"("artisanProfileId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "one_active_artisan_assignment" ON "ArtisanAssignment"("artisanProfileId") WHERE "endedAt" IS NULL;
INSERT INTO "ArtisanManagement"(id,"artisanProfileId","organizationId","startedAt",reason,"recordedById")
 SELECT 'migrated-'||a.id,a."artisanProfileId",a."organizationId",a."startedAt",'Preserved existing consent-linked relationship',p."userId"
 FROM "AssociationMembership" a JOIN "ArtisanProfile" p ON p.id=a."artisanProfileId" WHERE a.status='ACTIVE' AND a."endedAt" IS NULL;
-- Preserve existing quotation acceptance authority as explicit grants, without giving it to future representatives.
INSERT INTO "MembershipPermission"(id,"membershipId",permission,"grantedById",reason)
 SELECT 'legacy-approval-'||m.id,m.id,'buyer.quotation.approve',r."assignedByUserId",'Preserved pre-migration buyer approval authority'
 FROM "OrganizationMember" m JOIN "MembershipRole" r ON r."membershipId"=m.id JOIN "Organization" o ON o.id=m."organizationId"
 WHERE r.role='BUYER' AND o.type='BUYER_BUSINESS';
CREATE FUNCTION sync_coordinator_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='OrganizationMember' THEN
 NEW."isCoordinator" := EXISTS(SELECT 1 FROM "MembershipRole" WHERE "membershipId"=NEW.id AND role='ASSOCIATION_COORDINATOR'); RETURN NEW;
 END IF;
 IF TG_OP!='DELETE' THEN UPDATE "OrganizationMember" SET "isCoordinator"=true WHERE id=NEW."membershipId"; END IF;
 IF TG_OP!='INSERT' THEN UPDATE "OrganizationMember" SET "isCoordinator"=false WHERE id=OLD."membershipId"; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER membership_coordinator_marker BEFORE INSERT OR UPDATE ON "OrganizationMember" FOR EACH ROW EXECUTE FUNCTION sync_coordinator_marker();
CREATE TRIGGER role_coordinator_marker AFTER INSERT OR UPDATE OR DELETE ON "MembershipRole" FOR EACH ROW EXECUTE FUNCTION sync_coordinator_marker();
ALTER TABLE "ArtisanProfile" ADD CONSTRAINT "ArtisanProfile_createdById_fk" FOREIGN KEY("createdById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "ArtisanManagement" ADD CONSTRAINT "ArtisanManagement_organizationId_fk" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
ALTER TABLE "ArtisanManagement" ADD CONSTRAINT "ArtisanManagement_recordedById_fk" FOREIGN KEY("recordedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "ArtisanAssignment" ADD CONSTRAINT "ArtisanAssignment_organizationId_fk" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
ALTER TABLE "ArtisanAssignment" ADD CONSTRAINT "ArtisanAssignment_coordinatorId_fk" FOREIGN KEY("coordinatorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "ArtisanAssignment" ADD CONSTRAINT "ArtisanAssignment_assignedById_fk" FOREIGN KEY("assignedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "OnboardingAuthorization" ADD CONSTRAINT "OnboardingAuthorization_recordedById_fk" FOREIGN KEY("recordedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "AuthorizationPolicy" ADD CONSTRAINT "AuthorizationPolicy_reviewedById_fk" FOREIGN KEY("reviewedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_grantedById_fk" FOREIGN KEY("grantedById") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_operatorId_fk" FOREIGN KEY("operatorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_organizationId_fk" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_assignedById_fk" FOREIGN KEY("assignedById") REFERENCES "User"(id) ON DELETE RESTRICT;

ALTER TABLE "CapacityDeclaration" ADD COLUMN "authorizationId" TEXT;
ALTER TABLE "CapacityDeclaration" ADD CONSTRAINT "CapacityDeclaration_authorizationId_fk" FOREIGN KEY("authorizationId") REFERENCES "OnboardingAuthorization"(id) ON DELETE RESTRICT;
CREATE TABLE "ParticipantConcern" (
 id TEXT PRIMARY KEY, "subjectReference" TEXT NOT NULL, "concernType" TEXT NOT NULL,
 description TEXT NOT NULL, "contactMethod" TEXT, status TEXT NOT NULL DEFAULT 'OPEN',
 "reviewedById" TEXT REFERENCES "User"(id) ON DELETE RESTRICT, resolution TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMP(3)
);
CREATE INDEX "ParticipantConcern_status_createdAt_idx" ON "ParticipantConcern"(status,"createdAt");

CREATE UNIQUE INDEX "one_active_legacy_artisan_association" ON "AssociationMembership"("artisanProfileId") WHERE status='ACTIVE' AND "endedAt" IS NULL;

COMMIT;
