# Production eligibility and voluntary offers — 27 October 2026

Stories #47, #44 and #45 are implemented in the website working tree. Local checks passed. They are not accepted. GitHub issues were not closed. Accepted #43 and accepted #46 are still open gates for #47. Accepted #43 is still an open gate for #44. #45 also waits on accepted #44. #32 is already closed.

Buyer acceptance of a quotation creates a commercial order. It does not mean an artisan has agreed to do the work.

## Security repairs

`POST /api/v1/procurement/effort-assumptions` now requires `operator.quotation.prepare`. `finance.quotation.read` no longer writes an effort row. An approved write records `effort.recorded`.

`POST /api/v1/procurement/rfqs/:id/quotes` remains for requests that have no feasibility assessment and no cost estimate. Once either exists, the route returns 409 `COSTED_QUOTATION_REQUIRED` and inserts nothing. A hash-less quote cannot be accepted after that point. The E02 procurement journey, which never records feasibility, still issues and accepts its quotation.

Procurement-managed orders cannot be offered through `POST /api/v1/commerce/offers`. That route remains for non-procurement planning orders.

## Eligibility

`assessCandidate` in `packages/contracts/src/eligibility.ts` is a pure function. It returns `ELIGIBLE`, `INELIGIBLE` or `NEEDS_REVIEW` with reason codes. Unknown capacity, an unknown period, an unverified product restriction, a capacity constraint, or a feasibility result other than `FEASIBLE` produce `NEEDS_REVIEW`. A craft mismatch, inactive participation, paused availability, an inactive linked account, missing participation authority, a period mismatch, a wrong unit, or zero known remaining capacity produce `INELIGIBLE`.

The assessment reads artisan skill, participation, association management, the accepted quotation’s feasibility period, and `projectCapacity` for the matching piece declaration. It does not read the directory aggregate, health data, wearables, decline history, or the absence of a login. An accountless artisan with a current participation authorization can be eligible. An operator attestation that no further product restriction is recorded is stored as a reason. It does not waive capacity or consent.

Only the latest `ELIGIBLE` row can be offered. Rows are append-only.

## Offers and decisions

A new offer is `PREPARED`. That status does not reserve capacity. Issue moves it to `OFFERED` after rechecking eligibility, `projectCapacity`, and the order quantity. Accepted and reserved quantities are not double-counted. Pay is the approved `ARTISAN_LABOR` rate, in millimes. The client cannot submit a lower rate. Effort is scaled from the feasibility version. The offer stores `termsSha256`. Changing pay or effort after preparation requires a new offer.

The linked artisan accepts or declines through `POST /api/v1/commerce/offers/:id/actions`. The request must carry the current version and, when the offer has a hash, that hash. Acceptance creates one `CommercialBatch` and the quantity becomes committed. Decline releases the reservation once. An expired offer cannot be accepted. A coordinator cannot call this action for someone else.

An assigned coordinator may record an in-person report for an artisan who has no account. The row stays `PENDING_UNAPPROVED_METHOD`. Verification always returns 409 `VERIFICATION_UNAPPROVED`. No approved pilot method is on file, so the report is not consent and not a commitment.

## Routes

All production routes are under `/api/v1/procurement` except artisan accept and decline.

| Route | Permission |
|---|---|
| `POST` and `GET /orders/:id/eligibility-assessments` | Assigned internal member with `operator.production.manage` |
| `GET /orders/:id/production` | Same |
| `POST` and `GET /orders/:id/offers` | Same |
| `POST /offers/:id/issue` | Same |
| `POST /offers/:id/assisted-decisions` | Assigned coordinator with `association.offer.recordDecision`, and only for an accountless artisan |
| `POST /offers/:id/assisted-decisions/:decisionId/verify` | The coordinator who can see the report; the result is always 409 |
| `GET /assigned-offers` | Coordinator with `association.offer.recordDecision` |
| `POST /api/v1/commerce/offers/:id/actions` | The linked artisan |

Unrelated callers receive 404. Related callers without the permission receive 403. Administrator status does not bypass those checks.

## Database

Migration `20261027030000_production_offers` adds `EligibilityAssessment`, `AssistedOfferDecision`, nullable offer columns, and `PREPARED` to the offer status check. Assessment and assisted-decision rows are immutable. Existing offer rows stay valid. The migration was applied only to disposable test databases.

## Checks

| Command | Result |
|---|---|
| `pnpm lint` | Pass, 277 files |
| `pnpm typecheck` | Pass |
| `pnpm --filter @nasj/api test` | Pass, 56 unit tests |
| `pnpm --filter @nasj/web test` | Pass, 9 unit tests |
| `pnpm test:integration` | Pass, 107 disposable PostgreSQL scenarios |
| `pnpm test:e2e` | Pass, 33/33 |
| `pnpm build` | Pass |

## Not done

No live commercial data was used. No development or production database was migrated. Tax, legal signature and payment remain outside this slice. There is no approved way to turn an accountless report into acceptance. Product-restriction review is an operator attestation, not a legal product approval. English terms are disclosed when the profile language is not English; a reviewed translation is not generated. Later production, inspection and consolidation of an accepted batch are recorded in [production execution](production-execution-2026-10-27.md). The commercial order stays `APPROVED`.
