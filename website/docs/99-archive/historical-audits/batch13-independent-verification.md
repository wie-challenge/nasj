# Batch 13 independent verification — E18-06 / #209

28 October 2026 · Africa/Tunis. Adversarial review of the completed Batch 13 implementation. **No
product code, migration, schema or planning document was changed.** Owner acceptance remains
**PENDING**; this document verifies software behaviour only.

Independent evidence: [evidence/batch13-verification](../../engineering/evidence/batch13-verification).

## Verdict

The five original #209 criteria are **VERIFIED at software level**, and the implementation report's
claims held under independent counterexamples. One **low-severity residual defence-in-depth gap** and
one **documentation understatement** were found; neither permits unauthorized access, disclosure,
financial change or loss of accepted history.

| Criterion | Independent result |
|---|---|
| C1 receipt-bound, permission-scoped, dispute status and follow-up owner | VERIFIED |
| C2 linked to delivered order and an authorized buyer participant | VERIFIED |
| C3 rating/category, comments, date, follow-up owner and status | VERIFIED |
| C4 claims kept distinct and formal cases linked | VERIFIED |
| C5 visibility restricted, no publication/testimonial | VERIFIED |

## Evidence freshness

The reports were checked against the tree rather than trusted:

- 31 modified/untracked entries; 0 changes under `docs/engineering/batch13-planning/`; 0 changes to any
  of the 36 historical migration directories; `20261028160000_buyer_order_feedback` is the 37th and
  last migration.
- Only `apps/web/next-env.d.ts` was newer than the integration log, and it is a Next-generated file.
  After removing the temporary probes, the authoritative logs have **0 newer product source files**.
- Unit and browser logs *were* stale after the final source edits, so `@nasj/api` (140), `@nasj/web`
  (25) and the two browser journeys were **re-run** and are green against the final tree.
- Verified source hashes are recorded in `verified-source-hashes.txt`.

## A — Receipt eligibility

Exercised through authenticated HTTP on real `BuyerDeliveryConfirmation` rows plus native constraints.

| Counterexample | Result |
|---|---|
| Fabricated `receiptConfirmationId` | 409 `NO_CONFIRMED_RECEIPT` |
| Receipt from another order of the same buyer | 409 `RECEIPT_ORDER_MISMATCH` |
| Receipt genuinely owned by a different tenant | 409, no aggregate |
| Forged `reporterId` | 400 by strict schema |
| Forged `sourceClass` / `scenarioId` / `createdAt` / `currentVersion` | 400 by strict schema |
| Received = 0 with everything missing | 409 `NO_CONFIRMED_RECEIPT`, claim path still opens a ticket |
| Partial + damaged receipt with `accepted = 0` | accepted (eligible) |

`db.buyerOrderFeedback.count` remained 0 for every denied path. The eligibility trigger independently
re-checks receipt existence, `received > 0` and shipment↔order lineage, so a direct SQL insert that
bypasses the service is still rejected.

## B — Tenant, identity and multi-organization isolation

| Counterexample | Result |
|---|---|
| Second employee of the same buyer organization | list empty, history 404, workspace silent |
| Broad `collaboration.access` reuse | did not grant feedback access |
| Artisan / coordinator | 404 |
| Different buyer organization | 404 |
| **Role union**: BUYER *and* `NASJ_OPERATOR` with an active assignment but no `support.case.manage` | list empty, history 404, follow-up 404 |
| Revoked buyer membership | read + correction 404 immediately; version and revision count unchanged |
| Revoked operator assignment | follow-up 404; version unchanged |
| **Platform ADMIN** (`role = ADMIN`, holds `platform.roles.manage`) | list 404, history 404, no workspace leak, no export leak |
| Subject export | reporter-scoped only; every `followUpNote` null; colleague export empty |

The multi-org probe initially "failed" against the intended design: a second authorized buyer employee
may create their **own independent** assessment. Confirmed as correct per plan, and mutual privacy then
holds — each author sees only their own row and gets 404 on the other's history.

## C — Immutable history and concurrency

| Counterexample | Result |
|---|---|
| Revision `UPDATE` / `DELETE` | rejected by `buyer_feedback_append_only` |
| Header `orderId` / `reporterId` / receipt / source mutation | rejected by the identity guard |
| Version increment by more than one | rejected |
| Header delete | rejected |
| Same-key replay | original result returned |
| Changed payload, same key | 409 `IDEMPOTENCY_CONFLICT` |
| Stale `expectedVersion` | 409 `STALE_VERSION`, original version-1 text intact |
| **Same-key replay after the reporter's authority is revoked** | 404, previous result **not** disclosed |
| Concurrent buyer correction + support follow-up | one 201 / one 409, contiguous versions, no loss or duplication |

**Residual finding (LOW, defence-in-depth only).** The header trigger enforces "+1 exactly" but cannot
verify that a matching revision row is written in the same transaction. Direct schema-owner SQL can
therefore advance `currentVersion` without a revision, after which application appends fail with a
generic 500 until a matching revision is inserted. This is **not remotely reachable**: all three
service write paths (`corrections`, `follow-up`, `case-link`) perform header advance and revision insert
in one `iamTransaction` transaction, and no API route or UI control writes the header alone. The
aggregate is also self-healing by appending the missing version, so no accepted history is lost.
Recommend documenting it, or closing it with a deferred constraint trigger, if a future batch adds
another header writer.

## D — SupportTicket vs SupportCase

| Check | Result |
|---|---|
| Buyer is the real claim reporter | confirmed (`reporterId` = buyer) |
| Cross-order ticket link | 409 `CASE_ORDER_MISMATCH` |
| Ticket in a different operator organization | 404, no revision, no `FEEDBACK_LINKED` event |
| Legacy `SupportCase` id supplied as `ticketId` | 404 |
| Resolving the feedback follow-up | claim stayed `OPEN` |
| Ticket lifecycle → feedback cascade | none exists in source or triggers |
| Invalid follow-up owner | 403 `INVALID_OWNER` |
| `SupportCase` referenced by feedback code | none |

Both directions were checked: feedback resolution does not touch the claim, and the claim lifecycle has
no write path into feedback.

## E — Financial non-interference

An authoritative snapshot was taken before and after a follow-up operation, covering payables, financial
adjustments, payment disputes, `BuyerDeliveryConfirmation` quantities, `ProcurementAcceptance` count,
offer terms and status, closure assessments, and `CommercialOrder` status / `delivered` / `version`.

**Result: byte-identical.** No feedback or case-link command references `FinanceService` or
`ProcurementService.accept`; `rg` confirms feedback tables appear only in the collaboration service,
governance export and the two web components.

## Migration and schema review

- Migration is a single `BEGIN … COMMIT` block: no `DROP TABLE`, no `CASCADE`, no `ALTER` against any
  historical table, no `db push` usage.
- 8 restrictive foreign keys, unique `(orderId, reporterId)` and `(feedbackId, version)`, CHECK
  constraints for version, kind, category, rating 1–5, text length, follow-up status, owner-required
  `FOLLOW_UP`, reason-required `RESOLVED` and for any version above 1, source class, and demo-scenario
  presence.
- 5 protective triggers: append-only revisions, header identity guard, header delete guard, receipt
  eligibility, revision chain (including the exact-order/exact-operator case-link rule).
- Populated upgrade preserved **130** baseline tables byte-for-byte; dump/restore reproduced both new
  tables exactly and kept the append-only trigger (B13-M01…M06).

## Documentation accuracy

Claims sampled against code were accurate, with one correction:

- The implementation report implies a dedicated feedback-write rate-limit bucket. The technical plan
  made that conditional ("add … if existing global limits are too broad"), and no dedicated bucket was
  added — only the existing shared API limiter applies. The report describes this as "the shared
  `RateBucket` API limiter", which is accurate, but a reader could over-read it. **No security gap:**
  the shared limiter is active for these routes; the dedicated bucket is simply not differentiated.

Minor, non-blocking: buyer-facing history renders the support-authored `reason` and actor name. This is
deliberate per the plan (revisions distinguish buyer statements from support action) and reveals no
internal note; it is noted so a future privacy review can decide whether support reasons should also be
withheld from the buyer projection.

## Independent reproductions

| Check | Result |
|---|---|
| Adversarial suite (A, B, C, D, E + owner/revocation) | 13 checks passed, 0 failed |
| Header-desync probe | gap confirmed, reachability refuted |
| Platform-admin scope probe | 4/4 negative assertions held |
| `@nasj/api` units (re-run on final tree) | 140 passed |
| `@nasj/web` units (re-run on final tree) | 25 passed |
| Integration (matched to final tree) | 196 passed |
| Browser journeys (re-run on final tree) | 2 passed, 0 axe violations |
| `pnpm lint` (419 files), `git diff --check` | pass |

## Gates

Owner acceptance **PENDING**. Real participant feedback collection still requires the E14-09/#74
qualified purpose/access/retention review; no publication or testimonial surface exists. Nothing here
authorizes a live pilot, deployment or GitHub state change.
