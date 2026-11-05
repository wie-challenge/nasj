BEGIN;
-- CreateTable
CREATE TABLE "ProductSpecification" (
    "id" TEXT NOT NULL,
    "craftSkillId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerOrganizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSpecificationRevision" (
    "id" TEXT NOT NULL,
    "specificationId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'cm',
    "materials" JSONB NOT NULL,
    "instructions" TEXT NOT NULL,
    "tolerances" TEXT NOT NULL DEFAULT '',
    "qualityCriteria" TEXT NOT NULL,
    "referenceImages" JSONB NOT NULL,
    "sampleReference" TEXT,
    "authorId" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSpecificationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSampleRequest" (
    "id" TEXT NOT NULL,
    "specificationRevisionId" TEXT NOT NULL,
    "buyerOrganizationId" TEXT NOT NULL,
    "operatorOrganizationId" TEXT NOT NULL,
    "sampleQuantity" INTEGER NOT NULL,
    "responsibleArtisanProfileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "workTerms" TEXT NOT NULL,
    "compensationMillimes" BIGINT,
    "compensationBasis" TEXT NOT NULL DEFAULT 'UNPAID_BY_DEFAULT_BLOCKED',
    "materialResponsibility" TEXT NOT NULL,
    "plannedCompletion" TIMESTAMP(3),
    "actualRecordedMinutes" INTEGER,
    "timeEvidence" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "evidenceReference" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSampleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleEvaluation" (
    "id" TEXT NOT NULL,
    "sampleRequestId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "comments" TEXT NOT NULL DEFAULT '',
    "evidenceReference" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerSampleApproval" (
    "id" TEXT NOT NULL,
    "sampleRequestId" TEXT NOT NULL,
    "specificationRevisionId" TEXT NOT NULL,
    "buyerOrganizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comments" TEXT NOT NULL DEFAULT '',
    "evidenceReference" TEXT NOT NULL,
    "amendmentOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerSampleApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSpecification_craftSkillId_idx" ON "ProductSpecification"("craftSkillId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecification_ownerOrganizationId_productCode_key" ON "ProductSpecification"("ownerOrganizationId", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecificationRevision_supersededById_key" ON "ProductSpecificationRevision"("supersededById");

-- CreateIndex
CREATE INDEX "ProductSpecificationRevision_specificationId_status_idx" ON "ProductSpecificationRevision"("specificationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecificationRevision_specificationId_revisionNumber_key" ON "ProductSpecificationRevision"("specificationId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ProductSampleRequest_buyerOrganizationId_status_idx" ON "ProductSampleRequest"("buyerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "ProductSampleRequest_specificationRevisionId_idx" ON "ProductSampleRequest"("specificationRevisionId");

-- CreateIndex
CREATE INDEX "SampleEvaluation_sampleRequestId_createdAt_idx" ON "SampleEvaluation"("sampleRequestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerSampleApproval_amendmentOfId_key" ON "BuyerSampleApproval"("amendmentOfId");

-- CreateIndex
CREATE INDEX "BuyerSampleApproval_buyerOrganizationId_createdAt_idx" ON "BuyerSampleApproval"("buyerOrganizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_craftSkillId_fkey" FOREIGN KEY ("craftSkillId") REFERENCES "CraftSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecificationRevision" ADD CONSTRAINT "ProductSpecificationRevision_specificationId_fkey" FOREIGN KEY ("specificationId") REFERENCES "ProductSpecification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecificationRevision" ADD CONSTRAINT "ProductSpecificationRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecificationRevision" ADD CONSTRAINT "ProductSpecificationRevision_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecificationRevision" ADD CONSTRAINT "ProductSpecificationRevision_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecificationRevision" ADD CONSTRAINT "ProductSpecificationRevision_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ProductSpecificationRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSampleRequest" ADD CONSTRAINT "ProductSampleRequest_specificationRevisionId_fkey" FOREIGN KEY ("specificationRevisionId") REFERENCES "ProductSpecificationRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSampleRequest" ADD CONSTRAINT "ProductSampleRequest_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSampleRequest" ADD CONSTRAINT "ProductSampleRequest_operatorOrganizationId_fkey" FOREIGN KEY ("operatorOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSampleRequest" ADD CONSTRAINT "ProductSampleRequest_responsibleArtisanProfileId_fkey" FOREIGN KEY ("responsibleArtisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSampleRequest" ADD CONSTRAINT "ProductSampleRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleEvaluation" ADD CONSTRAINT "SampleEvaluation_sampleRequestId_fkey" FOREIGN KEY ("sampleRequestId") REFERENCES "ProductSampleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleEvaluation" ADD CONSTRAINT "SampleEvaluation_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerSampleApproval" ADD CONSTRAINT "BuyerSampleApproval_sampleRequestId_fkey" FOREIGN KEY ("sampleRequestId") REFERENCES "ProductSampleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerSampleApproval" ADD CONSTRAINT "BuyerSampleApproval_specificationRevisionId_fkey" FOREIGN KEY ("specificationRevisionId") REFERENCES "ProductSpecificationRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerSampleApproval" ADD CONSTRAINT "BuyerSampleApproval_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerSampleApproval" ADD CONSTRAINT "BuyerSampleApproval_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerSampleApproval" ADD CONSTRAINT "BuyerSampleApproval_amendmentOfId_fkey" FOREIGN KEY ("amendmentOfId") REFERENCES "BuyerSampleApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
