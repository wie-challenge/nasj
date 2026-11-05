# Security & Consent Audit — Batches 8–11

Date: 28 October 2026. Static review of `apps/api/src/modules/{procurement/planning,catalog,intelligence,collaboration}`.
No penetration test or browser test was possible (see `INTEGRATION_TEST_REPORT.md`).

## 1. Findings requiring action

### S-1 (P1) — Platform administrator can approve a schedule change in the buyer's place

`collaboration.service.ts` ~line 350:

```ts
if (!buyerAuthority && !access.platform)
  fail(403, 'FORBIDDEN', 'Only the buying organization can approve a schedule change.');
```

A platform administrator (`platform.roles.manage`) can therefore approve a deadline extension that changes a
**buyer's contractual commitment**. E06-06 requires "affected-party approvals before contractual changes" —
a governance role is not the affected party. This substitutes administrative authority for commercial consent.

**Also:** only the buyer approves. The story requires *affected parties* — for a deadline change the artisan's
agreed delivery date is equally affected.

**Recommendation:** remove the `platform` bypass for commercial decisions, or restrict it to an explicit,
separately-audited "contractual override" action that mandates a written justification and records itself as a
governance override rather than a buyer approval.

### S-2 (P0, correctness) — Accepted counteroffer never reaches the authoritative offer

`acceptCounter` writes `ARTISAN_ACCEPTED` to `Counteroffer` only. Verified: no `commercialOffer.update` in that
path; the only such call is inside `decideSchedule`. The agreed quantity/deadline therefore never becomes
issued terms, no capacity is reserved, and no production commitment is created.

**Consent implication:** the artisan has "accepted" terms that do not exist in the offer record. The system
records agreement without the agreement having force. This is both a workflow gap (E04-07) and a consent-record
integrity problem.

**Recommendation:** within one transaction, create a new offer version from the accepted terms, snapshot
`termsSha256`, move the new version to `OFFERED`, and let the existing acceptance path reserve capacity.

### S-3 (P1) — No observed-hours store; earnings cannot be evidenced

The only `actualRecordedMinutes` field is on `ProductSampleRequest`. Production batches have no observed-time
record, so E13-04's "consented observed hours with task/unit context and reporting window" has no source.
`effectiveEarnings` correctly returns `UNAVAILABLE`, so no false figure is produced — but the story is unmet.

## 2. Controls verified as correct

| Control | Evidence |
|---|---|
| Health/wearable/biometric exclusion | `grep -i "wearable\|health\|strain\|biometric"` across planning/intelligence returns **only comments and documentation strings**, never a field, predicate or query. |
| Stricter ranking has no health input | `RankingCandidate` carries craft/availability/capacity/reasons only. |
| Unknown capacity never treated as zero or infinite | `rankCandidates` returns `allocatablePieces: null` → tier `REVIEW`; `validateAllocation` raises `CAPACITY_UNKNOWN`. |
| Hours never converted to pieces | `unitType !== 'PIECES'` is an explicit blocker in ranking, allocation and override. |
| Override cannot bypass hard constraints | `override()` refuses `INELIGIBLE`, `knownRemaining === null`, and quantity > remaining, before writing. |
| Pricing cannot mutate an accepted quotation | `pricing()` is read-only; no `update` call exists in that method. |
| Sample work cannot be unpaid by default | `sampleMayStart` blocks null/zero/malformed/`UNPAID_BY_DEFAULT_BLOCKED`. |
| Sample approval is organization- and revision-bound | `approve()` requires membership of `sampleRequest.buyerOrganizationId` + `buyer.quotation.approve`; `sampleApprovalAuthorizesWork` rejects mismatched org/revision/superseded. |
| Cross-tenant reads return 404, not 403 | `sample()`, `gate()`, `visibleOffer()` fail `404 NOT_FOUND` on non-participation, avoiding existence disclosure. |
| Cohort suppression | Threshold 5, below which `rows: []` and no figure is emitted. |
| Compensation never aggregated into one number | Five distinct fields plus a note stating they are not combined; `verifiedPaid` is `0` with `verifiedAvailable: false`. |
| Notification never claims delivery without provider | `notificationPlan` returns `UNDELIVERABLE_NO_PROVIDER` for non-in-app channels when `providerConfigured: false`; `notify()` returns `null` and writes **no** delivery row. |
| Support requests excluded from ranking | No ranking function reads `SupportTicket`; verified by grep. |
| Idempotency on every mutation | `command()` requires an `Idempotency-Key`, validates it, and scopes it to `{actorId, resourceId, operation}`. |
| Audit attribution | Every mutating method writes `audit(...)` with action, target, organization and a `provenance: 'SYNTHETIC'` marker. |
| Accountless acceptance still blocked | The pre-existing `verificationStatus: 'PENDING_UNAPPROVED_METHOD'` blocker is untouched. |
| Demo isolation architecture | Each generation creates fresh organizations with a `scenarioId`-scoped slug, so new-table rows are naturally generation-scoped. |

## 3. Required negative tests — status

| # | Scenario | Guard exists | Executed |
|---|---|---|---|
| 1 | Buyer → another buyer's RFQ | yes (pre-existing) | **NO** |
| 2 | Coordinator → unrelated artisan | yes | **NO** |
| 3 | Artisan edits another's counteroffer | yes (profile match) | **NO** |
| 4 | Operator overrides hard constraint | yes | **NO** |
| 5 | Unauthorized sample approval | yes | **NO** |
| 6 | Cross-org product document | yes | **NO** |
| 7 | Duplicate capacity reservation | constraint declared | **NO** |
| 8 | Price suggestion mutating a quote | yes (no write path) | static only |
| 9 | Analytics exposing private compensation | org-scoped totals | **NO** |
| 10 | Small cohort disclosure | yes | **unit only** |
| 11 | Unauthorized schedule modification | **bypass found (S-1)** | **NO** |
| 12 | Coordinator impersonating consent | yes | **NO** |
| 13 | Notification leakage | recipient-scoped | unit (plan) only |
| 14 | Financial detail in buyer discussion | no financial field | static only |
| 15 | Revoked grants / suspended membership | `status: 'ACTIVE'` filter | **NO** |
| 16 | Cross-visitor demo isolation | pre-existing | **NO** |
| 17 | Unsupported accountless acceptance | pre-existing | **NO** |
| 18 | Synthetic relabelled verified | explicit classes | static only |

**Only 1 of 18 negative scenarios has executable evidence (unit-level); 15 are entirely unexecuted.**

## 4. Notification gap detail

Because `notify()` writes nothing when a preference is EMAIL without a provider, a user who opts into EMAIL
receives no record and no error — the event vanishes. This is honest (nothing claims delivery) but leaves no
trace for an operator to diagnose. The story's "safe fallback for critical operational communication" is
therefore unmet, and there is no delivery-status history for the failed case.

## 5. Residual risks

1. **Unverified authorization paths** — every guard above is inspected but not executed. The one execution
   substitute in this session proves nothing about DB-level enforcement.
2. **Two sample-approval mechanisms** (pre-existing `ProcurementSampleDecision` and new `BuyerSampleApproval`)
   risk divergent approval standards. The release gate reads only the former.
3. **Schedule change applied without artisan co-approval** (S-1 related).
4. **Hard-coded cohort threshold** — a policy change requires a code deploy.
5. **No retention or redaction policy** applied to `SupportTicket.description`, which may contain personal
   detail.
