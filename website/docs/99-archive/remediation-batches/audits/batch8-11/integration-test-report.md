# Integration Test Report — Batches 8–11

Date: 28 October 2026. Repository: `website/`.

## 1. Executed commands and exact results

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `pnpm lint` | 0 | **PASS** — 379 files, 0 findings |
| 2 | `pnpm typecheck` | 0 | **PASS** — contracts + api + api-typecheck:test + web; 0 TS errors |
| 3 | `node --import tsx --test test/unit/*.test.ts` (apps/api) | 0 | **PASS** — 108 tests, 108 pass, 0 fail, 0 skipped, 0 todo |
| 4 | `node --import tsx --test test/*.test.ts` (apps/web) | 0 | **PASS** — 25 tests, 25 pass, 0 fail, 0 skipped |
| 5 | `pnpm --filter @nasj/api test` | 1 | **BLOCKED** — `EPERM: listen …/tsx-1000/*.pipe` (sandbox IPC), not an application failure |
| 6 | `pnpm --filter @nasj/web test` | 1 | **BLOCKED** — same sandbox IPC restriction |
| 7 | `pnpm test:integration` | 1 | **BLOCKED** — `EPERM` IPC on the wrapper; direct run blocked by Docker (below) |
| 8 | `node --import tsx test/integration.ts` (direct) | 1 | **BLOCKED** — `docker --context default run … postgres:17.7-alpine` → `permission denied … /var/run/docker.sock` |
| 9 | `pnpm test:e2e` | 1 | **BLOCKED** — same Docker permission failure after codegen |
| 10 | `pnpm test:e2e:demo` | — | **NOT RUN** — same prerequisite as #9 |
| 11 | `pnpm build` | 0 | **PASS** — all new routes emitted |
| 12 | `pnpm --filter @nasj/api exec prisma validate` | 0 | **PASS** — schema valid |
| 13 | `git diff --check` | 0 | **PASS** — no whitespace errors |

Anything reported as PASS above is a real execution in this session. Items 5–10 are **not** passes.

## 2. Integration coverage of the new modules

**Coverage: zero.** No integration scenario file exists for Batches 8–11.

Existing scenario files: 22 (`apps/api/test/*.scenarios.ts`). The files whose names suggest overlap are
pre-existing and unrelated:

- `catalog.scenarios.ts` — imports `BuyerCatalog`/`CommerceWorkspaceView` from Batch 6 buyer catalog, **not**
  `ProductSpecification`. Confirmed by reading its imports.
- `tests/e2e/catalog.spec.ts` — likewise Batch 6 buyer catalog.

No file references `AllocationPlan`, `ProductSpecification`, `RecommendationSnapshot`,
`ProductionException`, `Counteroffer`, `ScheduleRevision`, `SupportTicket` or `NotificationDelivery`.

The brief's 50 required scenarios (planning 6, catalog 6, intelligence 6, collaboration 8, plus concurrency,
idempotency, tenant isolation, revocation, migration preservation, full flow, reset) are therefore **entirely
unexecuted**.

## 3. Browser coverage

**Zero.** `/operator/planning`, `/operator/planning/[orderId]`, `/catalog`, `/intelligence` and
`/collaboration` have **no** Playwright spec. They compile (`pnpm build` lists all five as dynamic routes) but
have never been driven in a browser.

## 4. What the unit tests actually prove

Worth stating plainly, because a large pass count can mislead:

- `planning.test.ts` (10) — pure functions: ranking tiers, unknown-capacity handling, allocation invariants,
  suggestion, release-once, pricing arithmetic, simulation feasibility. **No Prisma, no HTTP, no auth.**
- `catalog.test.ts` (4) — state machines and gating predicates only.
- `intelligence.test.ts` (13) — risk/forecast/fairness/metric pure functions.
- `collaboration.test.ts` (7) — transition tables and notification honesty.

None of these exercises a controller, an authorization path, a transaction, a unique constraint or an
idempotency replay. Those are precisely the areas where the audit found defects (see
`SECURITY_AND_CONSENT_AUDIT.md`), and they are unproven.

## 5. Failure details

All six blocked commands fail on **infrastructure**, with two distinct causes:

1. **Sandbox IPC** — `tsx` creates a unix socket at `/tmp/claude-1000/tsx-1000/N.pipe`; the sandbox denies
   `listen`. This breaks every `pnpm` wrapper before the test code runs.
2. **Docker socket** — bypassing (1) with `node --import tsx`, the integration harness spawns
   `docker --context default run --rm -d … postgres:17.7-alpine`; the Docker socket is permission-denied.

Neither cause indicates a defect in the application.

## 6. Pre-existing failures

None detected. The 74 pre-existing API unit tests and 25 web unit tests still pass unchanged, so Batches 8–11
introduced no unit regression.

## 7. Evidence paths

| Artifact | Path |
|---|---|
| API unit log | `$TMPDIR/a-api.log` |
| Web unit log | `$TMPDIR/a-web.log` |
| Integration attempt | `$TMPDIR/a-int.log` |
| E2E attempt | `$TMPDIR/a-e2e.log` |
| Build log | `$TMPDIR/a-build.log` |
| Lint log | `$TMPDIR/a-lint.log` |
| Typecheck log | `$TMPDIR/a-tc.log` |

`$TMPDIR` is session-scoped and will not survive; the results are transcribed above.

## 8. What must happen next

1. Grant Docker socket access (or provide an external `DATABASE_URL`) so the harness can provision Postgres.
2. Run `pnpm test:integration`, then add the scenario files listed in `NEXT_IMPLEMENTATION_BACKLOG.md`.
3. Run Playwright against a booted API + web to cover the five new routes.
4. Only then can any story move to `VERIFIED_SOFTWARE_CRITERIA`.
