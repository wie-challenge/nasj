# Logistics, traceability and simulated settlement — 27 October 2026

Stories #135, #136, #59, #60, #137, #140, #141, #139, #142, #143, #144 and #61 are implemented in the website working tree. They are not accepted. GitHub issues were not closed.

#58 preparation remains the source of shippable pieces. `ShipmentPreparation` stays `PREPARED`. A shipment is a new record. #52, #53, #54, #119, #124, #126, #51, #55, #56, #57 and #134, and the earlier #34, #43, #46, #35, #36, #37, #40, #47, #44 and #45 stories, remain unaccepted. An accountless assisted decision still cannot become acceptance, a batch, a release, or a shipment.

The procurement order stays `APPROVED`. `CommercialOrder.delivered` stays 0. Reported, submitted, inspected, quality-approved, rejected, prepared, shipped, operator-reported and buyer-accepted quantities stay separate. Agreed compensation, recognized payable, scheduled simulation and verified payment stay separate.

## Shipment and pickup

`POST /api/v1/procurement/orders/:id/shipments` allocates prepared pieces that are not already on a shipment. It refuses a quantity above the remaining preparation, a preparation from another order, and pieces from more than one association. The shipment starts at `PICKUP_SCHEDULED`. That status is not shipped. A window that has already passed does not complete the pickup.

One order can have more than one shipment. Rescheduling is allowed only while the shipment is `PICKUP_SCHEDULED`. The previous window stays in `PickupSchedule`. A coordinator with `association.handover.record` sees only that association's pickups.

## Custody

The association records `COLLECTED_FROM_ASSOCIATION`. That event stays `PENDING` and does not change the shipment status. The assigned operator confirms `RECEIVED_AT_HUB` and only then moves the shipment to `COLLECTED`. A short collection is stored and cannot be confirmed as a full hub receipt. The operator then records `HANDED_TO_TRANSPORT`, which moves the shipment to `IN_TRANSIT`. That event is synthetic. It is not a carrier confirmation. The operator cannot record the association's collection or the buyer's receipt.

Shipped quantity on the execution summary counts `IN_TRANSIT`, `DELIVERY_REPORTED`, `BUYER_CONFIRMED` and `DISCREPANCY` only. `PICKUP_SCHEDULED` and `COLLECTED` do not count as shipped.

## Buyer confirmation

An operator delivery report is not buyer confirmation. The buyer member with `buyer.delivery.confirm` records received, accepted, missing and damaged pieces. Received plus missing must equal the reported delivery. Accepted plus damaged must equal received. When damaged is omitted, it is the difference between received and accepted. A difference moves the shipment to `DISCREPANCY` and stores an open discrepancy. A matching confirmation moves it to `BUYER_CONFIRMED`. One confirmation is stored per shipment. Another buyer organization receives 404. Confirmation does not change the order status, `CommercialOrder.delivered`, or `SyntheticPayment`. Payables use the accepted count only.

A pickup can be cancelled only while it is `PICKUP_SCHEDULED` and no handover has been recorded. Cancellation sets `CANCELLED`, keeps the earlier pickup row, and releases the prepared pieces for another shipment. A later handover blocks cancellation. Pickup windows are shown in Africa/Tunis. Stored timestamps stay absolute.

## Traceability

One publication exists per order. The states are `DRAFT`, `PENDING_REVIEW`, `PUBLISHED` and `REVOKED`. A correction from `PUBLISHED` returns the record to `PENDING_REVIEW` and hides the public page until it is published again. Draft and review use `operator.logistics.manage` plus assignment. Publish and revoke use `operator.traceability.publish` plus assignment. Coordinators and platform administrators do not receive that permission from their role.

The public address is `/trace/:token`. The token is a random UUID. An order id and an unpublished token return 404. A revoked token returns a status page with no previous story. The response sets `Cache-Control: no-store`. The page is read-only and does not require an account. A published page and the operator delivery tab render a QR matrix for that public address. Revocation removes the matrix with the story. The code is not a carrier tracking code.

The public snapshot contains the product title, craft name, approved story, the association's coarse region, synthetic provenance, and the producer-share basis. It does not contain artisan names, contacts, home addresses, individual pay, costs, buyer contract terms, or monitoring data. The story rejects an email sign and a run of six digits.

## Producer share

Policy version 1 is stored with the migration. The metric is named "Agreed direct artisan compensation share".

The numerator is the sum of accepted offer quantity times the agreed unit pay on those offers. It is agreed compensation. It is not earned compensation and it is not paid compensation.

The denominator is the accepted quotation total for the same order, minus recorded buyer refunds. This version has no refund ledger, so the denominator is the quotation total.

Tax is excluded from both sides. Tax treatment remains pending legal review. A refund would reduce only the denominator. Partial delivery does not change this agreed ratio. An earned ratio is not published as this metric.

The percentage uses integer basis points, rounded half up. A group smaller than the directory cohort minimum of 3 returns `UNAVAILABLE_SMALL_GROUP` and no percentage. A zero denominator returns `UNAVAILABLE_DENOMINATOR`. Synthetic prices stay labeled synthetic. The one-artisan execution order therefore publishes the withheld state. The 60.00% example is a unit test with three artisans, 6,000.000 TND agreed compensation and a 10,000.000 TND quotation.

## Finance

Planned contribution is the accepted quotation total minus the approved cost subtotal, in TND millimes. It is labeled `PLANNED`. When planned cost exceeds the quotation, the result is `UNAVAILABLE` rather than a negative profit. Quotation acceptance is not cash received. Collected amount stays `0.000` with status `UNVERIFIED`.

A buyer sees the quotation total, unverified collection and pending tax. The buyer payload does not include compensation, cost, or contribution. A coordinator does not receive the internal summary through the buyer or finance path.

An artisan statement lists agreed quantity and agreed pay from the accepted offer, earned and payable amounts from recognized payables, verified paid as `0.000`, and any synthetic simulation status. Those amounts are not collapsed into one paid figure.

A payable is created only for `BUYER_ACCEPTED_PIECE`. The amount is the accepted offer's unit pay times the buyer-accepted pieces allocated to that batch. The offer payment text is snapshotted and does not change the formula. Quality approval returns 409 `MILESTONE_UNSUPPORTED`. Before buyer confirmation, reconciliation returns `HELD_PENDING_REVIEW` and writes no row. The unique key is batch, milestone and source confirmation. A repeated or concurrent reconciliation does not create a second row. Payables are not deleted when a later order change happens. No reversing entry is required by the current stories because the accepted terms are not rewritten.

`SimulatedSettlement` moves `SCHEDULED` to `SIMULATED_INITIATED`, then `SIMULATED_SETTLED` or `SIMULATED_FAILED`. A failed attempt can be retried as a new attempt. A settled attempt cannot be repeated. `bankVerified` is constrained to false. The event does not update `SyntheticPayment`, the order status, or a verified payout. The operator who records it needs `operator.payment.record` and an assignment. Finance can read the attempts and cannot create them without that permission.

An accountless artisan statement can be read by finance and is marked `ACCOUNTLESS_STATEMENT_UNDELIVERED`. No user account is created for that artisan. A coordinator's production permission does not open the statement.

## Routes

Private routes are under `/api/v1/procurement`. The public read is `GET /api/v1/public/traceability/:token`. The permission table is in [the API notes](../../02-architecture/api-architecture.md).

The operator delivery tab schedules pickup, confirms hub receipt, records synthetic dispatch, reports delivery and, because the browser fixture's operator is also the buyer member, confirms receipt. It drafts, submits, publishes and revokes traceability. Payable recognition is shown only to a reader with `finance.payout.read`. Simulated settlement actions are shown to an assigned operator with `operator.payment.record`.

The coordinator pickup page records collection for the assigned association. The artisan compensation page shows that artisan's own lines. The public page shows the approved story or the revoked state.

## Verification

Commands were run from `website/` on 27 October 2026, then repeated after pickup cancellation, explicit damaged quantities and QR rendering. Migrations `20261027050000_logistics_traceability` and `20261027060000_shipment_cancel_damage` were applied only by the disposable integration database. No persistent development or production database was migrated.

| Command | Result |
|---|---|
| `pnpm lint` | Pass, 295 files |
| `pnpm typecheck` | Pass |
| `pnpm --filter @nasj/api test` | Pass, 64 unit tests |
| `pnpm --filter @nasj/web test` | Pass, 10 unit tests |
| `pnpm test:integration` | Pass, 108 disposable PostgreSQL scenarios. The production scenario now continues through a cancelled pickup, excess allocation, concurrent shipment, short collection, blocked late cancellation, hub confirmation, synthetic dispatch, a 28 accepted / 2 damaged / 5 missing confirmation, payable replay, unsupported quality milestone, coordinator denial, accountless undelivered statement, simulated settlement and revoked traceability. Capacity remaining stays 10.00. |
| `pnpm test:e2e` | Pass, 34/34 in 4.4 minutes. The execution journey schedules pickup, records collection, confirms hub receipt, dispatches, reports delivery, confirms 9 of 10 pieces, publishes the public page, checks the withheld percentage and QR at 390px, and checks that the revoked page has neither the story nor the QR. |
| `pnpm build` | Pass. The public route `/trace/[token]` is included. |

## Not done

No development or production database was migrated. Six additive migrations, `20261027010000`, `20261027020000`, `20261027030000`, `20261027040000`, `20261027050000` and `20261027060000`, remain unapplied outside disposable tests.

No physical inventory, supplier purchase, warehouse receipt, carrier tracking, or GPS record exists. No buyer invoice, cash receipt, or verified bank payment exists. Tax treatment is pending legal review. Photographs, testimonials, certifications and reviewed translations are not stored. English is the only public language in this slice. Accountless statements are prepared for finance and are not delivered to the artisan. Owner acceptance of this slice and of the earlier slices is still open. GitHub issues for this slice remain open.
