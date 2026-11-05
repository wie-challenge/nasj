# Batch 14 acceptance matrix — E15-06 / #192

Originally 28 October 2026; remediation evidence updated 29 October 2026 · Africa/Tunis. Exactly one story and its five original acceptance criteria, quoted
verbatim from the live issue. [Original issue evidence](../../engineering/evidence/batch14/original-issue.json).

**Owner acceptance: PENDING.** Software evidence does not certify legal approval, real participant
feedback, production readiness or publication consent. The E14-09 / #74 qualified privacy review
remains required before real feedback is collected at scale.

| # | Original criterion (verbatim) | Implementation | Tests | Software status |
|---|---|---|---|---|
| C1 | Shared database, input validation and abuse controls required. | `DemoFeedback`/`DemoFeedbackEvent` in shared PostgreSQL; strict Zod schemas in `packages/contracts/src/demo.ts`; dedicated `feedback` bucket in `security/policies.ts` with `RATE_FEEDBACK_MAX`/`WINDOW`; per-visitor-per-scenario cap; partial unique `dedupeKey`; `DemoCommand` idempotency receipt | `unit/demo-feedback.test.ts` (7 cases incl. forged-field and bounds rejection); `demo.scenarios.ts` E15-06 capture scenario and the dedicated-bucket scenario; `demo-feedback-migration.scenarios.ts` B14-M03/M04 | VERIFIED_SOFTWARE_CRITERIA |
| C2 | Capture permitted participant, relevant screen/story, category, comment and status. | `DemoFeedback` stores server-derived `visitorId` from the HttpOnly visitor cookie, `screenKey` from a closed 18-value vocabulary covering the showroom, stage progress, every `presentationScenes` id and the persona workspaces, `category`, bounded plain `comment`, `status`, plus `scenarioId`/`generation`/`sourceClass`/`createdAt` | `unit/demo-feedback.test.ts` category/screen/bounds/transition cases; `demo.scenarios.ts` accepted-submission assertions incl. `sourceClass` and generation; migration `B14-M04` vocabulary CHECKs | VERIFIED_SOFTWARE_CRITERIA |
| C3 | Persist feedback in shared storage with validation and abuse/rate limits. | Additive migration `20261028170000_demo_feedback`; `SecurityService` bucket returns 429 with `Retry-After`; per-scenario cap 10; duplicate `dedupeKey` rejected; same-key replay returns the original result and changed payload conflicts; storage survives showroom reset | `demo.scenarios.ts` dedupe, cap, replay, conflict and 429+`Retry-After` assertions; concurrency probes (parallel submissions and shared key); `B14-M06` dump/restore reproduces rows exactly | VERIFIED_SOFTWARE_CRITERIA |
| C4 | Restrict viewing/moderation to intended team scope. | Visitor reads are `visitorId`-scoped and never cross-visitor; moderation is `@AdminOnly()` plus `PolicyService.requireAdmin` in-transaction; all six showroom personas are denied, including one granted a genuine `SUPPORT` role; `expectedStatus` guard prevents stale overwrite | `demo.scenarios.ts` cross-visitor read, all-persona denial, SUPPORT-persona denial, pre/post-promotion denial, stale-status 409, and visitor-cannot-moderate assertions | VERIFIED_SOFTWARE_CRITERIA |
| C5 | Display submission errors and preserve attributable moderation history. | Visitor panel snapshots each pending payload and key in memory, retries that original operation, displays the accepted result, preserves later edits for an explicit new submission, and permits correction after a validation rejection; `DemoFeedbackEvent` is append-only with nullable-but-CHECKed actor, from/to status and note; `AuditEvent` records the decision without the comment body; admin inbox renders the ordered history | `tests/demo-e2e/feedback-recovery.spec.ts` A–E plus cap at 390/1280 (12 remediation cases); dedicated 8/300 browser rate case; original `showroom.spec.ts` failed-request journey; `demo.scenarios.ts` event kinds/actor, audit-without-body, append-only UPDATE/DELETE rejection; migration `B14-M03/M04` | VERIFIED_SOFTWARE_CRITERIA |

## Cross-batch safeguards rechecked

| Safeguard | Status | Evidence |
|---|---|---|
| Batch 13 buyer-order feedback isolation | PRESERVED | `order-feedback.scenarios.ts` unchanged and passing in the full suite; no `BuyerOrderFeedback` code touched |
| Batch 12 financial closure and funding controls | PRESERVED | `batch12.scenarios.ts` passing; retention count assertion updated only for the intentional new class |
| Existing demo persona isolation | PRESERVED | `demo.scenarios.ts` original scenarios pass unchanged |
| Governance restrictions and pending privacy review | PRESERVED | New class keeps `retentionDuration: null` and `PENDING_QUALIFIED_POLICY_REVIEW`; purge disabled |
| No synthetic-to-real evidence promotion | VERIFIED | `demoFeedbackLabel` returns `provesRealParticipantView: false` for every class; UI and DTO labels state it |
| Financial non-interference | VERIFIED | Dedicated-bucket scenario snapshots payables, adjustments, disputes, tickets, buyer feedback, settlements and receipts before/after feedback and asserts equality |

## Scope discipline

E18-04 / #207, E18-05 / #208 and Batch 15 were not implemented. The three Batch 14 planning documents
are preserved unmodified. Batch 13's implementation and independent verification documents are
untouched. No GitHub issue or board state changed.

## Readiness decision

E15-06 is ready for owner review of its software evidence. It is **not** accepted, not ready for
real participant feedback collection at scale, and not approved for any publication, testimonial or
public rating.

## Independent finding and remediation chronology

The [29 October independent verification](batch14-independent-verification.md) classified C1–C4
VERIFIED and C5 PARTIALLY_VERIFIED because B14-IV-02 reproduced a lost-committed-response / edited
draft retry conflict. That historical audit and its evidence remain unchanged. The focused recovery
A–E and cap checks now pass at both widths; current regression results and the final C5 assessment
are recorded in [BATCH14_REMEDIATION_REPORT.md](batch14-remediation-report.md).

B14-IV-01 (native SQL header/history correspondence) and B14-IV-03 (GET/write rate allowance coupling)
remain LOW future hardening findings. Neither was remediated in this focused change. Owner acceptance
remains PENDING; E14-09 qualified privacy review, real-collection and publication gates still apply.

Historical suite counts remain 2 original new Batch 14 journeys and 5 total original showroom tests.
The 12 remediation regressions are separate additions (17 current showroom tests), and the earlier
6 independent browser probes are a separate evidence suite. Repeated focused runs are not extra tests.
