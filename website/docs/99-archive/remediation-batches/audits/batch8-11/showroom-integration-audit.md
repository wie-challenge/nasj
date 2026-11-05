# Showroom Integration Audit — Batches 8–11

Date: 28 October 2026. Repository: `website/`.

## 1. Verdict

**The isolated showroom cannot demonstrate any Batch 8–11 functionality.**

Verified by direct search of `apps/api/src/modules/demo/demo.seed.ts` for every new model — **all zero**:

| Model | References in `demo.seed.ts` |
|---|---|
| `AllocationPlan` | 0 |
| `ProductSpecification` | 0 |
| `ProductSampleRequest` | 0 |
| `ProductionException` | 0 |
| `OrderDiscussion` | 0 |
| `Counteroffer` | 0 |
| `NotificationDelivery` | 0 |

The seed was **not extended** by Batches 8–11. The routes exist and compile, but they will render empty states
in the showroom because no synthetic rows back them.

## 2. Existing journeys (unchanged, pre-existing)

The Batch 6/7 seed still produces: buyer RFQ → procurement revision → quotation → acceptance → order →
production offers → artisan acceptance → release → progress → QA → logistics → buyer confirmation →
traceability → payables → demo reset. This remains intact; Batches 8–11 did not modify it.

## 3. Required journey vs. actual

The brief specifies this chain. Column 3 is the truth:

| Step | Route exists | Seeded data | Demonstrable |
|---|---|---|---|
| Shared RFQ | yes | yes | **yes** |
| Production planning (`/operator/planning`) | yes | **no** | **no** |
| Multi-group allocation | yes | **no** | **no** |
| Production offers from plan | yes | **no** | partially — offers exist from the old path, not from a plan |
| Specification revision (`/catalog`) | yes | **no** | **no** |
| Paid sample | yes | **no** | **no** |
| Buyer approval (catalogue) | yes | **no** | **no** |
| Production progress | yes | yes | **yes** |
| Risk indicators (`/intelligence`) | yes | derived from existing batches | **partially** — will render, but from old-path data |
| Exceptions (`/collaboration`) | yes | **no** | **no** |
| Analytics (`/intelligence`) | yes | derived | **partially** |
| Reset | yes | yes | **yes** |

"Partially" means the page renders and computes from pre-existing synthetic records; it does not demonstrate
the new workflow.

## 4. Reset implications

`DemoService.reset` (lines 389–478) archives only the current generation's:
`TraceabilityPublication` (revoked), sessions (deleted), users (disabled), `DemoScenario` (archived).

It **does not** need per-table cleanup for the new models, because `seedDemoScenario` creates fresh
organizations per generation with a `scenarioId`-scoped slug (`showroom-<kind>-<scenarioId>`). Every new table
hangs off those organizations or their orders, so a new generation cannot see a previous generation's
planning, catalogue or collaboration rows. Isolation would hold **provided the seeder inserts the new rows
under the new generation's organizations**.

The existing reset reconciliation (`DEMO_SEED_INCONSISTENT` when totals differ) would need its expected totals
extended once new records are seeded — otherwise reset will fail its own consistency check.

## 5. What would be required (not implemented)

1. Extend `DemoSeedSpec` and `seedDemoScenario` to create: one `RecommendationPolicy` (v1), one
   `RecommendationSnapshot`, one `AllocationPlan` with 2–3 items, one approved `ProductSpecification` revision,
   one `ProductSampleRequest` at `UNDER_REVIEW` with a positive compensation, one `ProductionException` in
   `OPEN`, one `OrderDiscussion` with one message, one `SupportTicket`, and 2–3 `NotificationPreference` rows.
2. Extend `initialTotals`/`totals()` so the reset reconciliation still matches.
3. Add a demo browser spec (`tests/demo-e2e/`) walking planning → allocation → sample → risk → exception → reset.
4. Bump `DEMO_SEED_VERSION`.

## 6. Risk if seeded naively

- New rows must reference the **new** generation's organizations, or reset isolation breaks (P0).
- Seeded sample compensation must be positive, or the sample cannot leave `TERMS_PENDING` (correctly).
- Any seeded risk state must derive from real progress rows, not a literal status, or the demo would assert an
  outcome the engine did not calculate.
- `pnpm demo:setup` was **not** run in this audit and must not be run without explicit authorization.
