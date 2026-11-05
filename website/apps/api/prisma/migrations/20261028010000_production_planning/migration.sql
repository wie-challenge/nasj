BEGIN;
-- CreateTable
CREATE TABLE "RecommendationPolicy" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "excluded" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationSnapshot" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requiredQuantity" INTEGER NOT NULL,
    "craftSkillId" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "suggestion" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationPlan" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "requiredQuantity" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "recommendationId" TEXT,
    "authorId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "offerId" TEXT,
    "releasedQuantity" INTEGER NOT NULL DEFAULT 0,
    "replacementForId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationOverride" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "originalRecommendation" JSONB NOT NULL,
    "selectedAlternative" JSONB NOT NULL,
    "actingUserId" TEXT NOT NULL,
    "businessScope" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "decisionVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleScenario" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "planId" TEXT,
    "name" TEXT NOT NULL,
    "requiredQuantity" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "result" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationPolicy_version_key" ON "RecommendationPolicy"("version");

-- CreateIndex
CREATE INDEX "RecommendationSnapshot_orderId_createdAt_idx" ON "RecommendationSnapshot"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "AllocationPlan_orderId_state_idx" ON "AllocationPlan"("orderId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationPlan_orderId_version_key" ON "AllocationPlan"("orderId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationPlanItem_offerId_key" ON "AllocationPlanItem"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationPlanItem_replacementForId_key" ON "AllocationPlanItem"("replacementForId");

-- CreateIndex
CREATE INDEX "AllocationPlanItem_planId_state_idx" ON "AllocationPlanItem"("planId", "state");

-- CreateIndex
CREATE INDEX "AllocationPlanItem_artisanProfileId_state_idx" ON "AllocationPlanItem"("artisanProfileId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationPlanItem_planId_artisanProfileId_key" ON "AllocationPlanItem"("planId", "artisanProfileId");

-- CreateIndex
CREATE INDEX "AllocationOverride_planId_createdAt_idx" ON "AllocationOverride"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleScenario_orderId_createdAt_idx" ON "ScheduleScenario"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecommendationSnapshot" ADD CONSTRAINT "RecommendationSnapshot_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RecommendationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSnapshot" ADD CONSTRAINT "RecommendationSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationSnapshot" ADD CONSTRAINT "RecommendationSnapshot_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlan" ADD CONSTRAINT "AllocationPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlan" ADD CONSTRAINT "AllocationPlan_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RecommendationSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlan" ADD CONSTRAINT "AllocationPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlan" ADD CONSTRAINT "AllocationPlan_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlanItem" ADD CONSTRAINT "AllocationPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AllocationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlanItem" ADD CONSTRAINT "AllocationPlanItem_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlanItem" ADD CONSTRAINT "AllocationPlanItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlanItem" ADD CONSTRAINT "AllocationPlanItem_replacementForId_fkey" FOREIGN KEY ("replacementForId") REFERENCES "AllocationPlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationOverride" ADD CONSTRAINT "AllocationOverride_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AllocationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationOverride" ADD CONSTRAINT "AllocationOverride_actingUserId_fkey" FOREIGN KEY ("actingUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleScenario" ADD CONSTRAINT "ScheduleScenario_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleScenario" ADD CONSTRAINT "ScheduleScenario_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
