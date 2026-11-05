# Batches 8–11 — Consolidated Acceptance Matrix

Status as at 28 October 2026, Africa/Tunis. Repository `website/`, branch
`feat/nasj-showroom-competition-package`.

## How to read this matrix

- `GITHUB_ISSUE` is **NOT_RESOLVED** for every row. This environment has no authenticated GitHub access and
  the instruction forbids inventing issue numbers. Issue mapping must be completed by someone with
  repository access before any status is published remotely.
- `CODE_STATUS` is one of `IMPLEMENTED_UNVERIFIED`, `PARTIALLY_IMPLEMENTED`, `BLOCKED`, `NOT_STARTED`.
  `IMPLEMENTED_UNVERIFIED` means the code, authorization, contracts and unit tests exist, but the
  PostgreSQL integration suite, browser journeys and demo reset have **not** been executed.
- `OWNER_ACCEPTANCE` is `PENDING` for every row. Passing tests — and remote issue closure — are not owner
  acceptance.

## Environment truth

| Capability | State | Evidence |
|---|---|---|
| Unit tests (API) | Available | 108 pass / 0 fail / 0 skipped |
| Unit tests (web) | Available | 25 pass / 0 fail / 0 skipped |
| Lint / typecheck / build | Available | all PASS |
| PostgreSQL | **Unavailable** | port 5442 refused; no `psql`; no Docker daemon |
| Integration suite | **Blocked** | needs PostgreSQL |
| Browser / demo suites | **Blocked** | need API + web + database |
| Migration execution | **Not performed** | no disposable database available |
| GitHub issue access | **Unavailable** | no credentials in this environment |

Because of the above, **no row can be marked owner-accepted**, and no claim of concurrency safety,
browser-verified behaviour or migrated-schema correctness is made.

## Batch 8 — Intelligent matching and production planning

| BACKLOG_ID | GITHUB_ISSUE | BATCH | ORIGINAL_CRITERIA | IMPLEMENTED_CRITERIA | MISSING_CRITERIA | TEST_EVIDENCE | DEPENDENCIES | CODE_STATUS | OWNER_ACCEPTANCE |
|---|---|---|---|---|---|---|---|---|---|
| E05-02 | NOT_RESOLVED | 8 | Criteria, weights, missing data, no health attributes | Tiers + explanations + unknowns + blocking codes; health/wearable/decline excluded by contract | Numeric weights deliberately not exposed | `planning.test.ts` ranking tests ×2 | E05-01 assessment (pre-existing) | IMPLEMENTED_UNVERIFIED | PENDING |
| E05-03 | NOT_RESOLVED | 8 | No negative qty, no oversubscription, totals reconcile | Full invariant set + persisted plan/items + reconciliation totals | Concurrency proof needs DB | allocation tests ×3 | E05-01 | IMPLEMENTED_UNVERIFIED | PENDING |
| E05-04 | NOT_RESOLVED | 8 | Offer without active assignment; acceptance required | Reuses existing offer service; offers stay `PREPARED`; accountless acceptance still blocked | End-to-end via DB | service path only | E05-03, E04-02 | IMPLEMENTED_UNVERIFIED | PENDING |
| E05-05 | NOT_RESOLVED | 8 | Capacity released, replacements tracked, audit | Release-once rule, replacements proposed, audit written | Replacement offer creation is a separate authorised act | `releasableQuantity` test | E05-04 | IMPLEMENTED_UNVERIFIED | PENDING |
| E05-07 | NOT_RESOLVED | 8 | Required reason and actor logged | Override record with reason, actor, scope, version; hard constraints refused | — | override path + hard-constraint guards in service | E05-02 | IMPLEMENTED_UNVERIFIED | PENDING |
| E11-01 | NOT_RESOLVED | 8 | Rule inputs shown, no health inference | Explanation strings + persisted policy inputs/excluded lists | — | ranking test | E05-02 | IMPLEMENTED_UNVERIFIED | PENDING |
| E11-02 | NOT_RESOLVED | 8 | Show calculation and confidence limitations | Exact components, hourly pay, missing fields, advisory limitations | — | pricing tests ×2 | E03-02 | IMPLEMENTED_UNVERIFIED | PENDING |
| E11-03 | NOT_RESOLVED | 8 | Deterministic schedule, assumptions shown | Weekly arithmetic, unknown handling, assumptions returned | — | simulation tests ×2 | E03-01 | IMPLEMENTED_UNVERIFIED | PENDING |

## Batch 9 — Product catalog and sampling

| BACKLOG_ID | GITHUB_ISSUE | BATCH | ORIGINAL_CRITERIA | IMPLEMENTED_CRITERIA | MISSING_CRITERIA | TEST_EVIDENCE | DEPENDENCIES | CODE_STATUS | OWNER_ACCEPTANCE |
|---|---|---|---|---|---|---|---|---|---|
| E20-01 | NOT_RESOLVED | 9 | Order/batch references immutable approved spec version | Catalogue revisions immutable + supersession | Order release does not yet reference catalogue revision | `catalog.test.ts` spec ×1 | E02 procurement | PARTIALLY_IMPLEMENTED | PENDING |
| E20-02 | NOT_RESOLVED | 9 | Owner, compensation, material cost, hours, approval logged | All except material cost as TND; unpaid-by-default enforced; time evidence class stored | Material cost is descriptive text | `catalog.test.ts` unpaid ×1 | — | IMPLEMENTED_UNVERIFIED | PENDING |
| E20-03 | NOT_RESOLVED | 9 | Approver, date, evidence, spec, amendment relation | Full record + cross-org/version rejection + amendment chain | — | `catalog.test.ts` approval ×1 | E20-02 | IMPLEMENTED_UNVERIFIED | PENDING |
| E02-06 | NOT_RESOLVED | 9 | Records version, evidence, signatory | Single coherent workflow with E20-03 | — | shared with E20-03 | E20-03 | IMPLEMENTED_UNVERIFIED | PENDING |
| E02-05 | NOT_RESOLVED | 9 | Changes create traceable version | Pre-existing revision chain | Not re-implemented | not re-tested | — | IMPLEMENTED_UNVERIFIED | PENDING |

## Batch 10 — Production intelligence and analytics

| BACKLOG_ID | GITHUB_ISSUE | BATCH | ORIGINAL_CRITERIA | IMPLEMENTED_CRITERIA | MISSING_CRITERIA | TEST_EVIDENCE | DEPENDENCIES | CODE_STATUS | OWNER_ACCEPTANCE |
|---|---|---|---|---|---|---|---|---|---|
| E11-04 | NOT_RESOLVED | 10 | Thresholds tested, no fake ML | Versioned rule-based states with reasons | Live fixtures unverified | risk tests ×6 | E06 runtime data | IMPLEMENTED_UNVERIFIED | PENDING |
| E06-07 | NOT_RESOLVED | 10 | Rules-based alert from deadlines and progress | Alert list in dashboard | Live combination with exceptions unverified | risk tests | E11-04, E06-05 | IMPLEMENTED_UNVERIFIED | PENDING |
| E11-05 | NOT_RESOLVED | 10 | Error metrics only with genuine data | Comparable-only metrics, null when empty | No dedicated forecast snapshot table | forecast tests ×3 | E11-03 | PARTIALLY_IMPLEMENTED | PENDING |
| E11-06 | NOT_RESOLVED | 10 | Privacy-safe feature/decision audit | Policy version, snapshot/override counts, per-plan override history | Dedicated diff review view | service path | E05-07 | IMPLEMENTED_UNVERIFIED | PENDING |
| E05-06 | NOT_RESOLVED | 10 | Privacy-aware distribution indicators | Distribution with suppression at cohort 5 | — | fairness tests ×1 | E05-04 | IMPLEMENTED_UNVERIFIED | PENDING |
| E13-01 | NOT_RESOLVED | 10 | Synthetic dashboard clearly marked | Synthetic labels + limitation lists throughout | Producer share not on this page | build + unit | E13-02 | PARTIALLY_IMPLEMENTED | PENDING |
| E13-02 | NOT_RESOLVED | 10 | Definitions documented, denominators available | `{numerator, denominator, value}` everywhere | — | fulfillment tests ×1 | — | IMPLEMENTED_UNVERIFIED | PENDING |
| E13-04 | NOT_RESOLVED | 10 | Missing hours unknown, never zero | `UNAVAILABLE` with reason; `AVAILABLE` only with positive observed minutes | No production-time store yet | earnings tests ×1 | — | PARTIALLY_IMPLEMENTED | PENDING |
| E13-05 | NOT_RESOLVED | 10 | Cohort suppression + role checks | Suppression + organization-scoped role check | — | suppression test | E04-09 | IMPLEMENTED_UNVERIFIED | PENDING |

## Batch 11 — Operational collaboration

| BACKLOG_ID | GITHUB_ISSUE | BATCH | ORIGINAL_CRITERIA | IMPLEMENTED_CRITERIA | MISSING_CRITERIA | TEST_EVIDENCE | DEPENDENCIES | CODE_STATUS | OWNER_ACCEPTANCE |
|---|---|---|---|---|---|---|---|---|---|
| E02-05 | NOT_RESOLVED | 11 | Revisions with traceable history | Pre-existing revision chain retained | No new editor | not re-tested | — | IMPLEMENTED_UNVERIFIED | PENDING |
| E02-07 | NOT_RESOLVED | 11 | Conversation tied to participants | Order-scoped discussions + internal filtering | — | service path | E02-05 | IMPLEMENTED_UNVERIFIED | PENDING |
| E06-05 | NOT_RESOLVED | 11 | Exception visible, resolution logged | Full lifecycle + original preserved | — | exception tests ×2 | E06 execution | IMPLEMENTED_UNVERIFIED | PENDING |
| E06-06 | NOT_RESOLVED | 11 | Impact shown, affected parties approve | Previous/proposed, pending until buyer approves | Multi-batch cascade | schedule tests ×1 | E06-05 | IMPLEMENTED_UNVERIFIED | PENDING |
| E04-05 | NOT_RESOLVED | 11 | Permission scoped, logged, revocable | Pre-existing authorization/delegation | Not re-implemented; no acceptance authority granted | not re-tested | — | IMPLEMENTED_UNVERIFIED | PENDING |
| E04-07 | NOT_RESOLVED | 11 | No automatic acceptance | `ARTISAN_ACCEPTED` is the only agreement state | Terms not written back to the offer | counteroffer tests ×2 | E04-02 | PARTIALLY_IMPLEMENTED | PENDING |
| E04-08 | NOT_RESOLVED | 11 | No new offers until restored | Pause blocks eligibility; commitments and pay preserved | — | pause test | E05-01 | IMPLEMENTED_UNVERIFIED | PENDING |
| E04-09 | NOT_RESOLVED | 11 | No nonmember finance or biometric access | Pre-existing projections enforce this | Not re-implemented | inspection only | E04-06 | IMPLEMENTED_UNVERIFIED | PENDING |
| E19-01 | NOT_RESOLVED | 11 | Versioned, captioned, language, printable | Versioned instructions + captions + language field | No illustrated renderer built | not tested | E20-01 | PARTIALLY_IMPLEMENTED | PENDING |
| E19-03 | NOT_RESOLVED | 11 | Private to support, not an exclusion criterion | Support-case category, reporter-scoped, never a ranking input | — | service path | E14-03 | IMPLEMENTED_UNVERIFIED | PENDING |
| E14-03 | NOT_RESOLVED | 11 | Lifecycle, attachments, owner, deadlines | Lifecycle + events + owner + due date | Attachments are references only | ticket test | — | IMPLEMENTED_UNVERIFIED | PENDING |
| E14-06 | NOT_RESOLVED | 11 | Opt-in, localized, delivery tracked | Opt-in + honest status tracking | No localised template catalogue | notification test | — | PARTIALLY_IMPLEMENTED | PENDING |

## Required negative-test coverage

These scenarios are modelled in the service layer and partly unit-tested. Those requiring a live database
are marked **UNVERIFIED**.

| # | Scenario | Guard location | Verified |
|---|---|---|---|
| 1 | Buyer reaching another buyer's RFQ | `ProcurementService.access` (pre-existing) | UNVERIFIED (DB) |
| 2 | Coordinator reaching unrelated artisan records | `CollaborationService.access`, `visibleOffer` | UNVERIFIED (DB) |
| 3 | Artisan editing another artisan's counteroffer | `counter()` / `acceptCounter()` profile match | UNVERIFIED (DB) |
| 4 | Operator overriding hard constraints | `override()` eligibility/capacity checks | Unit-adjacent; DB run UNVERIFIED |
| 5 | Unauthorized sample approval | `approve()` buyer organization + permission | UNVERIFIED (DB) |
| 6 | Cross-org product document access | `sample()` / `workspace()` scoping | UNVERIFIED (DB) |
| 7 | Duplicate capacity reservation | `AllocationPlanItem` unique + existing capacity projection | UNVERIFIED (DB) |
| 8 | Price suggestion mutating a quote | `pricing()` has no write path | Verified by inspection |
| 9 | Analytics exposing private compensation | organization-scoped totals only | Verified by inspection |
| 10 | Small cohort disclosure | `offerDistribution` / `supressOutcome` | Unit verified |
| 11 | Unauthorized schedule modification | `decideSchedule` buyer authority | UNVERIFIED (DB) |
| 12 | Coordinator impersonating artisan consent | counteroffer acceptance requires artisan identity | UNVERIFIED (DB) |
| 13 | Notification leakage | `notify()` recipient-scoped; internal filtering | Unit verified (plan) |
| 14 | Financial detail in buyer discussion | no financial field exists in the discussion contract | Verified by inspection |
| 15 | Revoked grants and suspended memberships | every `access()` filters `status: 'ACTIVE'` | UNVERIFIED (DB) |
| 16 | Cross-visitor demo isolation | untouched pre-existing demo module | UNVERIFIED (DB) |
| 17 | Unsupported accountless acceptance | pre-existing blocker retained | UNVERIFIED (DB) |
| 18 | Synthetic relabelled as verified | evidence classes are explicit; verified paid hard-coded to 0 | Verified by inspection |

## Summary

| Code status | Count |
|---|---|
| IMPLEMENTED_UNVERIFIED | 22 |
| PARTIALLY_IMPLEMENTED | 7 |
| BLOCKED | 0 |
| NOT_STARTED | 0 |
| Owner-accepted | **0** |

## What the owner can review now

Deterministic engines, invariants, authorization design, evidence-labelling discipline and the refusal to
fabricate accuracy or payments. Nothing should be marked accepted, closed or shipped until the integration
suite, browser journeys and demo reset run against a real PostgreSQL instance.
