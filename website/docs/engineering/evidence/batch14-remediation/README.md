# Batch 14 focused remediation evidence

29 October 2026 · Africa/Tunis. All database work uses disposable PostgreSQL and captured local SMTP.
No persistent database URL is used by these harnesses. Run commands from the `website/` repository.

## Before/after P2 evidence

`baseline-independent.spec.ts` is a copy of the prior independent browser reproducer, with only its
screenshot output path redirected to this directory. `baseline.playwright.config.ts` selects its two
lost-commit-response/edited-draft cases. They passed on the **original source** by confirming the old
409 loop. Their original-source hashes and initial Git state are in `baseline.json`.

The unchanged historical independent report and evidence remain under `batch14-verification/`.
Do not interpret a bug-expecting historical test's PASS as correct current behavior. After remediation,
`tests/demo-e2e/feedback-recovery.spec.ts` cases B exercise that same real `route.fetch()` → API 201 →
`route.abort()` → edit → retry sequence, and instead require recovery of the original accepted result
plus preservation of edits for an explicit fresh-key submission. No test substitutes a fake 201 for
real persistence.

## Current-source reproductions

```bash
pnpm exec playwright test --config docs/engineering/evidence/batch14-remediation/focused.playwright.config.ts
pnpm exec playwright test --config docs/engineering/evidence/batch14-remediation/rate.playwright.config.ts
pnpm exec tsx --tsconfig apps/api/tsconfig.json docs/engineering/evidence/batch14-remediation/adversarial.ts
```

Browser suites need ports 3100/3101 free and must run sequentially. The first config selects the twelve
permanent browser regressions: A–E and cap at 390×900 and 1280×900, with actual HTTP writes, expiry,
record counts, identity checks, keyboard interaction, axe and horizontal-overflow assertions.

The rate config uses the real application and a disposable demo database with feedback max 8 and the
unchanged 300-second window. Its single case checks both widths. It intentionally consumes the budget
through the existing GET/write bucket coupling, then proves 429 + Retry-After and preserved original
operation/edited draft. It does not change production defaults or rate routing. Screenshots capture
both throttled layouts.

The expiry fixture is on the existing nonce-protected loopback test-control server, gated to demo
fixtures. It expires a visitor via its scenario id using the disposable database; it never needs raw
visitor tokens and is not an application API endpoint.

`adversarial.ts` is the prior 13-group executable copied here so its output stays in this directory.
It confirms visitor/ADMIN authority, CSRF/origin checks, concurrency/caps/default limits, rollback,
provenance and non-interference. Two groups intentionally reproduce the retained LOW findings
B14-IV-01 and B14-IV-03. Those PASS labels mean the known gaps remain reproducible, not resolved.

## Repository regression commands

```bash
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused MIGRATION_DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @nasj/api exec prisma validate
git diff --check
```

Prisma validation is offline with an intentionally unusable URL. Avoid launching a probe while another
command is regenerating Prisma's client. The normal browser harness explicitly raises its shared
loopback feedback limit to 500; the separate rate run above and the HTTP default-limit probe exercise
the actual conservative policy. Both LOW findings remain preserved.

## Totals and preservation

- 2 original new E15-06 browser journeys; 5 total original showroom tests.
- 12 added remediation regressions; 17 current full showroom tests.
- The focused 12-case run is a subset of that 17, not 12 extra unique tests.
- 54 application browser tests are separate from the showroom suite.
- 1 additional remediation rate case exercises two widths.
- 6 prior independent browser probes remain historical separate evidence; they are not added to
  current-source success counts.
- 13 adversarial assertion groups are separate from the 206 integration scenario total.
- 9 showroom isolation and 6 Batch 14 migration scenarios are included within 206.

`tested-source-hashes.json` and `preservation.json` attest the product/test source used for current
runs. `baseline.json` records committed HEAD f0b3d756, the initially untracked independent report/
evidence, and initial file hashes. `preservation.json` checks that all earlier independent artifacts,
original execution logs, planning documents, migrations, HEAD and index remain unchanged, while
listing the explicitly authorized changes. `commands.json` and retained raw logs record executions;
`summary.json` is the current software decision. The original summary metadata correction from 4 to
2 new journeys is annotated in place; historical execution logs are not rewritten.
