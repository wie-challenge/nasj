# Logistics and traceability

**Last verified:** 1 November 2026 against `apps/api/src/modules/procurement/logistics.ts` and
`packages/contracts/src/logistics.ts`.

Movement of finished goods from preparation through custody to buyer receipt, with every quantity
kept separate.

## The quantity model

Eight quantities are tracked independently. Netting any two of them loses the truth.

| Quantity | Source | Meaning |
|---|---|---|
| Prepared | `ShipmentPreparation` | Quality-approved pieces available to ship |
| Shipped | `ShipmentItem` sum | Physically allocated to a shipment |
| Operator reported | `DeliveryReport.quantity` | What the operator says arrived |
| Buyer received | `BuyerDeliveryConfirmation.received` | What the buyer counted |
| Buyer accepted | `BuyerDeliveryConfirmation.accepted` | Accepted after inspection |
| Damaged | `BuyerDeliveryConfirmation.damaged` | Received but not accepted |
| Buyer declared missing | derived | Buyer's own declaration |
| Not reported by operator | derived | Operator's reporting gap |

`totalUnaccounted = shipped − buyerReceived`. It splits into the operator gap and the buyer
declaration, which are **never merged** in the API or the UI.

## Lifecycle

```text
PICKUP_SCHEDULED → COLLECTED → IN_TRANSIT → DELIVERY_REPORTED → BUYER_CONFIRMED
                                                              ↘ DISCREPANCY
```

`PICKUP_SCHEDULED` and `COLLECTED` are **not** shipped. Shipped quantity counts only `IN_TRANSIT`,
`DELIVERY_REPORTED`, `BUYER_CONFIRMED` and `DISCREPANCY`.

## Custody

| Step | Actor | Permission | Effect |
|---|---|---|---|
| Collect from association | Coordinator | `association.handover.record` | Records `COLLECTED_FROM_ASSOCIATION`; stays `PENDING` |
| Receive at hub | Operator | logistics | Confirms `RECEIVED_AT_HUB`; shipment becomes `COLLECTED` |
| Hand to transport | Operator | logistics | `HANDED_TO_TRANSPORT`; becomes `IN_TRANSIT` |

Partial collections are retained and may accumulate to the shipment total. Hub receipt confirms
that full collected total; an incomplete collection cannot be confirmed. Hand-to-transport is
synthetic; it is not carrier confirmation.

No actor can record another actor's step. The operator cannot record the association's collection or
the buyer's receipt.

## Conservation rules

Enforced in `packages/contracts/src/logistics.ts`, all rejected with `DELIVERY_MISMATCH`:

| Rule | Meaning |
|---|---|
| `reported ≤ shipped` | A report cannot exceed what was shipped |
| `received ≤ reported` | A buyer cannot receive more than was reported delivered |
| `received + declared = reported` | The buyer's arithmetic must close |
| `accepted + damaged = received` | Inspection must account for every received piece |
| `shortage ≥ 0` | Derived from the above; never negative |

Custody is cumulative **per leg**: collections cannot exceed the shipment total, and dispatch has
its own balance. Moving the same pieces from association to hub and then to transport does not
consume quantity twice. Hub confirmation restates receipt rather than adding movement.

## Buyer confirmation

- One confirmation per shipment. A second is rejected `DUPLICATE_CONFIRMATION`.
- A mismatch raises an open `DeliveryDiscrepancy`.
- Confirmation does **not** change order status or `CommercialOrder.delivered`.
- Payables use the **accepted** count only.

## Pickup cancellation

Allowed only while `PICKUP_SCHEDULED` and no handover is recorded. Cancellation keeps the earlier
pickup row and releases the pieces for another shipment. A later handover blocks it.

Pickup windows are displayed in Africa/Tunis; stored timestamps stay absolute.

## Authorization

A buyer from another organization receives **404**, not 403. Buyer projections suppress `hub` and
`coordinatorId`.

## Tests

`apps/api/test/unit/logistics.test.ts`, `remediation-batch2.test.ts`, and
`apps/api/test/pg-harness/v-g19-g20-service.mts` (real PostgreSQL).

## Known limitations

- Concurrency for duplicate confirmation is **blocked**, not verified — see
  [Concurrency limitations](../09-verification-and-quality/concurrency-limitations.md).
- No carrier integration; hand-to-transport is synthetic.
