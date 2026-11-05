# NASJ website

A small full-stack starting point extracted and adapted from the IEEE Tunisia Partnership Hub. The reference project is unchanged. Product documents and the GitHub backlog importer belong to the separate `docs` repository. The optional sibling checkout at `../docs/` is not required to run this website.

The foundation provides verified Better Auth accounts, password recovery/change, session management, verified email changes, TOTP MFA, organizations and approvals, multi-role memberships, secure staff invitations, artisan profiles/skills/capacity, optional associations, consent-bound delegation, privacy requests, support cases and append-only access audits. A bounded synthetic commerce workspace now supports buyer RFQs/quotes, voluntary artisan offers, cumulative production, reconciled QA, fulfillment and isolated simulated settlement. Real contracts, banking, comprehensive accounting and physical firmware remain outside the implemented prototype. The local worker provides rebuildable synthetic analytics and scoped in-app notices.

## Architecture

```text
Browser → Next.js App Router → same-origin /api rewrite → NestJS
                                                        ├─ Better Auth
                                                        ├─ Arcjet / development rate limiter
                                                        ├─ Prisma → PostgreSQL
                                                        └─ SMTP authentication mail
```

- `apps/web`: Next.js 16, React, TypeScript, responsive forms and protected profile/admin pages.
- `apps/api`: ESM NestJS 11, Better Auth, Prisma 7 PostgreSQL adapter, official Arcjet Nest integration, structured logging.
- `packages/contracts`: shared strict Zod inputs and safe response types; no server credentials or Prisma imports.
- One API owns authentication and the database. A separate database-local worker consumes metadata events; no Redis, microservices or Turbo dependency.

## Repository layout

NASJ uses four independent Git repositories: `website`, `ai-backend`, `iot` and `docs`. The parent `wie-challenge/` directory is only a local container for sibling checkouts; it has no Git repository, submodules or shared dependency manifest.

This website repository owns:

- `apps/web/`: Next.js frontend.
- `apps/api/`: NestJS application API and business modules.
- `packages/contracts/`: shared frontend/API schemas and types.
- `tests/` and `scripts/`: website tests and tooling.
- `.github/workflows/`: website CI, running from this repository root.
- `.env`, `.local/`, `node_modules/`: ignored environment, credentials and dependencies.

The existing pnpm packages are internal to this website repository. Builds, tests and runtime do not load sibling repositories. IoT owns an independent local wearable simulator; neither that checkout nor the separate AI service is required by website commands.

Run commands below from the **website repository root**. Links to `../docs/` assume an optional sibling docs checkout.

## Requirements and first run

Node.js 24, pnpm 11.3.0, Docker Engine with Compose. This machine's working Docker context is `default`; scripts explicitly select it. Ports 3000, 3001, 5442, 1026 and 8026 must be available.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` is the single local entrypoint. It preserves/creates `.env`, reuses healthy local PostgreSQL/Mailpit services or starts missing Compose services, builds shared contracts, generates Prisma Client, applies pending migrations, seeds six fictional local accounts, then starts the API and web app together. One environment supplies database access, browser rewrites and server rendering.

Open **http://localhost:3000/auth/login**. Local account emails/passwords are in **`.local/dev-credentials.json`** (mode0600). When an existing demo credential file is present on first local setup, its six fictional passwords are preserved for the local accounts, so previously saved credentials work at the canonical URL. Subsequent starts preserve existing users, credentials, passwords and fixture records. You can also register normally; verification mail appears at **http://localhost:8026**.

Press **Ctrl+C** once to stop both app processes; database/mail services and data remain. The launcher rejects a second running instance, reports occupied ports, and refuses production/remote database configurations. API readiness remains **http://127.0.0.1:3001/api/health/ready**. Dependencies must be installed and Docker available when services need to be created.

`setup:local` creates a mode-0600 `.env` with random authentication/database secrets only if it does not exist. It never overwrites existing secrets. `.env.example` documents the actual configuration. Never copy the placeholder values directly into production.

Compose creates a dedicated `nasj` project and persistent PostgreSQL volume; the SQL Server container on this machine is unrelated. `pnpm services:stop` stops only this project's services and preserves data.

## Administrator setup

Local `pnpm dev` includes a fictional administrator with a generated private password in `.local/dev-credentials.json`. For separately managed accounts or production, create and verify an ordinary account first. From the trusted server/operator environment:

```bash
pnpm db:bootstrap-admin -- admin@example.com
```

Use the verified account's actual address. This promotes the account, revokes its sessions, and creates no password or default administrator. Sign in again and open `/admin/users`. The final active verified administrator cannot be disabled, deactivated or demoted through the application.

## Configuration

All secrets are server-only; no `NEXT_PUBLIC_*` secret variables are used.

| Variables | Purpose |
|---|---|
| `PUBLIC_APP_URL` | Exact browser origin, no trailing slash; local default `http://localhost:3000` |
| `API_HOST`, `API_PORT` | API listener; defaults `127.0.0.1:3001` |
| `API_INTERNAL_URL` | Server-only Next-to-Nest origin; included in the rewrite at build time |
| `DATABASE_URL` | Runtime PostgreSQL connection |
| `REQUIRE_PRIVILEGED_MFA` | Must be true in production; enforces provider MFA and verified session for privileged accounts |
| `DEMO_MODE` | Isolated synthetic deployment only; requires the dedicated demo database |
| `MIGRATION_DATABASE_URL` | Optional separate schema-owner URL for migrations |
| `POSTGRES_PASSWORD` | Local Compose database password, matching the URL |
| `BETTER_AUTH_SECRET` | At least 48 random characters; generated locally by setup |
| `TRUST_PROXY` | Comma-separated explicit proxy IPs/CIDRs; empty trusts none |
| `ARCJET_ENABLED`, `ARCJET_KEY`, `ARCJET_MODE`, `ARCJET_FAILURE_MODE` | Provider enablement, secret key, `DRY_RUN`/`LIVE`, `closed`/`open` |
| `RATE_{LOGIN,REGISTRATION,RESET,VERIFICATION,API,ADMIN}_{MAX,WINDOW}` | Independent request limits; windows in seconds |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Authentication mail transport |
| `NODE_ENV`, `LOG_LEVEL` | Runtime mode and safe structured log level |

Use the configured browser origin consistently: `localhost` and `127.0.0.1` are different origins and cookie hosts. If you change the browser URL or API destination, update the environment and restart/rebuild Next.

### Arcjet

Local `.env` explicitly uses `ARCJET_ENABLED=false`: PostgreSQL rate limits still enforce, but remote Shield/bot/email protection is off. With a valid server-side key, set `ARCJET_ENABLED=true`, `ARCJET_MODE=DRY_RUN`, and observe legitimate traffic and decision logs. Switch to `LIVE` after validating the rules for your ingress and clients. There is one security boundary in Nest covering both authentication and application routes; Next does not count the same requests again.

Production startup requires HTTPS `PUBLIC_APP_URL`, enabled/keyed Arcjet with explicit `ARCJET_MODE=LIVE`, and authenticated TLS SMTP. Omitted mode and `DRY_RUN` are rejected in production; development/test may retain observational mode. Fail-closed provider behavior is the default. Full deployment, proxy and privacy assumptions are in [security.md](../docs/security.md). Live Arcjet decisions and real external SMTP delivery have not been validated without deployment credentials.

## Database changes

The original authentication migration is preserved. Six additive migrations add identity/organization/artisan/governance features, provider MFA, capacity revisions, durable command outcomes, audit outbox/receipts, isolated synthetic commerce and derived projections/notices. `User` gains preferred language and MFA status; `Session` gains server-only MFA proof. Capacity revisions preserve values/history and reject contradictory overlapping periods. Foreign keys preserve referenced history. The IAM migration adds an append-only audit trigger, capacity checks, pending-invitation uniqueness and five reference craft entries. Prisma generates its client separately from schema deployment.

`pnpm db:migrate` uses **migrate deploy**, with no reset or `db push`. Review the SQL and point credentials at the intended dedicated database before running it elsewhere. If tables already conflict, stop and design a baseline/data-preserving migration rather than resetting. Keep migrations committed and deploy them once before starting the new API version. Use least-privilege runtime credentials and a separate migration owner in production.

For new schema work, edit `apps/api/prisma/schema.prisma`, create a reviewed migration against a dedicated developer database (`pnpm --filter @nasj/api exec prisma migrate dev --name your_change`), generate the client, and run integration tests. Never run `migrate dev` against shared/production data.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit --audit-level=high
pnpm build
```

Unit tests use provider doubles. Integration tests create, migrate and remove their own uniquely named PostgreSQL containers and capture mail locally; they never use `.env`'s database for test writes. Browser tests also use a disposable database, an isolated optimized Next build and a local API on 3100/3101. They require Docker and Chromium. `/usr/bin/chromium` is used when available; otherwise Playwright's installed Chromium is used. Override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if necessary. Test traces contain synthetic fixture data and are ignored by Git.

CI runs lint, typecheck, unit tests and the audit on every push, and integration, e2e and build on pull requests to `main` once they are marked ready for review (Draft PRs skip them).

### Security checks

`pnpm install` installs a Git pre-commit hook (Husky) that checks the staged files only:

1. `biome check --staged`: lint and formatting. Fix with `pnpm exec biome check --staged --write`.
2. Gitleaks: refuses API keys, tokens, passwords and private keys. Install it once (`winget install gitleaks`, `brew install gitleaks` or a release binary from <https://github.com/gitleaks/gitleaks/releases>); without it the hook only prints a warning.

The hook is an early warning, not the security boundary: CI repeats the checks. If you ever skip it with `git commit --no-verify`, say why in the pull request. If a secret was committed, even on a branch that was never merged, treat it as leaked and rotate it.

## Production build and start

Set deployment secrets through the server environment. Build with the intended `API_INTERNAL_URL`, then run each service under a process supervisor:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
pnpm db:migrate
# Terminal/process 1
pnpm --filter @nasj/api start
# Terminal/process 2
pnpm --filter @nasj/web start
```

Set `NODE_ENV=production` for the deployed API. `next start` serves the optimized frontend; container packaging can be added for the deployment platform when needed. TLS terminates at your controlled ingress. Keep PostgreSQL private and explicitly configure/validate proxy trust before enabling LIVE IP-based limits. The included Compose file is a local development setup, not a production deployment.

## Further reading

- [Documentation portal](docs/README.md): entry point for all NASJ documentation.
- [Extraction plan](../docs/foundation-extraction-plan.md): pre-implementation audit and decisions.
- [Extraction report](../docs/extraction-report.md): provenance, changes and verification results.
- [Security model](../docs/security.md): controls, policies and limitations.
- [Extension guide](../docs/foundation-guide.md): adding a business module.
- [Detailed product backlog](../docs/NASJ_FINAL_Detailed_Backlog.md): future product scope.

## Identity and organization workspaces

After sign-in, use `/settings/organizations` to create a buyer business or association, complete the profile and submit approval. A platform administrator reviews `/admin/approvals`. The organization creator is its initial manager; approved managers can invite staff, assign roles within the organization type and manage memberships. Global ADMIN alone does not grant organization financial or artisan access. Sole managers must hand over before leaving or deactivating.

- `/settings/account`: existing account controls plus language and verified email-change request.
- `/settings/security`: authenticator setup, one-time recovery codes and verification status.
- `/settings/notifications`, `/settings/privacy`: opt-in categories, consents, requests and personal-data export.
- `/organizations/[id]/settings`: profile, approval, members, invitations and scoped roles.
- `/artisan/profile`, `/artisan/skills`, `/artisan/capacity`, `/artisan/associations`, `/artisan/delegations`: independent artisan workspace; association participation is optional.
- `/artisan/assisted`: only explicitly authorized assistance targets and scopes.
- `/admin/users`, `/admin/organizations`, `/admin/approvals`, `/admin/audit`, `/admin/privacy-requests`: platform account/governance review.
- `/support/cases`, `/support/privacy`: personal or explicitly scoped support and privacy workflows.

Artisan creation requires explicit versioned processing consent. Capacity is independently declared, stored as decimal quantity with an effective period, and never derived from wearable data. Declarations preserve history; future allocation must use separate accepted commitments. Raw wearable and health data are excluded from commercial models.

Production requires `REQUIRE_PRIVILEGED_MFA=true`. Enroll in Security settings before privileged work; development defaults false to support local setup, which is not sufficient for a real pilot. Email-change confirmation is sent to the old address before verification of the new address. No authentication email can be changed through profile editing.

Privacy requests support review and retention notes; they do not run an automatic erasure job. Support email reports SMTP acceptance and honors opt-in, without claiming confirmed delivery. See [retention and privacy operations](../docs/data-retention.md).

Normal local development uses only `pnpm dev` and `http://localhost:3000`. The following advanced commands retain a separately isolated reviewer environment:

```bash
pnpm demo:setup
# In separate terminals:
pnpm demo:api
pnpm demo:web
```

Open `http://127.0.0.1:3200`. Six fictional persona credentials are stored privately in `.local/demo-credentials.json`; setup does not print them. These optional reviewer accounts belong to port3200, while the normal project entrypoint uses `.local/dev-credentials.json` at port3000. Demo setup preserves its own secrets and uses a separate database, volume and authentication cookie prefix. See [demo isolation](../docs/demo-identity.md).

Detailed implementation and verification are tracked in [the implementation tracker](../docs/foundation-implementation-tracker.md). Actual endpoint policies are in [organization access](../docs/organization-access.md), [artisan access](../docs/artisan-access.md), [governance APIs](../docs/governance-api.md), and [lifecycle recovery](../docs/lifecycle-recovery.md).

## E16 reliability and verification

Capacity declarations now accept scoped replay keys, and IAM audits write metadata-only outbox events transactionally. Run `pnpm worker --watch` as a separate local database consumer, `pnpm worker --status` for diagnostics, and `pnpm ops:check` for local readiness/queue alerts. The built worker is `pnpm --filter @nasj/api worker --watch`. The worker delivers durable scoped commerce notices and rebuilds synthetic reports; physical firmware and device communication remain deferred.

Self-contained guides in this repository: [architecture and exact TND rules](docs/02-architecture/system-overview.md), [API/replay contract](docs/02-architecture/api-architecture.md), [development](docs/03-engineering/local-development.md), [deployment](docs/07-operations/deployment.md), [security](docs/06-security-and-governance/security-overview.md), [testing](docs/09-verification-and-quality/testing-guide.md), [firmware/privacy matrix](docs/05-iot/wearable-overview.md), [backup/recovery and alerts](docs/07-operations/operational-runbooks.md).

The [engineering report](docs/99-archive/historical-audits/e16-engineering-report.md), [E16 audit](docs/99-archive/historical-audits/e16-implementation-audit.md), [acceptance matrix](docs/99-archive/historical-audits/e16-acceptance-matrix.md), [test results](docs/99-archive/historical-audits/e16-test-results.md), [security report](docs/99-archive/historical-audits/e16-security-test-report.md) and [release assessment](docs/99-archive/historical-audits/e16-release-readiness.md) distinguish implemented foundation and synthetic commerce from remaining hardware and production requirements. Synthetic fixtures are not live transactions or verified operational evidence. Do not reset production data; automated tests and restore drills use disposable databases.

### Buyer, artisan and operator journeys (#32, #88, #195)

Browse `/commerce/catalog` for synthetic craft examples, illustrative images, units/specifications and indicative lead-time assumptions. Empty categories, missing images and unavailable examples have explicit states. Eligible examples open the existing buyer RFQ form with specification suggestions; the buyer must confirm quantity, destination and a future deadline. The API validates the selected example against the current active craft. Nothing in the catalog establishes stock, verified capacity, an approved SKU or a supply promise. See [E02 catalog verification](docs/99-archive/historical-audits/e02-catalog-report.md).

Use `/commerce/buyer` for saved RFQs, submission and exact quote/receipt decisions; `/commerce/artisan` for immutable offer review, voluntary acceptance/decline and cumulative progress; `/commerce/operator` for assigned funding, allocation, production, QA, shipment and simulated settlement. Every screen labels synthetic data, and the API/DB reject live provenance. See the [commerce rules and architecture](docs/02-architecture/commerce-domain.md), [API contracts](docs/02-architecture/api-architecture.md) and [three-issue completion evidence](docs/99-archive/historical-audits/e16-target-stories-report.md).

Local seeded personas retain their existing roles. The internal organization manager can explicitly assign QUALITY_INSPECTOR and INVENTORY_LOGISTICS_COORDINATOR to the appropriate synthetic staff through organization settings; global administrator status alone grants no commerce access. The artisan must declare PIECES for the same craft and a period covering the planned delivery deadline (future windows are supported). Existing demo capacity uses **DEMO — Traditional embroidery**, so choose that same craft when using that persona. Offers reserve one selected declaration conservatively; declined/expired offers release their tentative reservation.

These stories are implemented for the synthetic prototype, with mobile/desktop/keyboard/axe and emulated slow-device evidence. This is not a complete accessibility certification, real payment implementation or firmware/hardware verification.


E16 follow-up adds durable scoped commerce notices, rebuildable synthetic reports/CSV, authenticated encrypted local backups and a standalone fixed wearable simulator. Run `pnpm worker --watch` for notices/reports and `pnpm worker --rebuild-analytics` for safe backfill. The local accelerated device fixture lives in the independent `iot/simulator` project. Device values remain SIMULATED until hardware arrives. Backup setup/approved local recovery targets are in [operations](docs/07-operations/operational-runbooks.md); current evidence and external blockers are in [E16 acceptance](docs/99-archive/historical-audits/e16-acceptance-matrix.md).


Run `pnpm verify:clean` for the full fresh-source quality pipeline. Local backup and health scheduling is available through `pnpm ops:setup --prepare` / `--enable`, with private local alerts and no external paging; see the operations guide. The simulator remains exclusively in the independent IoT repository, with communication deferred.

## Competition showroom and evidence

Batch 6 adds a visitor-owned isolated showroom at `/demo`, public `/evidence` methodology and `/presentation` views. Six fictional personas use real Better Auth sessions and existing scoped workspaces. Reset recreates only the visitor's generation, retains immutable history and does not affect other visitors. Global governance administration is not offered through visitor switching.

Read [the scenario guide](docs/99-archive/historical-audits/demo-scenario-guide.md), [reset runbook](docs/99-archive/historical-audits/demo-reset-runbook.md), [provenance policy](docs/99-archive/historical-audits/evidence-provenance-policy.md) and [migration readiness](docs/99-archive/historical-audits/migration-readiness.md). Existing `demo:setup` deploys migrations to the separate persistent local demo DB and needs separate owner authorization; automated verification uses new disposable containers instead. Do not run `pnpm dev` or `demo:setup` as a read-only migration check.

`pnpm test:e2e` runs normal browser regressions, then a separate isolated demo build and real commercial/reset journey. `pnpm test:e2e:demo` runs just that showroom suite; `pnpm --filter @nasj/api test:demo` runs real HTTP control/reset/isolation scenarios. `pnpm competition:validate` checks the editable [report source](docs/competition/PHASE1_TECHNICAL_REPORT.md) and [video storyboard](docs/competition/PHASE1_VIDEO_STORYBOARD.md); it does not certify an absent PDF/video or competition compliance. Official-format validation was skipped at owner request and remains a submission gate. No verified bank payments, physical stock or live pilot readiness is established by a synthetic showroom.
