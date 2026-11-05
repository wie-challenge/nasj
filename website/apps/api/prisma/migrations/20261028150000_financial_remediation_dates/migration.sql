CREATE TABLE "ContractualDueDate" (
 "id" TEXT PRIMARY KEY,
 "payableId" TEXT NOT NULL REFERENCES "ArtisanPayable"("id") ON DELETE RESTRICT,
 "version" INTEGER NOT NULL CHECK("version">0),
 "basis" TEXT NOT NULL CHECK("basis" IN ('ACCEPTED_TERMS_EVIDENCE','UNKNOWN')),
 "dueAt" TIMESTAMP(3),
 "contractReference" TEXT NOT NULL,
 "contractVersion" TEXT NOT NULL,
 "payableTermsSha256" TEXT NOT NULL CHECK("payableTermsSha256" ~ '^[a-f0-9]{64}$'),
 "offerVersionAtRecording" INTEGER,
 "sourceEvidence" TEXT NOT NULL,
 "evidenceStatus" TEXT NOT NULL DEFAULT 'RECORDED_UNVERIFIED' CHECK("evidenceStatus"='RECORDED_UNVERIFIED'),
 "reason" TEXT NOT NULL,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "correctionOfId" TEXT REFERENCES "ContractualDueDate"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "contract_date_known" CHECK(("basis"='UNKNOWN' AND "dueAt" IS NULL) OR ("basis"='ACCEPTED_TERMS_EVIDENCE' AND "dueAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "ContractualDueDate_payableId_version_key" ON "ContractualDueDate"("payableId","version");
CREATE UNIQUE INDEX "ContractualDueDate_correctionOfId_key" ON "ContractualDueDate"("correctionOfId");
CREATE TRIGGER "contractual_due_date_immutable" BEFORE UPDATE OR DELETE ON "ContractualDueDate" FOR EACH ROW EXECUTE FUNCTION "finance_append_only"();
CREATE FUNCTION contract_date_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous "ContractualDueDate";
BEGIN
 IF NEW.version=1 THEN
  IF NEW."correctionOfId" IS NOT NULL THEN RAISE EXCEPTION 'Initial date cannot correct another record'; END IF;
 ELSE
  SELECT * INTO previous FROM "ContractualDueDate" WHERE id=NEW."correctionOfId";
  IF previous.id IS NULL OR previous."payableId"<>NEW."payableId" OR previous.version<>NEW.version-1 THEN RAISE EXCEPTION 'Date correction must reference the preceding version for this payable'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "contractual_due_date_chain" BEFORE INSERT ON "ContractualDueDate" FOR EACH ROW EXECUTE FUNCTION contract_date_chain();
-- Deliberately preserve execution_unverified and all historical financial/stock constraints.
