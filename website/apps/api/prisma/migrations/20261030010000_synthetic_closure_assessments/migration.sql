-- Forward-only vocabulary repair. Synthetic readiness is a simulation assessment,
-- never a verified settlement, lawful liability disposition, or closure approval.
ALTER TABLE "OrderClosureAssessment" DROP CONSTRAINT "closure_blocked";
ALTER TABLE "OrderClosureAssessment" ADD CONSTRAINT "closure_blocked"
  CHECK ("status" IN ('BLOCKED', 'NEEDS_REVIEW', 'SYNTHETIC_ONLY_READY'));
ALTER TABLE "OrderClosureAssessment" ADD CONSTRAINT "closure_synthetic_unverified"
  CHECK ("status" <> 'SYNTHETIC_ONLY_READY' OR
    ("blockers" = '[]'::jsonb AND
     ("snapshot"->>'verifiedPaidTnd') IS NOT DISTINCT FROM '0.000'));

-- Existing immutable assessment/event triggers, foreign keys, financial gates,
-- and all historical rows remain unchanged.
