# Finance and settlement

**Last verified:** 1 November 2026 against `apps/api/src/modules/finance/` and the schema constraints.

How money is recognised, what can be paid, and what deliberately cannot be claimed.

## The separation that matters

Five figures are tracked separately and **never summed into one "paid" number**:

| Figure | Meaning | Can it be real? |
|---|---|---|
| Agreed | Contractual amount from accepted offers | Yes |
| Earned | Recognised from buyer-accepted work | Yes |
| Payable | Owed now | Yes |
| Simulated paid | Synthetic settlement events | Never real money |
| Verified paid | Independently attested payment | **Not implemented** |

## Payables

A payable is created only for `BUYER_ACCEPTED_PIECE`.

- Amount = accepted offer's unit pay × buyer-accepted pieces allocated to that batch.
- The offer's payment text is snapshotted and does **not** change the formula.
- Quality approval alone returns `409 MILESTONE_UNSUPPORTED`.
- Before buyer confirmation, reconciliation returns `HELD_PENDING_REVIEW` and writes no row.
- Unique key: batch, milestone, source confirmation. A repeat or concurrent run cannot create a
  second row.
- Payables are never deleted. Accepted terms are not rewritten, so no reversing entry is needed.

## Payouts

| Step | Status | Rule |
|---|---|---|
| Request | `REQUESTED` | Amount ≤ payable snapshot |
| Approve | `APPROVED` | Approver ≠ requester |
| Execute | `EXECUTION_PENDING` → `VERIFICATION_PENDING` | Operator records a manual report |

A manual execution report is **not** verified payment. `finance.service.ts` writes
`bankVerified: false` unconditionally on operator entry, and the database enforces it.

## Why verified payment is always unavailable

Three constraints make a false claim unrepresentable:

| Constraint | Effect |
|---|---|
| `execution_unverified` | An execution record can never be bank-verified |
| `payout_status` | No payout reaches a settled state |
| `SimulatedSettlement_provenance_check` | A simulation is always synthetic and unverified |

Until an owner approves a verification authority (decision D1), verified payment reports
**unavailable** — deliberately distinguishable from a measured zero.

## Partial payments

Verified amounts deduplicate by payment **reference**, not by payable. Distinct partials on one
payable all count:

| Input | Credited |
|---|---|
| 60,000 + 40,000 on one payable | 100,000 |
| Same reference twice | once |
| No reference | not credited |

Overpayment is clamped at the call site, where the obligation is known, not inside the aggregation.

## Producer share

"Agreed direct artisan compensation share", policy version 1.

- **Numerator:** accepted offer quantity × agreed unit pay. Agreed compensation, not earned, not paid.
- **Denominator:** accepted quotation total minus recorded buyer refunds. No refund ledger exists in v1.
- Tax excluded from both sides; tax treatment is pending legal review.
- Integer basis points, rounded half up.
- Small group (< 3) returns `UNAVAILABLE_SMALL_GROUP`; zero denominator returns `UNAVAILABLE_DENOMINATOR`.

## Visibility

| Viewer | Sees |
|---|---|
| Buyer | Quotation total, unverified collection, pending tax. **No** compensation, cost or contribution |
| Coordinator | No internal summary through buyer or finance paths |
| Artisan | Agreed quantity and pay, earned, payable, verified paid as `0.000`, simulation status |

Planned contribution is `PLANNED`; when planned cost exceeds the quotation it is `UNAVAILABLE`, not a
negative profit.

## Tests

`apps/api/test/unit/finance.test.ts`, `batch12.test.ts`, `remediation-batch2.test.ts`;
`pg-harness/v-g71-settlement-authority.mjs`.

## Known limitations

- No verified payment path; blocked on owner decision D1.
- No refund ledger.
- Tax treatment unresolved.
