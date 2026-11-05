-- E15-06: structured feedback about a synthetic demonstration, plus attributable moderation history.
-- Additive only. Nothing is inferred from existing showroom records.
BEGIN;

CREATE TABLE "DemoFeedback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scenarioId" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "sourceClass" TEXT NOT NULL DEFAULT 'VISITOR_SUBMITTED',
  "screenKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoFeedback_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "DemoScenario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "DemoFeedback_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "DemoVisitor"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "demo_feedback_generation" CHECK ("generation" > 0),
  CONSTRAINT "demo_feedback_source_class" CHECK ("sourceClass" IN ('VISITOR_SUBMITTED','SYNTHETIC_SEEDED')),
  CONSTRAINT "demo_feedback_category" CHECK ("category" IN ('USABILITY','CONTENT','DEFECT','IDEA')),
  CONSTRAINT "demo_feedback_status" CHECK ("status" IN ('NEW','TRIAGED','ACTIONED','DISMISSED')),
  CONSTRAINT "demo_feedback_comment_length" CHECK (length("comment") <= 2000),
  CONSTRAINT "demo_feedback_screen_key" CHECK ("screenKey" IN (
    'SHOWROOM_OVERVIEW','SHOWROOM_STAGE_PROGRESS',
    'PRESENTATION:problem','PRESENTATION:opportunity','PRESENTATION:concept','PRESENTATION:workflow',
    'PRESENTATION:participation','PRESENTATION:technology','PRESENTATION:demo',
    'PRESENTATION:transparency','PRESENTATION:finance','PRESENTATION:roadmap',
    'WORKSPACE:buyer','WORKSPACE:production','WORKSPACE:artisan',
    'WORKSPACE:coordinator','WORKSPACE:qa','WORKSPACE:finance'
  )),
  CONSTRAINT "demo_feedback_dedupe_length" CHECK ("dedupeKey" IS NULL OR length("dedupeKey") <= 128)
);
CREATE INDEX "DemoFeedback_scenarioId_createdAt_id_idx" ON "DemoFeedback"("scenarioId","createdAt","id");
CREATE INDEX "DemoFeedback_status_createdAt_idx" ON "DemoFeedback"("status","createdAt");
CREATE INDEX "DemoFeedback_visitorId_createdAt_idx" ON "DemoFeedback"("visitorId","createdAt");
-- One row per client key; a NULL key never blocks unrelated submissions.
CREATE UNIQUE INDEX "DemoFeedback_dedupe_key" ON "DemoFeedback"("scenarioId","visitorId","dedupeKey") WHERE "dedupeKey" IS NOT NULL;

CREATE TABLE "DemoFeedbackEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "feedbackId" TEXT NOT NULL,
  "actorId" TEXT,
  "kind" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoFeedbackEvent_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "DemoFeedback"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "DemoFeedbackEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "demo_feedback_event_kind" CHECK ("kind" IN ('SUBMITTED','STATUS_CHANGED','NOTE')),
  CONSTRAINT "demo_feedback_event_note_length" CHECK (length("note") <= 1000),
  CONSTRAINT "demo_feedback_event_transition" CHECK (("kind" <> 'STATUS_CHANGED') OR ("fromStatus" IS NOT NULL AND "toStatus" IS NOT NULL AND "fromStatus" <> "toStatus")),
  -- A visitor submission is anonymous; every moderation action must name the real reviewer.
  CONSTRAINT "demo_feedback_event_actor" CHECK ("kind" = 'SUBMITTED' OR "actorId" IS NOT NULL),
  CONSTRAINT "demo_feedback_event_submitted_actor" CHECK ("kind" <> 'SUBMITTED' OR "actorId" IS NULL)
);
CREATE INDEX "DemoFeedbackEvent_feedbackId_createdAt_id_idx" ON "DemoFeedbackEvent"("feedbackId","createdAt","id");
CREATE INDEX "DemoFeedbackEvent_actorId_createdAt_idx" ON "DemoFeedbackEvent"("actorId","createdAt");

-- Moderation history is append-only: an attributable record is never rewritten or removed.
CREATE FUNCTION "demo_feedback_event_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Demo feedback moderation history is append-only';
END; $$;
CREATE TRIGGER "DemoFeedbackEvent_append_only" BEFORE UPDATE OR DELETE ON "DemoFeedbackEvent" FOR EACH ROW EXECUTE FUNCTION "demo_feedback_event_append_only"();

-- Only status may change after submission. A moderator triages a state, never the submitted words.
CREATE FUNCTION "demo_feedback_content_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."scenarioId"<>OLD."scenarioId"
     OR NEW."visitorId"<>OLD."visitorId"
     OR NEW."generation"<>OLD."generation"
     OR NEW."sourceClass"<>OLD."sourceClass"
     OR NEW."screenKey"<>OLD."screenKey"
     OR NEW."category"<>OLD."category"
     OR NEW."comment"<>OLD."comment"
     OR NEW."dedupeKey" IS DISTINCT FROM OLD."dedupeKey"
     OR NEW."createdAt"<>OLD."createdAt" THEN
    RAISE EXCEPTION 'Demo feedback content and provenance are immutable';
  END IF;
  IF NEW."status" <> OLD."status" AND OLD."status" IN ('ACTIONED','DISMISSED') THEN
    RAISE EXCEPTION 'Closed demo feedback status is terminal';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "DemoFeedback_content_guard" BEFORE UPDATE ON "DemoFeedback" FOR EACH ROW EXECUTE FUNCTION "demo_feedback_content_guard"();
CREATE TRIGGER "DemoFeedback_no_delete" BEFORE DELETE ON "DemoFeedback" FOR EACH ROW EXECUTE FUNCTION "demo_feedback_event_append_only"();

-- Provenance must agree with the scenario and visitor: a submission cannot claim another scenario's
-- generation, and it always starts in NEW.
CREATE FUNCTION "demo_feedback_anchor"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scenario "DemoScenario";
BEGIN
  SELECT * INTO scenario FROM "DemoScenario" WHERE id = NEW."scenarioId";
  IF scenario.id IS NULL THEN
    RAISE EXCEPTION 'Demo feedback requires an existing scenario';
  END IF;
  IF scenario."visitorId" <> NEW."visitorId" THEN
    RAISE EXCEPTION 'Demo feedback visitor must own the scenario';
  END IF;
  IF scenario."generation" <> NEW."generation" THEN
    RAISE EXCEPTION 'Demo feedback generation must match its scenario';
  END IF;
  IF NEW."status" <> 'NEW' THEN
    RAISE EXCEPTION 'Demo feedback starts in the NEW state';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "DemoFeedback_anchor" BEFORE INSERT ON "DemoFeedback" FOR EACH ROW EXECUTE FUNCTION "demo_feedback_anchor"();

-- Reuse the showroom's existing idempotency receipt table for feedback replays.
ALTER TABLE "DemoCommand" ADD COLUMN "feedbackId" TEXT;
-- The historical operation vocabulary is superseded, not rewritten: the original migration SQL is
-- preserved untouched and this forward migration widens the check to include the feedback command.
ALTER TABLE "DemoCommand" DROP CONSTRAINT "DemoCommand_operation_check";
ALTER TABLE "DemoCommand" ADD CONSTRAINT "DemoCommand_operation_check"
  CHECK ("operation" IN ('start','switch','reset','feedback'));

-- Deliberately preserve every historical financial, stock, consent and Batch 13 feedback constraint.
COMMIT;
