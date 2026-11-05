# Batch 14 independent verification evidence

Run commands from the `website/` repository root with Node 24 and pnpm 11. Docker's `default`
context must be available. These harnesses allocate and remove disposable PostgreSQL containers.
Do not replace their database helper with a persistent DATABASE_URL.

## Independent probes

```bash
pnpm exec tsx --tsconfig apps/api/tsconfig.json docs/engineering/evidence/batch14-verification/adversarial.ts
pnpm exec playwright test --config docs/engineering/evidence/batch14-verification/independent.playwright.config.ts
```

The browser harness needs loopback ports 3100/3101 free, builds its own production web fixture, and
uses a synthetic API/database/mail setup. Do not run it concurrently with the ordinary E2E suite.
`independent.spec.ts` has three cases at each of 390px and 1280px: keyboard/validation/retry/axe,
committed-response-loss recovery counterexample, and ADMIN review after scenario archival/axe.
The committed-response-loss case **asserts the observed defect**; its test PASS means the defect
reproduced. Screenshots and the structured browser report are retained here.

`adversarial.ts` asserts 13 independent groups. Two groups deliberately reproduce native SQL
history inconsistency and GET/write rate-budget coupling. Those PASS labels similarly indicate a
confirmed counterexample. All state mutation is confined to its freshly created disposable database.
It also injects/removes an event trigger in that database to prove application transaction rollback.

## Repository regression reproduction

```bash
pnpm --filter @nasj/api test:demo
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused MIGRATION_DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @nasj/api exec prisma validate
git diff --check
```

Prisma validation above is offline and uses an intentionally unusable URL. Avoid concurrent commands
that regenerate Prisma while a probe is importing the generated client.

The full integration total includes the six Batch 14 migration scenarios and nine showroom isolation
scenarios. The independent 13 groups and six browser probes are separate additions; duplicated reruns
of existing tests do not increase the distinct repository-suite totals.

`adversarial-initial.log` records an incorrect probe assumption about dedupe responses (expected 500,
actual safe 409), subsequently corrected. `adversarial-generation-race.log` records a transient probe
import failure while Prisma was being regenerated. Final authoritative probe results are
`adversarial.log` and `adversarial-results.json`; failed attempts are not counted as passes.

`baseline.json` records the initially clean tree, HEAD, 459 source hashes, and hashes/timestamps of the
original implementation evidence. `historical-migrations.json` compares all 37 pre-existing SQL files
with commit 76b3911. `final-preservation.json` checks source, original evidence, planning documents,
Batch 13 report, HEAD and index preservation. `summary.json` records the final audit result and counts.

The initial Playwright JSON reporter resolved its output path relative to this config and created a
nested evidence directory. Its JSON was relocated to `independent-browser.json`; the config now uses
that relative filename. This changes only artifact placement, not executed test behavior.
