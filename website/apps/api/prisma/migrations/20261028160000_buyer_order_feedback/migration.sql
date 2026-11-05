-- E18-06: private buyer order feedback and append-only revision history.
-- Additive only. No historical feedback is inferred from discussions, receipts or claims.
BEGIN;

CREATE TABLE "BuyerOrderFeedback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "receiptConfirmationId" TEXT NOT NULL,
  "sourceClass" TEXT NOT NULL,
  "scenarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "BuyerOrderFeedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "BuyerOrderFeedback_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "BuyerOrderFeedback_receiptConfirmationId_fkey" FOREIGN KEY ("receiptConfirmationId") REFERENCES "BuyerDeliveryConfirmation"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "BuyerOrderFeedback_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "DemoScenario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "buyer_feedback_source_class" CHECK ("sourceClass" IN ('DEMO_USER_SUBMITTED','OPERATIONAL_USER_SUBMITTED','SYNTHETIC_SEEDED')),
  CONSTRAINT "buyer_feedback_current_version" CHECK ("currentVersion" >= 1),
  CONSTRAINT "buyer_feedback_scenario_scope" CHECK (("sourceClass" = 'DEMO_USER_SUBMITTED') = ("scenarioId" IS NOT NULL))
);
CREATE UNIQUE INDEX "BuyerOrderFeedback_orderId_reporterId_key" ON "BuyerOrderFeedback"("orderId","reporterId");
CREATE INDEX "BuyerOrderFeedback_orderId_createdAt_id_idx" ON "BuyerOrderFeedback"("orderId","createdAt","id");
CREATE INDEX "BuyerOrderFeedback_reporterId_createdAt_idx" ON "BuyerOrderFeedback"("reporterId","createdAt");

CREATE TABLE "BuyerOrderFeedbackRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "feedbackId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category" TEXT NOT NULL,
  "rating" INTEGER,
  "comment" TEXT NOT NULL DEFAULT '',
  "followUpStatus" TEXT NOT NULL DEFAULT 'OPEN',
  "followUpOwnerId" TEXT,
  "followUpNote" TEXT NOT NULL DEFAULT '',
  "linkedTicketId" TEXT,
  "reason" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "BuyerOrderFeedbackRevision_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "BuyerOrderFeedback"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "BuyerOrderFeedbackRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "BuyerOrderFeedbackRevision_followUpOwnerId_fkey" FOREIGN KEY ("followUpOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "BuyerOrderFeedbackRevision_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "buyer_feedback_revision_version" CHECK ("version" >= 1),
  CONSTRAINT "buyer_feedback_revision_kind" CHECK ("kind" IN ('SUBMITTED','BUYER_CORRECTION','FOLLOW_UP','CASE_LINK')),
  CONSTRAINT "buyer_feedback_revision_category" CHECK ("category" IN ('OVERALL','QUALITY','DELIVERY','COMMUNICATION')),
  CONSTRAINT "buyer_feedback_revision_rating" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5)),
  CONSTRAINT "buyer_feedback_revision_comment_length" CHECK (length("comment") <= 2000 AND length("followUpNote") <= 2000),
  CONSTRAINT "buyer_feedback_revision_status" CHECK ("followUpStatus" IN ('OPEN','FOLLOW_UP','RESOLVED')),
  CONSTRAINT "buyer_feedback_revision_owner" CHECK ("followUpStatus" <> 'FOLLOW_UP' OR "followUpOwnerId" IS NOT NULL),
  CONSTRAINT "buyer_feedback_revision_resolution" CHECK ("followUpStatus" <> 'RESOLVED' OR length(btrim("reason")) > 0),
  CONSTRAINT "buyer_feedback_revision_later_reason" CHECK ("version" = 1 OR length(btrim("reason")) > 0)
);
CREATE UNIQUE INDEX "BuyerOrderFeedbackRevision_feedbackId_version_key" ON "BuyerOrderFeedbackRevision"("feedbackId","version");
CREATE INDEX "BuyerOrderFeedbackRevision_feedbackId_version_idx" ON "BuyerOrderFeedbackRevision"("feedbackId","version");
CREATE INDEX "BuyerOrderFeedbackRevision_followUpOwnerId_idx" ON "BuyerOrderFeedbackRevision"("followUpOwnerId");
CREATE INDEX "BuyerOrderFeedbackRevision_linkedTicketId_idx" ON "BuyerOrderFeedbackRevision"("linkedTicketId");

-- Revisions are complete snapshots and are never rewritten or removed.
CREATE FUNCTION "buyer_feedback_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Buyer feedback history is append-only';
END; $$;
CREATE TRIGGER "BuyerOrderFeedbackRevision_append_only" BEFORE UPDATE OR DELETE ON "BuyerOrderFeedbackRevision" FOR EACH ROW EXECUTE FUNCTION "buyer_feedback_append_only"();

-- The header identity (order, reporter, receipt, provenance, creation time) is immutable; only the
-- current version may advance, and only by exactly one.
CREATE FUNCTION "buyer_order_feedback_header_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."orderId"<>OLD."orderId"
     OR NEW."reporterId"<>OLD."reporterId"
     OR NEW."receiptConfirmationId"<>OLD."receiptConfirmationId"
     OR NEW."sourceClass"<>OLD."sourceClass"
     OR NEW."scenarioId" IS DISTINCT FROM OLD."scenarioId"
     OR NEW."createdAt"<>OLD."createdAt" THEN
    RAISE EXCEPTION 'Buyer feedback identity and receipt are immutable';
  END IF;
  IF NEW."currentVersion" <> OLD."currentVersion" + 1 THEN
    RAISE EXCEPTION 'Buyer feedback version advances by exactly one';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "BuyerOrderFeedback_identity_guard" BEFORE UPDATE ON "BuyerOrderFeedback" FOR EACH ROW EXECUTE FUNCTION "buyer_order_feedback_header_guard"();
CREATE TRIGGER "BuyerOrderFeedback_no_delete" BEFORE DELETE ON "BuyerOrderFeedback" FOR EACH ROW EXECUTE FUNCTION "buyer_feedback_append_only"();

-- Creation is bound to a real buyer receipt on a shipment of this exact order with received > 0.
CREATE FUNCTION "buyer_order_feedback_eligibility"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt "BuyerDeliveryConfirmation";
BEGIN
  SELECT * INTO receipt FROM "BuyerDeliveryConfirmation" WHERE id = NEW."receiptConfirmationId";
  IF receipt.id IS NULL THEN
    RAISE EXCEPTION 'Buyer feedback requires a recorded buyer receipt';
  END IF;
  IF receipt."received" <= 0 THEN
    RAISE EXCEPTION 'Buyer feedback requires a confirmed received quantity above zero';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Shipment" s WHERE s.id = receipt."shipmentId" AND s."orderId" = NEW."orderId"
  ) THEN
    RAISE EXCEPTION 'Buyer feedback receipt must belong to this exact order';
  END IF;
  IF NEW."currentVersion" <> 1 THEN
    RAISE EXCEPTION 'Buyer feedback starts at version one';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "BuyerOrderFeedback_eligibility" BEFORE INSERT ON "BuyerOrderFeedback" FOR EACH ROW EXECUTE FUNCTION "buyer_order_feedback_eligibility"();

-- A revision is the next complete snapshot. A linked case must be an order-related SupportTicket
-- for this exact order and the operating organization of that order.
CREATE FUNCTION "buyer_feedback_revision_chain"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header "BuyerOrderFeedback";
DECLARE ticket "SupportTicket";
DECLARE operator_organization TEXT;
BEGIN
  SELECT * INTO header FROM "BuyerOrderFeedback" WHERE id = NEW."feedbackId";
  IF header.id IS NULL THEN
    RAISE EXCEPTION 'Buyer feedback revision requires a feedback aggregate';
  END IF;
  IF NEW."version" <> header."currentVersion" THEN
    RAISE EXCEPTION 'Buyer feedback revision must match the current version';
  END IF;
  IF NEW."version" > 1 AND NOT EXISTS (
    SELECT 1 FROM "BuyerOrderFeedbackRevision" r
    WHERE r."feedbackId" = NEW."feedbackId" AND r."version" = NEW."version" - 1
  ) THEN
    RAISE EXCEPTION 'Buyer feedback revision must follow the preceding version';
  END IF;
  IF NEW."version" = 1 AND NEW."kind" <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'The first buyer feedback revision is the submitted assessment';
  END IF;
  IF NEW."linkedTicketId" IS NOT NULL THEN
    SELECT * INTO ticket FROM "SupportTicket" WHERE id = NEW."linkedTicketId";
    SELECT rfq."operatorOrganizationId" INTO operator_organization
      FROM "CommercialOrder" o JOIN "CommercialRfq" rfq ON rfq.id = o."rfqId"
      WHERE o.id = header."orderId";
    IF ticket.id IS NULL
       OR ticket."relatedType" IS DISTINCT FROM 'ORDER'
       OR ticket."relatedId" IS DISTINCT FROM header."orderId"
       OR ticket."organizationId" IS DISTINCT FROM operator_organization THEN
      RAISE EXCEPTION 'A linked case must be an order-related support ticket for this order';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "BuyerOrderFeedbackRevision_chain" BEFORE INSERT ON "BuyerOrderFeedbackRevision" FOR EACH ROW EXECUTE FUNCTION "buyer_feedback_revision_chain"();

-- Deliberately preserve every historical financial, stock, terms and consent constraint.
COMMIT;
