# Traceability and public provenance

**Last verified:** 1 November 2026 against `apps/api/src/modules/procurement/logistics.ts`.

A read-only public page that proves where a product came from, without exposing anyone's identity.

## Lifecycle

```text
DRAFT → PENDING_REVIEW → PUBLISHED ⇄ PENDING_REVIEW → REVOKED
```

| Transition | Permission |
|---|---|
| Draft and review | `operator.logistics.manage` + assignment |
| Publish and revoke | `operator.traceability.publish` + assignment |

Coordinators and platform administrators do **not** receive the publish permission from their role.

A correction from `PUBLISHED` returns the record to `PENDING_REVIEW` and hides the public page until
republished. One publication exists per order.

## The public page

- Address: `/trace/:token`, where the token is a random UUID.
- No account required. Read-only.
- `Cache-Control: no-store`.
- An order id, or an unpublished token, returns **404**.
- A revoked token shows a status page with no previous story.

A QR matrix for that address is rendered on the published page and in the operator delivery tab.
Revoking removes the matrix with the story. It is not a carrier tracking code.

## What the snapshot contains

| Included | Excluded |
|---|---|
| Product title | Artisan names |
| Craft name | Contacts and home addresses |
| Approved story | Individual pay |
| Association's coarse region | Costs |
| Synthetic provenance marker | Buyer contract terms |
| Producer-share basis | Monitoring data |

The story rejects an email sign and a run of six digits, so a producer cannot be identified from the
public text.

## Tests

`apps/api/test/unit/logistics.test.ts`, `tests/e2e/trace-qr.spec.ts`.

## Related

- [Logistics and traceability](logistics-and-traceability.md)
- [Finance and settlement](finance-and-settlement.md)
