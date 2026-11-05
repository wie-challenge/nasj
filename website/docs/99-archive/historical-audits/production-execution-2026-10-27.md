# Production execution, quality and consolidation — 27 October 2026

Stories #52, #53, #54, #119, #124, #126, #51, #55, #56, #57, #134 and #58 are implemented in the website working tree. They are not accepted. GitHub issues were not closed. #34, #43, #46, #35, #36, #37, #40, #47, #44 and #45 remain unaccepted prerequisites. An accountless assisted decision still cannot become acceptance.

The procurement commercial order stays `APPROVED`. Production progress is a separate stage on the accepted `CommercialBatch`. Reported pieces, inspected pieces, quality-approved pieces and pieces prepared for shipment are different quantities. Preparation is not shipment, delivery, or buyer acceptance.

## Release

`POST /api/v1/procurement/batches/:id/release` is allowed only for an assigned internal member with `operator.production.manage`. The batch must be `ACCEPTED`, the offer must be accepted by the artisan, and there must be no assisted decision on that offer. Participation must be active. The approved sample must belong to the quotation revision that the offer locked. A bill of materials must already be stored for that revision.

Live release also requires a material attestation and a funding attestation. The only accepted strings are `SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT` and `SYNTHETIC_DEMO_NOT_A_PAYMENT`. A feasibility note is not stock. Quotation acceptance is not payment. A record whose provenance is not `SYNTHETIC` is refused even if those strings are sent. The order status does not change and no payment row is written.

A repeated request with the same idempotency key returns the original release. A second key returns 409 `ALREADY_RELEASED`. Release moves the batch to `MATERIAL_READY`. That status means the synthetic attestation was recorded. It does not mean materials were received.

## Instructions and progress

Artisans with accounts see their own batches at `GET /my-batches` and on the artisan commerce workspace. An assigned coordinator with `association.production.update`, a current assignment, and a current management authorization sees those batches at `GET /assigned-batches`. The screen says when a coordinator recorded the progress. Instructions stay on the accepted quotation revision. A later revision does not replace them. Reference images are not stored. English is disclosed when the profile language is not English.

Progress is a cumulative total, not an increment. Replaying a request does not add the quantity again. The total cannot exceed the accepted batch quantity. Corrections append a new event and may lower the cumulative total only while the batch is `IN_PROGRESS`. The original event stays. A flag records a dispute and does not change the total. The ledger source is `ARTISAN`, `COORDINATOR`, or `OPERATOR`. The state-machine edge still uses the artisan transition class. That class is not the identity of the person who recorded the event.

Submit copies the reported total into the submitted quantity. It does not approve anything.

## Materials

Material lines are append-only on the locked specification revision. Units are `METERS`, `PIECES`, and `UNITS`. There is no silent conversion. Required quantity is thousandths per finished piece times the batch quantity, with optional wastage in basis points, rounded half up. Before release, readiness is `AVAILABILITY_UNKNOWN`. After the synthetic attestation, the batch snapshot is `SYNTHETIC_ATTESTED_NOT_PHYSICAL_RECEIPT`. `RECEIVED` is rejected by the database. This is a bill of materials, not inventory, purchasing, or warehouse stock.

## Quality

Inspection criteria are append-only on the same revision. An inspection must cover every required criterion once. Required criteria cannot be marked not applicable. A failing result with no rejected or pending pieces is refused. Evidence-required criteria need a note. Photographs are not stored.

Approved, rejected and pending must equal the quantity in scope. The first inspection’s scope is the submitted quantity. A second inspection of the same pieces is a new attempt, not an overwrite. Reinspection can cover only pieces that are still rejected. It does not increase the manufactured total. Net approved quantity is the earlier approved quantity plus the pieces approved from the rejected scope. Rejected pieces stay out of preparation.

The permission is the existing `operator.quality.approve`, plus an operator assignment. A coordinator who can see the batch cannot approve it.

## Consolidation

`POST /orders/:id/consolidations` allocates quality-approved pieces that are not already prepared. It refuses rejected pieces, pending pieces, another buyer’s order, a different specification revision, and a quantity above the remaining approved amount. Two concurrent requests cannot allocate the same pieces. The preparation status is only `PREPARED`. The order’s delivered quantity stays 0. Creating a preparation does not mark pieces shipped. A later shipment can change the execution summary; see [logistics, traceability and simulated settlement](logistics-traceability-2026-10-27.md). A partial preparation leaves the order incomplete.

## Capacity

Progress, inspection, reinspection and preparation do not write a second capacity ledger and do not return weekly throughput. An accepted offer stays committed. Hours and pieces stay separate. The Africa/Tunis half-open period is unchanged.

## Routes

All of these are under `/api/v1/procurement`. Mutations need the Nest session, CSRF, origin check and `Idempotency-Key`. Unrelated callers receive 404. A related caller without the permission receives 403. A platform administrator without membership does not bypass that. A suspended membership loses access on the next request.

| Route | Who |
|---|---|
| `GET /orders/:id/execution` | Assigned operator with `operator.production.manage` sees batches, materials and criteria. The buyer member sees aggregate quantities only. |
| `POST /orders/:id/material-lines` | Assigned operator with `operator.production.manage` |
| `POST /orders/:id/inspection-criteria` | Same |
| `POST` and `GET /orders/:id/consolidations` | Same for the write. The buyer read is the aggregate preparation total. |
| `POST /batches/:id/release` | Same production operator |
| `GET /batches/:id/instructions`, `/materials`, `/progress`, `/events`, `/inspections` | Artisan owner, assigned coordinator, or assigned operator |
| `POST /batches/:id/start`, `/progress`, `/submit` | Artisan owner or assigned coordinator with `association.production.update` |
| `POST /batches/:id/progress-corrections` | Artisan, assigned coordinator, or production operator |
| `POST /batches/:id/progress-flags` | Anyone who can see the batch |
| `POST /batches/:id/inspections` and `/reinspections` | Assigned operator with `operator.quality.approve` |
| `GET /my-batches` | Linked artisan |
| `GET /assigned-batches` | Coordinator with current assignment and management. No permission returns an empty list. |

## Database

Migration `20261027040000_production_execution` is additive. It adds `SpecificationMaterialLine`, `InspectionCriterion`, `BatchRelease`, `BatchMaterialRequirement`, `ProductionProgressEvent`, `ProductionLedgerEvent`, `QualityInspectionAttempt`, `InspectionCriterionResult`, `ShipmentPreparation` and `ShipmentPreparationItem`, plus nullable `CommercialBatch.revisionId`. New rows are append-only. It was applied only to disposable test databases.

## Checks

| Command | Result |
|---|---|
| `pnpm lint` | Pass, 284 files |
| `pnpm typecheck` | Pass |
| `pnpm --filter @nasj/api test` | Pass, 60 unit tests |
| `pnpm --filter @nasj/web test` | Pass, 9 unit tests |
| `pnpm test:integration` | Pass, 108 disposable PostgreSQL scenarios, including release, assisted progress, inspection, reinspection, consolidation and the accountless verification block |
| `pnpm test:e2e` | Pass, 34/34 |
| `pnpm build` | Pass |

## Not done

No development or production database was migrated. No physical inventory, supplier purchase, or warehouse receipt exists. No buyer payment or credit authorization exists. The synthetic release path is labeled and cannot be used for a non-synthetic record. This slice stops at preparation. Shipment, pickup, custody, buyer confirmation, public traceability and simulated settlement are a later working-tree slice and are not accepted here. Rework negotiation, unpaid extra work and deadline changes are not implemented. Photographs and reviewed translations are not stored. Owner acceptance of this slice and of the earlier commercial slices is still open.
