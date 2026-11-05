# Commercial decisions — #35, #36, #37, #40

Implemented in the website working tree on 27 October 2026. GitHub issues were not closed. Implemented does not mean accepted.

## Dependency gates

| Story | Prerequisite in the backlog | Repository state used here |
| --- | --- | --- |
| #35 Production feasibility | Accepted #33 and #34 | #33 is already closed. #34 and #46 are implemented in this working tree and are not accepted. Feasibility reads `DirectoryService.publishedCapacity`, which calls the corrected `projectCapacity`. This is a provisional dependency. |
| #36 Versioned costing | #35 | Built on the feasibility record from this batch. #35 itself is not accepted. |
| #37 Quotation summary | #36 | Costed issuance references one cost version and one feasibility version. |
| #40 Exact acceptance | #37 and #39 | #39 is already closed. Acceptance locks the issued quotation hash. #37 is not accepted. |

#43 is implemented and not accepted. Directory search remains discovery. This batch does not reserve capacity from a directory result.

## Journey

An assigned operator opens the existing request and uses the Quotes section.

1. The operator records a production period, unit, and any material, logistics, or calendar attestation they actually have.
2. The assessment returns `FEASIBLE`, `NOT_FEASIBLE`, or `NEEDS_REVIEW`, with shortages, unknowns, and the effort range copied from an approved assumption.
3. The operator saves a cost version. A missing required category stays incomplete and cannot be issued.
4. A complete version can be issued. The quotation stores the cost id, feasibility id, buyer-visible terms, and a SHA-256 of those terms.
5. An authorized buyer reviews the issued quotation, then accepts or rejects that version.
6. Acceptance writes one order and one immutable acceptance snapshot. The quotation row is not updated. A second decision returns 409.

The earlier free-typed `POST /rfqs/:id/quotes` path remains for the existing procurement flow.

## Feasibility

`assessFeasibility` is deterministic. It does not call a model and it does not invent a production rate, material stock, or sample approval.

`FEASIBLE` requires all of the following:

- The requested unit is `PIECES`. Hours are not converted into pieces.
- The production period ends before the delivery instant.
- Published capacity for that craft, unit, and exact period is fully known, and remaining pieces cover the quantity.
- An approved `EffortAssumption` exists for the craft and `PIECES`. Total hours are the per-piece range multiplied by quantity, in integer hundredths.
- Material status is `CONFIRMED_AVAILABLE` and the operator supplied a source.
- The current specification's latest sample decision is `APPROVED`.
- Logistics lead days and a calendar source were supplied.

A hard constraint (`INCOMPATIBLE_UNIT`, `DELIVERY_WINDOW`, `CAPACITY_SHORTAGE`, `MATERIAL_SHORTAGE`, `SAMPLE_REJECTED`, `SAMPLE_CHANGES_REQUESTED`) returns `NOT_FEASIBLE`. Any other unknown returns `NEEDS_REVIEW`. Unknown capacity is not treated as available. A shortage subtracts only compatible piece quantities. Weekly capacity is not multiplied by a number of weeks.

Published capacity uses the directory rule: the cohort must be fully known and at least 3 before a commercial viewer receives a number. Completed production stays consumed in that period. The assessment stores `reservation: false` and does not create offers.

Issuing a quotation from a `FEASIBLE` assessment reads `publishedCapacity` again. If the known remaining pieces no longer cover the quantity, issuance returns 409. A known shortage at issue time also returns 409. `NEEDS_REVIEW` may be issued only as a conditional quotation. `NOT_FEASIBLE` cannot be issued.

## Costing

Money uses the existing TND millime functions. One TND is 1000 millimes. Variable lines are `prorateTnd(rate, quantity, 1)`. Fixed lines use the rate once. The subtotal is the exact sum.

`MARKUP_ON_COST` adds `prorateTnd(subtotal, basisPoints, 10000)`. `MARGIN_ON_SELLING_PRICE` uses `prorateTnd(subtotal, 10000, 10000 - basisPoints)` and rejects 10000 basis points. The two formulas are not interchangeable. For quantity 100, materials 2.000 variable, labor 3.000 variable, quality 30.000 fixed, logistics 20.000 fixed, overhead 50.000 fixed and contingency 0.000 fixed, the subtotal is 600.000 TND. A 1000 basis-point markup sells at 660.000. The same basis points as a selling-price margin sells at 666.667.

Required categories are materials, artisan labor, quality assurance, logistics, overhead, and contingency. A missing category keeps `sellingTnd` null and `incomplete` true. Labor is not reduced to hit a target price. Tax status is always `PENDING_LEGAL_REVIEW`. Each save inserts a new version. Older rows stay reproducible. Database triggers reject updates and deletes of effort, feasibility, and cost rows.

## Quotation and acceptance

A costed quotation copies buyer-visible terms and hashes the sorted `key=value` lines. The hash does not include itself. Buyer detail removes the `internal` object, so artisan compensation and the other cost components are not in the buyer payload. Operators still see the components.

`ProcurementQuote` is append-only, including the new status column. Effective status is derived:

- `ACCEPTED` when an acceptance exists
- `REJECTED` when a rejection row exists
- `SUPERSEDED` when a later quotation version exists
- `EXPIRED` when the expiry is not in the future
- otherwise `ISSUED`

Acceptance requires the owning organization's `buyer.quotation.approve` grant, the current issued version, the current specification revision, a future expiry, a future delivery date, and the matching hash when one was stored. Legacy quotations have a null hash and keep the previous acceptance check. The acceptance snapshot records `capacityReserved`, `artisanAccepted`, `paymentReceived`, and `legalSignature` as false, with `legalStatus` `DEMO_ONLY_NOT_A_BINDING_CONTRACT`. No commercial offer is created.

Rejection inserts `ProcurementQuoteRejection`. A second rejection or an acceptance of a rejected, expired, superseded, or foreign quotation returns 409.

## Migration

`20261027020000_commercial_decisions` adds `EffortAssumption`, `FeasibilityAssessment`, `CostEstimate`, and `ProcurementQuoteRejection`. It adds nullable feasibility and cost references plus `termsSha256` and a default `ISSUED` status on `ProcurementQuote`. Existing quotation rows were not deleted. New evidence tables use the existing append-only trigger. Development and production databases were not migrated by this verification. Disposable integration and browser databases apply the migration themselves.

## Verification

Recorded after the local commands in this working tree. GitHub status was not changed.

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass. 270 files. |
| `pnpm typecheck` | Pass. |
| `pnpm --filter @nasj/api test` | Pass. 53 unit tests. |
| `pnpm --filter @nasj/api test:integration` | Pass. 106 disposable PostgreSQL scenarios, including the commercial journey and the existing procurement scenarios. |
| `pnpm --filter @nasj/web test` | Pass. 9 unit tests. |
| `pnpm exec playwright test tests/e2e/commercial.spec.ts` | Pass. One browser journey: invalid period, hours blocked, unknown material held for review, feasible remaining 130.00, markup 660.000 TND, buyer acceptance, stale hash 409, mobile width. |
| `pnpm test:e2e` | Pass. 32/32, including the existing procurement journeys and the commercial journey. |
| `pnpm build` | Pass. Contracts, API and Next.js production build. |
