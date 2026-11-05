BEGIN;
-- AlterTable
ALTER TABLE "CommercialRfq" ADD COLUMN     "procurementManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceProductId" TEXT;

-- CreateTable
CREATE TABLE "ProcurementRevision" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "predecessorId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementActivity" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementAttachment" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementQuestion" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementMessage" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementSample" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revisionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementSampleDecision" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comments" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementSampleDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementQuote" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "revisionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "totalMillimes" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementAcceptance" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedProductVersion" (
    "id" TEXT NOT NULL,
    "sourceRfqId" TEXT NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "snapshot" JSONB NOT NULL,
    "materials" TEXT NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "leadTimeSampleCount" INTEGER NOT NULL,
    "leadTimeContext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovedProductVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementDocument" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "rfqId" TEXT NOT NULL,
    "orderId" TEXT,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FINAL',
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementRevision_predecessorId_key" ON "ProcurementRevision"("predecessorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementRevision_rfqId_version_key" ON "ProcurementRevision"("rfqId", "version");

-- CreateIndex
CREATE INDEX "ProcurementActivity_rfqId_createdAt_id_idx" ON "ProcurementActivity"("rfqId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ProcurementAttachment_rfqId_removedAt_idx" ON "ProcurementAttachment"("rfqId", "removedAt");

-- CreateIndex
CREATE INDEX "ProcurementQuestion_rfqId_createdAt_idx" ON "ProcurementQuestion"("rfqId", "createdAt");

-- CreateIndex
CREATE INDEX "ProcurementMessage_rfqId_internal_createdAt_id_idx" ON "ProcurementMessage"("rfqId", "internal", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementSample_rfqId_version_key" ON "ProcurementSample"("rfqId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementSampleDecision_sampleId_key" ON "ProcurementSampleDecision"("sampleId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementQuote_rfqId_version_key" ON "ProcurementQuote"("rfqId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementAcceptance_quoteId_key" ON "ProcurementAcceptance"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementAcceptance_orderId_key" ON "ProcurementAcceptance"("orderId");

-- CreateIndex
CREATE INDEX "ApprovedProductVersion_sourceRfqId_status_idx" ON "ApprovedProductVersion"("sourceRfqId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedProductVersion_sourceRfqId_productCode_version_key" ON "ApprovedProductVersion"("sourceRfqId", "productCode", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementDocument_number_key" ON "ProcurementDocument"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementDocument_rfqId_kind_version_key" ON "ProcurementDocument"("rfqId", "kind", "version");

-- AddForeignKey
ALTER TABLE "CommercialRfq" ADD CONSTRAINT "CommercialRfq_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "ApprovedProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRevision" ADD CONSTRAINT "ProcurementRevision_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRevision" ADD CONSTRAINT "ProcurementRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRevision" ADD CONSTRAINT "ProcurementRevision_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementActivity" ADD CONSTRAINT "ProcurementActivity_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementActivity" ADD CONSTRAINT "ProcurementActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementAttachment" ADD CONSTRAINT "ProcurementAttachment_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementAttachment" ADD CONSTRAINT "ProcurementAttachment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementQuestion" ADD CONSTRAINT "ProcurementQuestion_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementQuestion" ADD CONSTRAINT "ProcurementQuestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementQuestion" ADD CONSTRAINT "ProcurementQuestion_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementMessage" ADD CONSTRAINT "ProcurementMessage_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementMessage" ADD CONSTRAINT "ProcurementMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSample" ADD CONSTRAINT "ProcurementSample_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSample" ADD CONSTRAINT "ProcurementSample_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSample" ADD CONSTRAINT "ProcurementSample_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSampleDecision" ADD CONSTRAINT "ProcurementSampleDecision_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "ProcurementSample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSampleDecision" ADD CONSTRAINT "ProcurementSampleDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementQuote" ADD CONSTRAINT "ProcurementQuote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementQuote" ADD CONSTRAINT "ProcurementQuote_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementQuote" ADD CONSTRAINT "ProcurementQuote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementAcceptance" ADD CONSTRAINT "ProcurementAcceptance_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ProcurementQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementAcceptance" ADD CONSTRAINT "ProcurementAcceptance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementAcceptance" ADD CONSTRAINT "ProcurementAcceptance_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedProductVersion" ADD CONSTRAINT "ApprovedProductVersion_sourceRfqId_fkey" FOREIGN KEY ("sourceRfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedProductVersion" ADD CONSTRAINT "ApprovedProductVersion_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedProductVersion" ADD CONSTRAINT "ApprovedProductVersion_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "ProcurementSample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedProductVersion" ADD CONSTRAINT "ApprovedProductVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementDocument" ADD CONSTRAINT "ProcurementDocument_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CommercialRfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementDocument" ADD CONSTRAINT "ProcurementDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementDocument" ADD CONSTRAINT "ProcurementDocument_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Immutable evidence cannot be rewritten by a later application bug or direct UPDATE.
CREATE FUNCTION procurement_immutable_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Procurement evidence is append-only; create a new version'; END;
$$;
CREATE TRIGGER "ProcurementRevision_immutable" BEFORE UPDATE OR DELETE ON "ProcurementRevision" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProcurementActivity_immutable" BEFORE UPDATE OR DELETE ON "ProcurementActivity" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProcurementMessage_immutable" BEFORE UPDATE OR DELETE ON "ProcurementMessage" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProcurementSample_immutable" BEFORE UPDATE OR DELETE ON "ProcurementSample" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProcurementSampleDecision_immutable" BEFORE UPDATE OR DELETE ON "ProcurementSampleDecision" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProcurementQuote_immutable" BEFORE UPDATE OR DELETE ON "ProcurementQuote" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProcurementAcceptance_immutable" BEFORE UPDATE OR DELETE ON "ProcurementAcceptance" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProcurementDocument_immutable" BEFORE UPDATE OR DELETE ON "ProcurementDocument" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
ALTER TABLE "ProcurementSampleDecision" ADD CONSTRAINT "sample_decision_valid" CHECK (decision IN ('APPROVED','CHANGES_REQUESTED','REJECTED'));
ALTER TABLE "ApprovedProductVersion" ADD CONSTRAINT "product_status_valid" CHECK (status IN ('ACTIVE','SUPERSEDED','DISCONTINUED'));
ALTER TABLE "ProcurementDocument" ADD CONSTRAINT "document_kind_valid" CHECK (kind IN ('QUOTE','CONTRACT','INVOICE','DELIVERY'));
ALTER TABLE "ProcurementDocument" ADD CONSTRAINT "document_status_valid" CHECK (status IN ('DRAFT','FINAL','VOID'));
ALTER TABLE "ProcurementAttachment" ADD CONSTRAINT "attachment_safe_image" CHECK (mime='image/webp' AND octet_length(bytes)<=262144);
COMMIT;
