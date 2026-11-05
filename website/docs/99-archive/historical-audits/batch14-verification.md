# Batch 14 verification report — E15-06 / #192

For the subsequent B14-IV-02 client recovery remediation and current-source evidence, see
[BATCH14_REMEDIATION_REPORT.md](batch14-remediation-report.md). The execution totals below
remain the historical 28 October implementation run.

28 October 2026 · Africa/Tunis. Every figure below comes from a retained log in
`docs/engineering/evidence/batch14/`. Nothing blocked, skipped or unexecuted is reported as a pass.

**Owner acceptance: PENDING.** Synthetic software evidence only. No real participant feedback was
collected; no live environment, persistent database, deployment or GitHub state was touched.

## Verification environment

| Item | Value |
|---|---|
| Runtime | Node 24.20.0, pnpm 11.3.0 |
| Database | disposable PostgreSQL 17.7-alpine containers, created and destroyed per run |
| Migrations applied | 38 (37 pre-existing + `20261028170000_demo_feedback`) |
| Mail | local SMTP capture only |
| Browser | Chromium via Playwright 1.64.1, 390×844 and 1280×900 |
| Persistent database touched | no |

## Unit tests

| Suite | Result | Log |
|---|---|---|
| `@nasj/api` units | 147 passed, 0 failed | `api-unit.log` |
| `@nasj/web` units | 25 passed, 0 failed | `web-unit.log` |

New E15-06 contract coverage in `apps/api/test/unit/demo-feedback.test.ts` (7 cases): the triage
transition table including terminal states and the re-queue path; the closure-reason rule; provenance
labelling that never asserts a real participant view and distinguishes seeded from submitted;
strict-schema rejection of forged `visitorId`, `sourceClass`, `generation`, `status`, `createdAt` and
`actorId`; category, screen-vocabulary and comment-bound validation; plain-text sanitisation; and the
decision/query schemas.

`apps/api/test/unit/batch12.test.ts` moved from ten to eleven retention classes and now also asserts
that `DEMO_VISITOR_FEEDBACK` exists with no invented duration.

## Integration scenarios

| Suite | Result | Log |
|---|---|---|
| Full `pnpm test:integration` | **206 passed, 0 failed, exit 0** | `integration.log` |
| E15-06 HTTP/security scenarios | 4 passed | `focused-feedback.log` |
| E15-06 migration/restore scenarios | 6 passed | `focused-migration.log` |
| Showroom isolation suite (`test:demo`) | 9 passed, 0 failed | `demo.log` |

`apps/api/test/demo.scenarios.ts` now covers:

1. **Valid submission** persisted with server-derived visitor, scenario, generation and
   `VISITOR_SUBMITTED` provenance, starting in `NEW`. — PASS
2. **Invalid category, screen key, oversized comment and forged fields** each rejected with 400 and
   zero rows written. — PASS
3. **Missing CSRF proof** rejected with 403 `DEMO_CSRF_REJECTED`. — PASS
4. **Another visitor's scenario** indistinguishable from missing (404). — PASS
5. **Same-key replay** returns the identical stored result; **changed payload** returns 409
   `IDEMPOTENCY_CONFLICT`; only one row exists. — PASS
6. **Dedupe key** uniqueness enforced at the database. — PASS
7. **Per-scenario cap** reached returns 409 `FEEDBACK_LIMIT` with the row count unchanged. — PASS
8. **Cross-visitor read**: another visitor sees an empty list and the id never appears in their
   session view. — PASS
9. **All six showroom personas** receive 403 on list, detail and transition. — PASS
10. **SUPPORT persona escalation**: a persona additionally granted a genuine `SUPPORT` role can open
    `/collaboration` (200) yet still receives 403 on every moderation route, with the stored status and
    event count unchanged. — PASS
11. **Reset preservation**: after a real reset the archived scenario retains its feedback exactly, the
    archived generation refuses new submissions with 409 `STALE_DEMO_SCENARIO`, the visitor still sees
    their own archived row, and a second visitor cannot. — PASS
12. **Dedicated bucket**: with `RATE_FEEDBACK_MAX=2`, the third write returns 429 `RATE_LIMITED` with a
    positive `Retry-After` and stores nothing. — PASS
13. **Concurrency**: six parallel submissions are all refused once the cap is reached; four parallel
    requests with one shared key never duplicate a row. — PASS
14. **Financial and claims non-interference**: payables, adjustments, disputes, support tickets,
    `BuyerOrderFeedback`, settlements and delivery confirmations are snapshotted before and after and
    are identical. — PASS
15. **ADMIN moderation**: a real account is denied before promotion (403) and allowed after; filters
    work and reject unknown enums; detail shows the anonymous submission labelled `Visitor
    (anonymous)`; a missing closure reason is 400; a direct `NEW → ACTIONED` jump is 409; a stale tab
    is 409 `STALE_STATUS`; `ACTIONED` is terminal for both the API and the database; history is
    `SUBMITTED → STATUS_CHANGED → STATUS_CHANGED` with the reviewer's real name; `AuditEvent` rows
    never contain the comment; the visitor still cannot moderate; event UPDATE and DELETE are rejected.
    — PASS

## Migration and restore evidence

| Check | Result |
|---|---|
| B14-M01 new tables absent on the pre-migration baseline | PASS |
| B14-M02 `migrate deploy` preserves every pre-existing row hash | PASS |
| B14-M03 restrictive FKs, CHECKs, partial unique index and all four triggers present; `DemoCommand_operation_check` widened to include `feedback` | PASS |
| B14-M04 valid row accepted; generation mismatch, foreign-visitor scenario, bad vocabulary, content rewrite, aggregate delete, event rewrite/delete and terminal-to-nonterminal reopening rejection; failed event insert rolls the status change back | PASS |
| B14-M05 migration history matches every SQL file, none rolled back, historical migrations preserved | PASS |
| B14-M06 `pg_dump`/`pg_restore` reproduces feedback and its attributed history exactly and retains the append-only trigger | PASS |

Migration JSON evidence: `{"evidence":"DISPOSABLE_NATIVE_POSTGRESQL_DEMO_FEEDBACK_UPGRADE","migration":"20261028170000_demo_feedback","preservedBaselineTables":132,"persistentDatabaseTouched":false}`.

## Browser journeys

`tests/demo-e2e/showroom.spec.ts` adds two journeys on real sessions and real API/database effects:

1. **Visitor**: start a scenario through the UI → a forced 503 keeps the draft text → a real submission
   is confirmed with the provenance notice → it survives reload → it survives a real showroom reset →
   the archived generation's row is still readable by its own visitor via the browser session → axe
   clean with no horizontal overflow → the form remains usable at 390×844.
2. **Administrator**: a visitor item is submitted via the API → a real account is denied before
   promotion and promoted through the loopback control endpoint → signs in → the inbox renders the
   comment, the provenance label and the anonymous history → a status transition with a reason is
   recorded → the API confirms `TRIAGED` with exactly `SUBMITTED` then `STATUS_CHANGED` attributed to
   the real reviewer name → axe clean.

Result: **4 passed, 0 failed** for the whole showroom demo suite run together (`browser-demo.log`),
plus the full application and showroom regression (`e2e-all.log`).

**Harness-only adjustment:** the browser suite runs from one loopback client address, so the default
dedicated bucket (8 per 300 s) throttled later tests in a single run. `tests/e2e/setup.ts` therefore
sets `RATE_FEEDBACK_MAX: 500` for the test harness only. Production defaults in `env.ts` stay
conservative, and the limiter itself is still proved by the dedicated `RATE_FEEDBACK_MAX=2` scenario in
`demo.scenarios.ts`, which asserts a real 429 with `Retry-After` and zero rows stored.

## Full browser regression

`pnpm test:e2e` on the final source (log `e2e-all.log`, exit 0):

| Suite | Result |
|---|---|
| Application browser tests (`tests/e2e`) | 54 passed, 0 failed |
| Showroom browser tests (`tests/demo-e2e`, including both new E15-06 journeys) | 5 passed, 0 failed |

No pre-existing journey regressed, and the two new E15-06 journeys pass inside the full suite as well
as in isolation.

## Static checks

| Check | Result | Log |
|---|---|---|
| `pnpm lint` (Biome, 426 files) | PASS, exit 0, no findings | `lint.log` |
| `pnpm typecheck` (contracts + api + api tests + web) | PASS | `typecheck.log` |
| `pnpm build` (contracts + api + web production build) | PASS | `build.log` |
| Prisma schema validation | PASS | `schema.log` |
| `git diff --check` | PASS | `diff-check.log` |

## Failures, skips and blockers

- No unit, integration or browser test is skipped or claimed as passing without a log.
- Two **test-side** defects were found and corrected during implementation: a migration snapshot that
  omitted the newly created tables (which made the comparison fail), and one Batch 13 migration
  snapshot needing the same forward-looking exclusion. Neither was a product defect; both suites now
  pass.
- **External gate:** real participant feedback collection at scale remains disabled pending the
  E14-09 / #74 qualified purpose, access and retention review. The new retention class deliberately
  records no duration and keeps purging disabled.
- **External gate:** no publication, testimonial, public rating or marketing use exists.
- **Owner acceptance:** PENDING for all five criteria.

## Reproduction

```bash
pnpm --filter @nasj/contracts build
pnpm --filter @nasj/api test
pnpm --filter @nasj/web test
pnpm test:integration              # includes E15-06 HTTP, bucket, concurrency and migration scenarios
pnpm --filter @nasj/api test:demo
npx playwright test tests/demo-e2e/showroom.spec.ts --config playwright.demo.config.ts
pnpm lint && pnpm typecheck && pnpm build && git diff --check
```

All database work uses `disposableDatabase()` from `apps/api/test/support.ts`, which creates and
removes a throwaway container per run.

## 29 October focused remediation verification

The original execution figures above are preserved. Following the independent P2 finding,
[BATCH14_REMEDIATION_REPORT.md](batch14-remediation-report.md) records the client fix and current-source
147 API / 25 web units, 206 integration scenarios, and 54 application / 17 showroom browser tests, all
passing. The current showroom total includes the original 5 plus 12 new recovery regressions; a focused
rerun of those 12 is not additional unique coverage. One separate browser case verifies the actual
8/300 rate policy at both widths; 13 focused adversarial groups corroborate server boundaries.

C5 is now VERIFIED_SOFTWARE_CRITERIA; the earlier independent report's PARTIALLY_VERIFIED decision is
preserved as historical evidence. B14-IV-01 and B14-IV-03 remain open LOW findings. Owner acceptance
and E14-09 qualified privacy approval remain PENDING. Current source hashes and logs are in
`evidence/batch14-remediation/`; original execution logs and independent artifacts are unchanged.
