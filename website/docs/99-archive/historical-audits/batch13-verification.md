# Batch 13 verification report — E18-06 / #209

28 October 2026 · Africa/Tunis. Every number below comes from a log retained in
`docs/engineering/evidence/batch13/`. Nothing blocked, skipped or unexecuted is reported as a pass.

**Owner acceptance: PENDING.** This is synthetic software evidence only. No real participant
feedback was collected, and no live environment, persistent database, deployment or GitHub state was
touched.

## Verification environment

| Item | Value |
|---|---|
| Runtime | Node 24.20.0, pnpm 11.3.0 |
| Database | disposable PostgreSQL 17.7-alpine containers created and destroyed per run |
| Migrations applied | 37 (36 pre-existing + `20261028160000_buyer_order_feedback`) |
| Mail | local SMTP capture only; no external provider |
| Browser | Chromium via Playwright 1.64.1 at 390×844 and 1280×900 |
| Persistent database touched | no |

## Unit tests

| Suite | Result | Log |
|---|---|---|
| `@nasj/api` units | 140 passed, 0 failed | `api-unit.log` |
| `@nasj/web` units | 25 passed, 0 failed | `web-unit.log` |

New E18-06 unit coverage in `apps/api/test/unit/collaboration.test.ts` (8 added cases): receipt
eligibility including zero-receipt and partial/damaged boundaries; the follow-up transition table and
reopen reason rule; `feedbackCaseLinkMatches` for matched, different-order, not-order-related and
different-operator inputs; server-derived provenance and the anti-fabrication source label; strict
schema rejection of forged `reporterId`, out-of-range rating, unknown category and over-long comment;
plain-text sanitisation; and the version/reason requirements on correction, follow-up, case-link and
list-query schemas.

`apps/api/test/unit/batch12.test.ts` was updated because the retention inventory now holds ten classes
instead of nine, and it asserts that `BUYER_ORDER_FEEDBACK` is present with no invented retention
duration and an unchanged pending-review status.

## Integration scenarios

| Suite | Result | Log |
|---|---|---|
| Full `pnpm test:integration` | 196 scenarios passed, 0 failed, exit 0 | `integration.log` |
| Focused E18-06 HTTP/PostgreSQL scenarios | 13 passed, 0 failed (extracted from the full run) | `focused-feedback.log` |
| Focused E18-06 migration/restore scenarios | 6 passed, 0 failed | `focused-migration.log` |
| Showroom isolation (`pnpm --filter @nasj/api test:demo`) | 5 passed, 0 failed | `demo.log` |

The E18-06 scenario file `apps/api/test/order-feedback.scenarios.ts` exercises, against real
authenticated HTTP and a real PostgreSQL database:

1. Authorized feedback after a genuine buyer receipt (`POST /api/v1/procurement/shipments/:id/buyer-confirmations`, then feedback) — **PASS**
2. Partial and damaged receipt with `accepted = 0` remains eligible — **PASS**
3. Zero received quantity refused (`NO_CONFIRMED_RECEIPT`) while the missing-delivery claim path still opens a ticket — **PASS**
4. Operator-only delivery assertion without buyer confirmation is refused — **PASS**
5. Receipt belonging to another order refused (`RECEIPT_ORDER_MISMATCH`) — **PASS**
6. Another buyer's private assessment: a second employee of the same buyer organization sees no row, 404 on history, and it never appears in their workspace or export — **PASS**
7. Different tenant: outsider read is 404 and creation is 404 — **PASS**
8. Artisan and coordinator denied (404) even though `collaboration.access` permits their order discussions — **PASS**
9. Revoked buyer membership removes read and correction immediately, with no version advance — **PASS**
10. Revoked operator assignment removes follow-up and case-link authority immediately — **PASS**
11. Invalid follow-up owner (wrong organization, no `support.case.manage`, or no current assignment) → 403 `INVALID_OWNER`; missing owner → 400 `OWNER_REQUIRED` — **PASS**
12. Cross-order `SupportTicket` link → 409 `CASE_ORDER_MISMATCH` with no revision written — **PASS**
13. Private/inaccessible ticket and non-support actor → 404 before any insertion — **PASS**
14. Buyer correction preserves the original statement, category and rating in version 1 — **PASS**
15. Support follow-up preserves buyer comment, rating and category unchanged — **PASS**
16. Duplicate creation → 409 `DUPLICATE_FEEDBACK`, one aggregate only — **PASS**
17. Same-key replay returns the original result — **PASS**
18. Changed payload under the same key → 409 `IDEMPOTENCY_CONFLICT` — **PASS**
19. Stale `expectedVersion` → 409 `STALE_VERSION` with history unchanged — **PASS**
20. Concurrent buyer correction and support follow-up: exactly one accepted (201) and one rejected (409), with monotonically contiguous versions and no lost revision — **PASS**
21. Demo visitor isolation: a showroom buyer assessment is `DEMO_USER_SUBMITTED` with its scenario pinned; a second visitor with the same buyer persona receives 404 on read, history and create, and sees nothing in their workspace — **PASS**
22. Governance export/minimization: the reporter's export carries their own history with every `followUpNote` null and the internal note absent; a colleague's export carries nothing — **PASS**

Negative database assertions included in the same suite: duplicate aggregate (`P2002`), invalid rating,
duplicate and jumped versions, revision `UPDATE` and `DELETE` rejection, header receipt change
rejection, header version jump rejection, header delete rejection, cross-order receipt rejection at the
trigger, and a failed transaction leaving no partial revision.

### Financial non-interference

`order-feedback.scenarios.ts` snapshots payables, financial adjustments, payment disputes, receipt
quantities, `ProcurementAcceptance` count, offer terms and status, delivered accepted-piece projection,
closure assessments and order status immediately before and after a support follow-up and a case link.
The two snapshots are identical, and the underlying receipt is re-read to confirm `received` is
unchanged. No feedback command touches `FinanceService` or `ProcurementService.accept`.

## Cross-batch regression

| Safeguard | Result |
|---|---|
| A12-01 unresolved financial adjustments still block closure | PASS — `B12` closure scenarios unchanged in `integration.log` |
| A12-02 unfunded or stale finance reviews still block in-scope quote acceptance | PASS — `R12` funding scenarios unchanged |
| A12-03 unverified settlement excluded from verified payment metrics | PASS — `R12` timeliness and simulated-settlement scenarios unchanged |
| 36 historical migrations and their checksums preserved | PASS — `B13-M05` |
| Batch 12 retention, governance and privacy behaviour | PASS — one expected count updated from nine to ten classes |

## Migration and restore evidence

`apps/api/test/feedback-migration.scenarios.ts` runs against disposable PostgreSQL only.

| Check | Result |
|---|---|
| B13-M01 new tables absent on the populated pre-migration baseline | PASS |
| B13-M02 `prisma migrate deploy` preserves every pre-existing row hash (130 tables) | PASS |
| B13-M03 restrictive foreign keys, unique pairs, indexes and all five protective triggers present | PASS |
| B13-M04 valid assessment accepted; duplicate aggregate, invalid rating, version jump, unassigned `FOLLOW_UP`, cross-order link, revision `UPDATE`/`DELETE`, header identity change and version jump rejected; failed revision rolls its header advance back | PASS |
| B13-M05 migration history matches every SQL file, new migration finished, none rolled back | PASS |
| B13-M06 `pg_dump`/`pg_restore` into a second disposable container reproduces both history tables exactly and retains the append-only trigger | PASS |

Migration JSON evidence: `{"evidence":"DISPOSABLE_NATIVE_POSTGRESQL_FEEDBACK_UPGRADE","migration":"20261028160000_buyer_order_feedback","preservedBaselineTables":130,"persistentDatabaseTouched":false}`.

## Full application and showroom browser regression

`pnpm test:e2e` was run once on the final source (log `e2e-all.log`).

| Suite | Result |
|---|---|
| Application browser tests (`tests/e2e`, including the new order-feedback journey) | 54 passed, 0 failed, 0 skipped |
| Showroom browser tests (`tests/demo-e2e`) | 3 passed, 0 failed |

Every pre-existing journey still passes, so the buyer feedback panel and the support follow-up
section did not regress procurement, execution, collaboration, governance or any other workspace.

## Browser journeys

`tests/e2e/order-feedback.spec.ts` runs the complete journey on mobile (390×844) and desktop
(1280×900) with real authenticated sessions and real API/database effects:

confirmed receipt → private assessment → buyer correction (original preserved) → buyer opens a real
order claim through the existing ticket form → support assigns follow-up with an internal note →
support links the existing claim → follow-up resolved while the claim remains `OPEN` → stale version
rejected → anonymous read denied.

Each viewport also runs an axe WCAG 2.0/2.1/2.2 A+AA scan on `main` (zero violations required) and a
horizontal-overflow assertion. Keyboard submission (focus + Enter) is used for the first assessment.

Result: **2 passed, 0 failed** (one test per viewport, both including the axe and overflow assertions),
recorded in `browser-order-feedback.log`. Earlier failing diagnostic runs were corrected and are not
claimed as passing evidence.

## Static checks

| Check | Result | Log |
|---|---|---|
| `pnpm lint` (Biome, 419 files) | PASS, exit 0, no findings | `lint.log` |
| `pnpm typecheck` (contracts + api + api tests + web) | PASS | `typecheck.log` |
| `pnpm build` (contracts + api + web) | PASS | `build.log` |
| Prisma schema validation | PASS | `schema.log` |
| `git diff --check` | PASS | `diff-check.log` |

## Failures, skips and blockers

- No integration, unit or browser test is skipped or reported as passing without a log.
- Planning-stage documentation is preserved unmodified; the planning audit's "no tests executed"
  statement still describes that audit, not this implementation.
- **External gate (not a software failure):** real participant feedback may not be collected until the
  E14-09/#74 qualified purpose, access, retention and preservation review is complete. The retention
  entry deliberately records no duration and keeps purging disabled.
- **External gate:** no publication, testimonial, public rating or marketing use is implemented; adding
  one requires its own explicit permission and backlog authority.
- **Owner acceptance:** PENDING for all five criteria. Software evidence cannot and does not certify
  legal approval, actual commercial satisfaction or pilot readiness.

## Reproduction

```bash
pnpm --filter @nasj/contracts build
pnpm --filter @nasj/api test
pnpm --filter @nasj/web test
pnpm test:integration          # includes E18-06 HTTP and migration/restore scenarios
pnpm --filter @nasj/api test:demo
npx playwright test tests/e2e/order-feedback.spec.ts
pnpm lint && pnpm typecheck && pnpm build && git diff --check
```

All database work uses `disposableDatabase()` from `apps/api/test/support.ts`, which creates and
removes a throwaway container per run.
