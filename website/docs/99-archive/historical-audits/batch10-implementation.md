# Batch 10 — Production Intelligence & Analytics

Engineering review: 28 October 2026, Africa/Tunis. Repository: `website/`. No GitHub issue was edited.

## A. Backlog coverage

| ID | Original criterion | Implemented | Remaining | Code status |
|---|---|---|---|---|
| E11-04 | Thresholds tested against recorded progress, no fake ML accuracy | `assessDelayRisk` classifies `ON_TRACK`/`AT_RISK`/`OVERDUE`/`INSUFFICIENT_DATA` from accepted quantity, recorded progress, confirmed capacity, open shortages, quality rejections and approved schedule changes, returning reasons and unknowns. Published thresholds: capacity shortfall, imminence ≤ 3 days, passed deadline. | Integration fixtures against live batch data unverified. | IMPLEMENTED_UNVERIFIED |
| E06-07 | Rules-based alert triggered from deadlines and confirmed progress | Same engine; `/intelligence` lists at-risk and overdue batches. Unresolved critical material shortages from Batch 11's exception model also feed readiness. | The exception model is wired for readiness flags; combining it live with risk requires the DB. | IMPLEMENTED_UNVERIFIED |
| E11-05 | Error metrics computed only when genuine reference data exists | `compareForecast` returns `COMPARABLE` only with both a preserved forecast and an observed completion; `forecastErrorSummary` returns `null` metrics when no comparable observation exists and says so. | Forecast instants currently use the release/expiry record; a dedicated forecast snapshot table was not added. | PARTIALLY_IMPLEMENTED |
| E11-06 | Feature and decision logs support privacy-safe audits | `/intelligence` reports ranking policy version, recommendation snapshot count, override count and insufficient-data count. Override detail is available per plan from Batch 8. | A dedicated reviewer-facing diff view is minimal. | IMPLEMENTED_UNVERIFIED |
| E05-06 | Analyze order distribution with privacy-aware aggregate indicators | `offerDistribution` computes offered/accepted/declined/expired with share percentages, suppresses any cohort below `MINIMUM_COHORT = 5`, and states that a decline is not a penalty. | — | IMPLEMENTED_UNVERIFIED |
| E13-01 | Synthetic dashboard clearly marks demo numbers; producer share aggregate only | Persistent synthetic banner plus per-page limitation list; every figure derives from stored synthetic records. | Producer share is not shown on this dashboard; the existing simulator already publishes it with its formula. | PARTIALLY_IMPLEMENTED |
| E13-02 | Metric definitions documented and denominators available | `fulfillmentMetrics` returns `{numerator, denominator, value}` for produced/approved/shipped/accepted and a zero denominator yields `null`. | — | IMPLEMENTED_UNVERIFIED |
| E13-04 | Missing hours marked unknown, never assumed zero | `effectiveEarnings` returns `UNAVAILABLE` with a reason for missing pay, `null` minutes or zero minutes, and `AVAILABLE` only with a positive observed duration. | Storing observed minutes per batch is not yet wired to a production time record. | PARTIALLY_IMPLEMENTED |
| E13-05 | Minimum group-size suppression and role checks apply | `supressOutcome` withholds all aggregates below the cohort minimum; `associationOutcomes` requires an authorized association membership and filters to that organization's members. | — | IMPLEMENTED_UNVERIFIED |

## B. Working journeys

1. An operator opens `/intelligence` and sees every batch in their scope with a risk state and its reasons.
2. A batch with a passed deadline and outstanding work reads `OVERDUE`; one with a capacity shortfall or an
   open critical shortage reads `AT_RISK`; one with no recorded progress reads `INSUFFICIENT_DATA`.
3. Forecast comparison shows comparable observations only, and states plainly when none exist.
4. Offer distribution is shown when the cohort is large enough and withheld otherwise.
5. Fulfillment and compensation blocks present separate, explicitly denominated figures.
6. An association member calls `/api/v1/intelligence/association-outcomes` for their own organization only.

## C. Architecture

- `packages/contracts/src/intelligence.ts` — pure risk, forecast, fairness, metrics and earnings functions.
- `apps/api/src/modules/intelligence/` — service reads authoritative tables (`CommercialBatch`,
  `ProductionProgressEvent`, `MaterialRequirement`, `QualityInspectionAttempt`, `ArtisanPayable`,
  `AllocationOverride`, `RecommendationSnapshot`) and never writes a second ledger.
- `intelligence-workspace.tsx` at `/intelligence`.

## D. Database changes

No new tables. Batch 10 reuses existing records plus Batch 8's `RecommendationSnapshot` /
`AllocationOverride` and Batch 11's `ProductionException`. This is deliberate: analytics must not become a
second source of truth.

## E. APIs

| Method | Route | Permission |
|---|---|---|
| GET | `/api/v1/intelligence` | `analytics.aggregate.read` or `operator.production.manage` |
| GET | `/api/v1/intelligence/association-outcomes?from=&to=` | authorized association role |

## F. Business rules

- `OVERDUE` requires `daysToDeadline < 0` **and** `remaining > 0`.
- `AT_RISK` requires at least one positive signal: capacity shortfall, open material shortage, open quality
  rejection, or `remaining > 0` within 3 days of the deadline.
- `INSUFFICIENT_DATA` when accepted quantity or recorded progress is `null`; the remaining quantity is then
  `null`.
- `meanAbsoluteError` is computed as `Σ|observed − forecast| / n` over comparable rows only.
- Suppression threshold is 5 participating groups; below that, `rows` is empty and no figure is emitted.
- Ratios are `null` when the denominator is zero.

## G. Security

- Analytics requires `analytics.aggregate.read` or `operator.production.manage`; association outcomes require
  an association or partner-cooperative membership **and** an association permission.
- Orders are filtered to the caller's operator organization unless the caller is a platform administrator.
- Cohort suppression prevents re-identification through small aggregates.
- No individual compensation is exposed through the aggregate endpoints; the compensation block is
  organization-scoped and reports totals only.
- No wearable, biometric or health data is read anywhere in this module.

## H. Tests

- `node --import tsx --test test/unit/intelligence.test.ts` — PASS, 13 tests covering on-track, at-risk,
  overdue, insufficient data, schedule-change deadline replacement, forecast comparability, empty-set
  metrics, cohort suppression, denominators, compensation separation and unknown-hours earnings.
- Full API unit suite — PASS, 108 tests. `pnpm lint`, typechecks and `pnpm build` — PASS.

Not executable here: integration and browser suites (no PostgreSQL/Docker; sandbox denies `tsx` IPC).

### Defect found and fixed during testing

An early version used an approved schedule change as the *clock* rather than as a replacement deadline,
producing `OVERDUE` for a batch whose deadline had legitimately moved. The unit test caught it; `now` is now
always the real clock and the approved change replaces the deadline.

## I. Limitations

- Forecast instants reuse the release/expiry record rather than a dedicated forecast snapshot; E11-05 stays
  partially implemented.
- Observed working hours have no dedicated production-time table yet, so E13-04 remains partial.
- All values are synthetic and labelled. Nothing here is a verified financial or accuracy claim.

## J. Next readiness

Ready for owner review of explainability, suppression and metric definitions. Not ready to claim real
forecast accuracy or observed-hours reporting until measured data exists.
