# External approvals and unavailable evidence

Live GitHub was read through authenticated `gh`; no GitHub writes occurred. Owner acceptance remains **PENDING**. Every original criterion has a classification, including explicit `EVIDENCE_UNAVAILABLE` where the exact acceptance proof is missing. The 963 classifications are not a claim of 963 fresh behavioral demonstrations.

## #198 — CLOSED_EXTERNAL_OWNER_REVIEW

Desired status: Blocked.

- **E17-01.C1 — EXTERNALLY_BLOCKED**: Membership/team roster evidence confirmed, primary Track 2 selected, secondary safety scope stated, unanswered organizer requirements flagged.

  Eligibility register explicitly retains missing3–4-member roster/membership evidence and owner sign-off. No authenticity or eligible team is invented.

  Source: docs/competition/ELIGIBILITY_AND_TRACK_REGISTER.md. Fresh evidence: No decisive execution for this criterion.

- **E17-01.C2 — EXTERNALLY_BLOCKED**: Verify the eligible 3–4-member roster and membership evidence against the applicable organizer brief.

  Eligibility register explicitly retains missing3–4-member roster/membership evidence and owner sign-off. No authenticity or eligible team is invented.

  Source: docs/competition/ELIGIBILITY_AND_TRACK_REGISTER.md. Fresh evidence: No decisive execution for this criterion.

## #203 — CLOSED_EXTERNAL_OWNER_REVIEW

Desired status: Blocked.

- **E17-06.C1 — EXTERNALLY_BLOCKED**: Deadlines, format, anonymity when required, membership, repository access, plagiarism review and final evidence are verified with owner/time.

  Submission checklist retains pending owner/access/anonymity/membership review and says upload/receipt not performed. No genuine portal receipt is available.

  Source: docs/competition/PHASE1_SUBMISSION_CHECKLIST.md. Fresh evidence: No decisive execution for this criterion.

- **E17-06.C3 — EXTERNALLY_BLOCKED**: Verify access permissions, anonymity where required, membership and citation/plagiarism review.

  Submission checklist retains pending owner/access/anonymity/membership review and says upload/receipt not performed. No genuine portal receipt is available.

  Source: docs/competition/PHASE1_SUBMISSION_CHECKLIST.md. Fresh evidence: No decisive execution for this criterion.

- **E17-06.C5 — EXTERNALLY_BLOCKED**: Confirm actual submission receipt/reference when submission is later authorized and performed.

  Submission checklist retains pending owner/access/anonymity/membership review and says upload/receipt not performed. No genuine portal receipt is available.

  Source: docs/competition/PHASE1_SUBMISSION_CHECKLIST.md. Fresh evidence: No decisive execution for this criterion.

## #193 — KEEP_DONE_VERIFIED

Desired status: Done.

## #196 — KEEP_DONE_VERIFIED

Desired status: Done.

## #30 — KEEP_DONE_WITH_EVIDENCE_GAP

Desired status: In Review.

- **E16-11.C1 — IMPLEMENTED_NOT_VERIFIED**: pnpm workspace, TypeScript, Prisma migrations, env example, seed, lint, typecheck, tests and one-command local setup succeed in clean checkout.

  A separate checkout with an empty package store downloads429/446 packages but clean online installation fails with registry operation timeout. Existing dependencies passing tests do not establish clean setup/startup.

  Source: package.json; pnpm-lock.yaml; scripts/setup-local.ts. Fresh evidence: logs/clean-online-install-retry.log.

- **E16-11.C5 — IMPLEMENTED_NOT_VERIFIED**: Verify clean installation, migration and startup with documented pinned runtime assumptions.

  A separate checkout with an empty package store downloads429/446 packages but clean online installation fails with registry operation timeout. Existing dependencies passing tests do not establish clean setup/startup.

  Source: package.json; pnpm-lock.yaml; scripts/setup-local.ts. Fresh evidence: logs/clean-online-install-retry.log.

## #73 — KEEP_DONE_WITH_EVIDENCE_GAP

Desired status: In Review.

- **E10-14.C4 — IMPLEMENTED_NOT_VERIFIED**: Require a documented authorized and lawful disposition for any exception without erasing liability history.

  Current code denies all exception waivers without an approved policy. The original criterion requires lawful authorization for any exception; denial alone is not a demonstrated unsafe exception. Withhold positive exception acceptance rather than carrying forward an assumed functional failure.

  Source: apps/api/src/modules/finance/finance.service.ts:1212. Fresh evidence: logs/finance-closure.log.

## #148 — KEEP_DONE_WITH_EVIDENCE_GAP

Desired status: In Review.

- **E10-13.C2 — IMPLEMENTED_NOT_VERIFIED**: Derive due dates from accepted contractual rules rather than report creation dates.

  Due-date transcription/history references an immutable accepted payable-terms hash, but date correctness against those terms has not been freshly exercised at the native HTTP/service tier. This provenance check can be tested synthetically and is separate from D1, which blocks genuine settlement only.

  Source: apps/api/src/modules/finance/finance.service.ts:1040; apps/api/src/modules/finance/analysis.ts. Fresh evidence: No decisive execution for this criterion.

## #163 — KEEP_DONE_WITH_EVIDENCE_GAP

Desired status: In Review.

- **E12-13.C5 — IMPLEMENTED_NOT_VERIFIED**: Persist only permitted settings and make reset/dismiss deterministic.

  Reset/dismiss execute; permitted settings are session-local in a private field. Whether the original persistence requirement accepts session-only storage is not independently established. No physical storage acceptance is claimed.

  Source: ../iot/simulator/src/simulator.ts:62. Fresh evidence: logs/iot-unit.log.

## #168 — KEEP_DONE_WITH_EVIDENCE_GAP

Desired status: In Review.

- **E12-09.C1 — IMPLEMENTED_NOT_VERIFIED**: No commerce API or admin endpoint can read raw sensor or strain summary; technical and privacy tests confirm only user-declared capacity crosses boundary.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C2 — IMPLEMENTED_NOT_VERIFIED**: Keep sensor samples, activity/strain summaries and reminder history out of commercial database schemas.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C3 — IMPLEMENTED_NOT_VERIFIED**: Exclude monitoring-read APIs even for administrator roles.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C4 — IMPLEMENTED_NOT_VERIFIED**: Allow only independently authored capacity through its strict publication schema.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C5 — IMPLEMENTED_NOT_VERIFIED**: Separate local storage, network paths and permissions so opt-out has no commerce effects.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

## #176 — KEEP_DONE_WITH_EVIDENCE_GAP

Desired status: In Review.

- **E13-04.C5 — IMPLEMENTED_NOT_VERIFIED**: Restrict individual earnings to authorized users and publish only safe aggregates.

  Batch authorization and cohort aggregation are source-traced; complete current HTTP individual/aggregate privacy assertions were not executed.

  Source: apps/api/src/modules/intelligence/intelligence.service.ts. Fresh evidence: No decisive execution for this criterion.

## #204 — KEEP_DONE_WITH_EVIDENCE_GAP

Desired status: In Review.

- **E18-01.C1 — IMPLEMENTED_NOT_VERIFIED**: Account, contact, consent basis, segment, next action, status and qualification notes stored and permission-scoped.

  Scoped CRM fields, history, owner/follow-up/contact basis and retention-review logic are source-traced, but the full create/read/retention/negotiation acceptance suite did not run after upstream integration failure. Transition reachability alone does not certify the story.

  Source: apps/api/src/modules/sales/sales.service.ts; packages/contracts/src/batch12.ts. Fresh evidence: No decisive execution for this criterion.

- **E18-01.C2 — IMPLEMENTED_NOT_VERIFIED**: Capture organization/contact, segment, permission basis, needs and qualification status.

  Scoped CRM fields, history, owner/follow-up/contact basis and retention-review logic are source-traced, but the full create/read/retention/negotiation acceptance suite did not run after upstream integration failure. Transition reachability alone does not certify the story.

  Source: apps/api/src/modules/sales/sales.service.ts; packages/contracts/src/batch12.ts. Fresh evidence: No decisive execution for this criterion.

- **E18-01.C3 — IMPLEMENTED_NOT_VERIFIED**: Assign owner, next action and follow-up date without implying purchase commitment.

  Scoped CRM fields, history, owner/follow-up/contact basis and retention-review logic are source-traced, but the full create/read/retention/negotiation acceptance suite did not run after upstream integration failure. Transition reachability alone does not certify the story.

  Source: apps/api/src/modules/sales/sales.service.ts; packages/contracts/src/batch12.ts. Fresh evidence: No decisive execution for this criterion.

- **E18-01.C4 — IMPLEMENTED_NOT_VERIFIED**: Restrict contact/negotiation access and honor retention/contact preferences.

  Scoped CRM fields, history, owner/follow-up/contact basis and retention-review logic are source-traced, but the full create/read/retention/negotiation acceptance suite did not run after upstream integration failure. Transition reachability alone does not certify the story.

  Source: apps/api/src/modules/sales/sales.service.ts; packages/contracts/src/batch12.ts. Fresh evidence: No decisive execution for this criterion.

## #175 — OPEN_EXTERNALLY_BLOCKED

Desired status: Blocked.

- **E13-03.C1 — EXTERNALLY_BLOCKED**: Counts based on reconciled payouts and period filters.

  Actual paid participation requires an independently verified reconciled payout. D1 is unapproved; database constraints reject the positive settlement state. Software simulation exclusion is verified separately, not genuine paid participants.

  Source: apps/api/src/modules/intelligence/intelligence.service.ts; apps/api/prisma/migrations/20261027080000_financial_controls/migration.sql. Fresh evidence: logs/g71-authority.log.

- **E13-03.C2 — EVIDENCE_UNAVAILABLE**: Count distinct artisans with qualifying reconciled payouts in the selected period.

  Current subsystem and existing assertions were located, but sufficient evidence for this exact original criterion was not recovered/executed. Original CP5 per-criterion JSON/acceptance registry is missing. This is neither a pass nor evidence that the feature is absent.

  Source: apps/api/src/modules/finance/analysis.ts; apps/api/src/modules/intelligence/intelligence.controller.ts; apps/api/src/modules/intelligence/intelligence.module.ts; apps/api/src/modules/intelligence/intelligence.service.ts; apps/api/test/unit/intelligence.test.ts; apps/web/src/components/intelligence-workspace.tsx; packages/contracts/src/intelligence.ts. Fresh evidence: No decisive execution for this criterion.

- **E13-03.C3 — EVIDENCE_UNAVAILABLE**: Distinguish onboarded, offered, active and paid participants.

  Current subsystem and existing assertions were located, but sufficient evidence for this exact original criterion was not recovered/executed. Original CP5 per-criterion JSON/acceptance registry is missing. This is neither a pass nor evidence that the feature is absent.

  Source: apps/api/src/modules/finance/analysis.ts; apps/api/src/modules/intelligence/intelligence.controller.ts; apps/api/src/modules/intelligence/intelligence.module.ts; apps/api/src/modules/intelligence/intelligence.service.ts; apps/api/test/unit/intelligence.test.ts; apps/web/src/components/intelligence-workspace.tsx; packages/contracts/src/intelligence.ts. Fresh evidence: No decisive execution for this criterion.

- **E13-03.C4 — EVIDENCE_UNAVAILABLE**: Document partial payment, reversal and period-boundary handling.

  Current subsystem and existing assertions were located, but sufficient evidence for this exact original criterion was not recovered/executed. Original CP5 per-criterion JSON/acceptance registry is missing. This is neither a pass nor evidence that the feature is absent.

  Source: apps/api/src/modules/finance/analysis.ts; apps/api/src/modules/intelligence/intelligence.controller.ts; apps/api/src/modules/intelligence/intelligence.module.ts; apps/api/src/modules/intelligence/intelligence.service.ts; apps/api/test/unit/intelligence.test.ts; apps/web/src/components/intelligence-workspace.tsx; packages/contracts/src/intelligence.ts. Fresh evidence: No decisive execution for this criterion.

- **E13-03.C5 — EVIDENCE_UNAVAILABLE**: Apply privacy thresholds and never count failed/planned/simulated payouts as real paid participation.

  Current subsystem and existing assertions were located, but sufficient evidence for this exact original criterion was not recovered/executed. Original CP5 per-criterion JSON/acceptance registry is missing. This is neither a pass nor evidence that the feature is absent.

  Source: apps/api/src/modules/finance/analysis.ts; apps/api/src/modules/intelligence/intelligence.controller.ts; apps/api/src/modules/intelligence/intelligence.module.ts; apps/api/src/modules/intelligence/intelligence.service.ts; apps/api/test/unit/intelligence.test.ts; apps/web/src/components/intelligence-workspace.tsx; packages/contracts/src/intelligence.ts. Fresh evidence: No decisive execution for this criterion.

## Physical, policy and participant boundaries

No physical ESP32/IMU/motor, ergonomic effectiveness, field demand, real paid pilot, signed legal contract, qualified tax/privacy/translation approval or competition portal receipt was certified. Research/physical blockers are #22, #23, #24, #25, #26, #27, #28, #29, #80, #162, #164, #165, #166, #169, #171, #175. A local simulator is a software companion only. D1 approval must precede designing/enabling verified settlement; this audit never weakens current constraints.

## Lost criterion provenance

The full acceptance registry, final per-issue CP5 census and Groups23–37 JSON were not recovered.19 tracked documents recover57 CP5 findings and earlier summaries, not the complete101. The interrupted partial census is retained only as identity/recovery context. 655 story criteria remain EVIDENCE_UNAVAILABLE. Recovery or targeted fresh execution is needed; no assumed pass/fail replaces them.
