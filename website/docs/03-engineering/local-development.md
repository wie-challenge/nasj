# Reproduce the website

Use Node 24 (validated with 24.20.0), pnpm 11.3.0, Docker Engine/Compose, and run from this repository root. No sibling repository is required.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`dev` creates/preserves private local environment, starts/reuses PostgreSQL 17.7 and Mailpit, builds contracts/generates Prisma, deploys migrations, seeds fictional accounts, and runs web/API at localhost:3000/3001. It refuses remote/production databases. Local credentials remain in ignored mode-0600 `.local/dev-credentials.json`; do not print or commit them. Mailpit is localhost:8026. Ctrl+C stops apps, preserving data. `pnpm services:stop` stops only this project's services. Never reset a shared database to fix migrations.

`.env.example` describes the server environment. `pnpm setup:local` preserves existing secrets. `pnpm db:migrate` uses deploy, `pnpm db:generate` generates the client, `pnpm db:seed` seeds local data. Website build ordering is contracts → API → web. The simulator has its own toolchain in the independent IoT repository. Use `pnpm worker --once`, `pnpm worker --watch`, or `pnpm worker --status` to consume/inspect metadata events in the configured database. The worker is an explicit separate process and does not send external messages.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm audit --audit-level=high`, `pnpm build`. Browser tests need Chromium (`pnpm exec playwright install chromium`); `/usr/bin/chromium` is used when installed. Integration/browser tests allocate their own disposable containers and never read local database credentials for test writes. A restore drill runs within the integration suite.

Troubleshooting: verify `docker --context default info`, ports 3000/3001/5442/1026/8026, Node/pnpm versions and the browser Origin (localhost differs from 127.0.0.1). Rebuild after changing `API_INTERNAL_URL`; it is compiled into the Next rewrite. If browser tests regenerate next-env paths for `.next-e2e`, normal `pnpm build` restores the normal output paths.


## Run the synthetic commercial journeys

After the existing local setup, sign in with the private local fictional personas and open the Commerce navigation. Buyers need BUYER in an approved BUYER_BUSINESS organization. Production, QA, finance and logistics need their explicit role in the assigned approved INTERNAL organization. The seeded internal manager can assign missing synthetic staff roles in organization settings; no global ADMIN bypass is provided. Artisans choose their own craft and PIECES capacity window in `/artisan/profile`/`/artisan/capacity`; the window must cover the RFQ deadline. Future windows can be reserved. The seeded demo craft is DEMO — Traditional embroidery, not the reference weaving skill used in automated tests.

Buyer: save/reopen/edit a draft, submit it, then accept the exact unexpired quote. Operator: review/quote, schedule and progress a **simulated buyer receipt**, confirm funding, enter planning, issue immutable artisan offers. Artisan: review every term, accept or decline freely, then start material-ready work and report cumulative totals. Production releases accepted assignments; QA starts inspection, reconciles approved + rejected + pending, records rework or approval; logistics records synthetic shipment/delivery; buyer accepts receipt. Finance separately reconciles QA-earned artisan payouts before order settlement and records a synthetic materials/returns disposition before closure. See [the state and reconciliation rules](../02-architecture/commerce-domain.md).

No real transaction occurs. Do not interpret an operator-entered material attestation or simulated payment label as observed physical/financial evidence. Commercial records have no delete/reset endpoint; use a fresh disposable database for repeatable tests, preserve local history, and never run test-reset/restore helpers against shared or production data.


Run `pnpm demo` from the separate `iot/simulator` directory for the accelerated fixed local device fixture. Website commands do not run or require it. Edit fixture values or inject a new DeviceAdapter when the device arrives; keep SIMULATED labels until physical verification. `pnpm worker --watch` is required for commerce reports/inbox; `pnpm worker --rebuild-analytics` safely backfills projections. `pnpm ops:backup` is explicit operator tooling requiring private key/storage configuration; see operations before use.


`pnpm verify:clean` verifies the current source in a fresh private temporary checkout: ordinary frozen install, setup, client generation, lint/types/unit/integration/browser tests, audit and production build. It excludes ignored files and secrets, creates disposable databases and uses test ports 3100/3101. Logs and per-command outcomes are written to ignored `.local/clean-verification`; the temporary checkout is removed. The checkout lives in the user's cache directory so pnpm uses its ordinary existing package store; integrity/security checks are not bypassed. This is a fresh source/dependency installation, not a claim of an empty package cache. It preserves the unrelated service on port 3000 and the developer database.

For approved local-demo backup/health scheduling and private alerts, use `pnpm ops:setup --prepare` then `--enable`; see [operations](../07-operations/operational-runbooks.md). Hardware and simulator communication remain outside website commands.
