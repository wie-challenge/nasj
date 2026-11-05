# Batch 8 — Intelligent Matching & Production Planning

Engineering review: 28 October 2026, Africa/Tunis. Repository: `website/`. Work extends the existing
NestJS/Next.js/Prisma platform on branch `feat/nasj-showroom-competition-package`. No GitHub issue was
edited. No persistent database was migrated. No production deployment occurred.

## A. Backlog coverage

Source: `HirfaCare_FINAL_Full_Project_Backlog.md` v2.0 (sibling docs repository). Issue numbers are **not**
recorded here because this environment has no authenticated GitHub access and the requirement forbids
inventing them. Every row is therefore `GITHUB_ISSUE = NOT_RESOLVED_IN_THIS_ENVIRONMENT`.

| ID | Original criterion | Implemented | Remaining | Code status |
|---|---|---|---|---|
| E05-02 | Show criteria, weights, missing data and no health attributes | Deterministic `rankCandidates` returns tier, per-candidate explanation, unknown codes and blocking codes. Inputs are craft, qualifications, availability, capacity, commitments, equipment and geography. Health/wearable/decline history are not inputs. | Weights are expressed as ordered tiers rather than numeric weights; this is a deliberate design choice, not an omission. | IMPLEMENTED_UNVERIFIED |
| E05-03 | No negative quantity, no oversubscription, totals reconcile | `validateAllocation` enforces whole non-negative pieces, no duplicate group, no UNIT mixing, no capacity oversubscription, no over-allocation and reports unallocated remainder. Persisted via `AllocationPlan`/`AllocationPlanItem`. | Concurrent-conflict test requires PostgreSQL. | IMPLEMENTED_UNVERIFIED |
| E05-04 | Offer created without becoming an active assignment; worker acceptance required | `issueOffers` calls the existing `ProductionOfferService.createOffer` per plan item, so offers stay `PREPARED` and artisans must accept. Accountless acceptance remains blocked. | End-to-end concurrency proof needs a database. | IMPLEMENTED_UNVERIFIED |
| E05-05 | Capacity released and replacements tracked with audit trail | `reallocate` re-derives item state from authoritative offers, releases declined/expired quantity exactly once via `releasableQuantity`, never releases accepted work, and returns replacement candidates. | Replacement *offer creation* is a separate authorised step, not automatic. | IMPLEMENTED_UNVERIFIED |
| E05-07 | Required reason and actor logged | `AllocationOverride` stores original recommendation, selected alternative, acting user, business scope, explanation, timestamp and decision version. Hard constraints (ineligible, unknown capacity, capacity exceeded) are refused before the override is written. | — | IMPLEMENTED_UNVERIFIED |
| E11-01 | Recommendations show rule inputs and do not infer health traits | `RankingCandidate.explanation` carries the recorded eligibility findings; `RecommendationPolicy` persists the input and excluded lists. | — | IMPLEMENTED_UNVERIFIED |
| E11-02 | Always show calculation and confidence limitations | `suggestPricing` returns exact millime components, effective hourly pay, `missing` fields and explicit `limitations`; the response always states it is not a quotation and never mutates a quote. | No trained-model accuracy is claimed anywhere. | IMPLEMENTED_UNVERIFIED |
| E11-03 | Deterministic schedule calculations and assumptions shown | `simulateDelivery` does weekly arithmetic, returns per-line weeks, earliest completion, unallocated work, deadline feasibility and an explicit `unknowns` list plus the assumptions used. | — | IMPLEMENTED_UNVERIFIED |

Regression targets (not completion claims): E05-01 (candidate filtering) is provided by the existing
eligibility assessment reused here; E05-09 (transaction safety) reuses `iamTransaction` advisory locks;
E04-02/E04-03 (offer terms and acceptance) are untouched; E03-01/E03-02 (feasibility and costing) are reused
through the accepted quotation.

## B. Working journeys

1. An assigned operator opens `/operator/planning`, chooses a procurement request, and resolves its order.
2. The planning workspace loads the latest persisted eligibility assessment per artisan and renders tiers.
3. Candidate groups with known free capacity are `RECOMMENDED`; unknown capacity is `REVIEW`; failed hard
   constraints are `EXCLUDED`, each with its recorded reason.
4. The operator accepts or edits the suggested allocation and saves a **draft** plan. A draft is not a
   commitment and creates no reservation.
5. Reviewing the plan revalidates every invariant server-side before the state moves to `REVIEWED`.
6. Preparing offers calls the existing offer service, producing `PREPARED` offers that each artisan must
   personally accept.
7. Declined or expired quantity is released once and replacement groups are proposed for human review.
8. Human overrides are recorded with a mandatory explanation and cannot bypass hard constraints.

## C. Architecture

- `packages/contracts/src/planning.ts` — pure, framework-independent ranking, allocation validation,
  suggestion, reallocation, pricing and simulation. No NestJS or Prisma import.
- `apps/api/src/modules/procurement/planning.ts` — `ProductionPlanningService`: authorization, persistence,
  transactions, idempotency and audit.
- Controller routes added to the existing `ProcurementController`; the service is registered in
  `CommerceModule` alongside the offer service it reuses.
- `apps/web/src/components/production-planning-workspace.tsx` plus `/operator/planning` and
  `/operator/planning/[orderId]`.

The engine is deterministic and advisory. A future approved AI service could supply *candidate ordering*
through the same contract, but business constraints and artisan acceptance remain authoritative because they
are enforced in the service layer, not the ranking layer.

## D. Database changes

Migration `20261028010000_production_planning` (additive only, `BEGIN`/`COMMIT`, 6 tables, no `DROP`):
`RecommendationPolicy`, `RecommendationSnapshot`, `AllocationPlan`, `AllocationPlanItem`,
`AllocationOverride`, `ScheduleScenario`. Constraints of note: `@@unique([orderId, version])` on plans,
`@@unique([planId, artisanProfileId])` on items, `offerId` unique so one offer cannot serve two items, and
`replacementForId` unique so a replacement chain cannot fork. All foreign keys use `ON DELETE RESTRICT`.

## E. APIs

| Method | Route | Permission |
|---|---|---|
| GET | `/api/v1/procurement/orders/:id/planning` | assigned operator |
| POST | `/api/v1/procurement/orders/:id/allocation-plans` | assigned operator |
| POST | `/api/v1/procurement/allocation-plans/:id/review` | assigned operator |
| POST | `/api/v1/procurement/allocation-plans/:id/offers` | assigned operator |
| POST | `/api/v1/procurement/allocation-plans/:id/reallocate` | assigned operator |
| POST | `/api/v1/procurement/allocation-overrides` | assigned operator |
| POST | `/api/v1/procurement/orders/:id/pricing-suggestion` | assigned operator |
| POST | `/api/v1/procurement/orders/:id/delivery-simulation` | assigned operator |

Every mutating route requires `operator.production.manage` **and** a live `OperatorAssignment` scoped to the
buyer organization, requires an `Idempotency-Key`, validates input with zod `.strict()`, and writes an
`AuditEvent` plus an outbox row.

## F. Business rules

- **Ranking order:** tier (`RECOMMENDED` < `REVIEW` < `EXCLUDED`), then known free pieces descending, then
  stable profile id. Unknown capacity sorts after known capacity and is never coerced to zero or infinity.
- **Allocation totals:** `allocated = Σ line.quantity`, `unallocated = required − allocated`, and
  `unallocated ≥ 0`; `OVER_ALLOCATED` is raised when the sum exceeds the requirement.
- **Suggestion:** greedy fill in rank order, capped at 8 groups, stops at known capacity and reports the
  remainder instead of oversubscribing.
- **Release:** `releasableQuantity` returns the item quantity only for non-accepted `OFFERED`/`DECLINED`/
  `EXPIRED`/`RELEASED`/`DRAFT` items and zero for accepted work.
- **Pricing:** variable lines prorated once to millimes, fixed lines charged once, contingency prorated once,
  total prorated once for unit cost. Effective hourly = unit pay × 60 ÷ minutes, `null` when effort is
  unknown. Contribution is computed only when a contribution rate is supplied.
- **Simulation:** `weeks = ceil(quantity / weeklyThroughput)` where throughput is documented weekly pieces
  minus committed work spread over committed weeks; a plan finishes at its slowest line.

## G. Security

Authorization is enforced in the service, not the client: `gate()` resolves membership, requires
`operator.production.manage`, then requires a live `OperatorAssignment`. Resource ids are opaque and a
non-member receives `404` rather than `403` to avoid existence disclosure. All writes are idempotent through
`replaySafe` with a resource-scoped key. Overrides cannot select an `INELIGIBLE` candidate, unknown capacity
or quantity above documented capacity. No health, wearable or decline-history field exists in the ranking
contract.

## H. Tests

Executed in this environment:

- `pnpm --filter @nasj/contracts build` — PASS.
- `node --import tsx --test test/unit/planning.test.ts` — PASS, 10 tests, 0 failures.
- `node --import tsx --test test/unit/*.test.ts` — PASS, 108 tests (74 pre-existing + 34 new across Batches
  8–11), 0 failures, 0 skipped.
- `pnpm lint` — PASS, 379 files.
- `pnpm --filter @nasj/api typecheck` — PASS.
- `pnpm --filter @nasj/web typecheck` — PASS.
- `pnpm build` — PASS.

Not executable here:

- `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:e2e:demo` — **blocked**. No PostgreSQL is running
  (port 5442 refused) and no Docker daemon is reachable, and the sandbox denies the `tsx` IPC pipe
  (`EPERM: listen`). Migrations were therefore **not executed against any database**.

## I. Limitations

- Capacity, effort and lead-time figures in the demonstration are synthetic. The engine says so.
- No numeric weights are exposed; ordering is by documented tier and capacity.
- Replacement offers require a separate authorised action; reallocation proposes, it does not assign.
- Integration, concurrency and browser journeys are unverified in this environment.

## J. Next readiness

Ready for owner review of the deterministic engine, invariants and authorization design. Not ready to claim
concurrent-safety acceptance until the integration suite runs against PostgreSQL.
