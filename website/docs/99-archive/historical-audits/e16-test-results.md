# E16 test results — 2026-10-20

Current scope is the approved local synthetic demo. The wearable simulator belongs exclusively to the independent IoT repository. Website tests/build/CI do not require a sibling checkout, individual sensor upload or any device communication.

## Final execution

`pnpm verify:clean` runs the current source in a fresh private checkout under the user's cache directory, with an ordinary verified pnpm package store and no copied ignored environment/node_modules/output files. No trust-lockfile, offline or verify-dependencies workaround is used. A warm package store is allowed; an empty-cache installation is not claimed. Generated credentials and databases are disposable. Test API/Next ports preserve the unrelated service on port 3000. See `evidence/final-local/clean-summary.json` and step logs for exact exit codes/timings.

| Command | Actual outcome |
|---|---|
| `pnpm install --frozen-lockfile` | PASS, ordinary fresh-source installation |
| `pnpm setup:local` / `pnpm db:generate` | PASS, private generated environment and actual client generation |
| `pnpm lint` | PASS, no source warnings/infos in final run |
| `pnpm typecheck` | PASS, contracts/API/API tests/scripts/Next |
| `pnpm test` | PASS, **46** website tests: 41 API/domain/backup/logging/local-operations and 5 web |
| `pnpm test:integration` | PASS, **58** actual PostgreSQL/Nest/Better Auth/local-SMTP scenarios, including root operational CLI regression |
| `pnpm test:e2e` | PASS, **15** Chromium cases, three complete commerce journeys, 15 axe checkpoints with zero violations |
| `pnpm audit --audit-level=high` | PASS, no known vulnerabilities reported |
| `pnpm build` | PASS, contracts/API/optimized Next build |
| Independent IoT frozen install/audit/lint/typecheck/test/build/demo | PASS, **12** local simulator tests; no known vulnerabilities reported |

The final pipeline uses no production database, real payment or physical sensor. Source installation, all seven additive migrations, upgrade preservation, isolated synthetic seeds and actual API/Next startup are exercised. The existing canonical dev entrypoint was not started over the unrelated port-3000 service; the one-command verification harness runs the real services on dedicated test ports.

## Business, privacy and recovery coverage

Existing tests cover real signup/SMTP verification/MFA/session lifecycle, strict origin/CSRF/rate/size boundaries, organization/delegation/tenant/owner/role denials, all five guarded commerce state machines and exact TND/quantity/reconciliation. Synthetic commerce runs RFQ through separate buyer funding, artisan voluntary offers, reservation/decline/expiry/reallocation, production, QA/rework, shipment, buyer acceptance, separate artisan payout and closure.

Outbox tests cover atomic mutation/outcome/audit/event rollback, useful inbox/projection effects, stable backfill and unchanged source ledgers, concurrent replay, failure-after-effects and real SIGKILL/restart recovery. Report/CSV/inbox tests cover foreign tenants, private money projection, nested mismatch and membership revocation. The actual root operations CLI is exercised under strict pnpm resolution and returns the expected readiness alert instead of a missing dependency error.

Actual AES-256-GCM CLI database/configuration bundles are authenticated/decrypted; private configuration is compared byte-for-byte before the database is restored into a second disposable PostgreSQL database. Every public table is compared by count/content hash, including quantities, exact balances, identity, audits/outcomes, projections/notices and receipts. The current integration log records the measured 33-table synthetic restore. Timings are local observations, not production RTO/RPO guarantees. Unit tests cover corruption/wrong keys, unsafe permissions/symlinks/overwrite, retention, logger secret redaction and readiness/queue/backup-age alert thresholds.

## Local operational observations

The user approved local ownership, 24-hour RPO, four-hour RTO and seven-day encrypted retention, then selected local-demo scheduling/alerts only. Actual user units were prepared, verified and installed: daily backup; five-minute health monitoring while the canonical dev session is active. The local private status/allowlisted alert route is configured; no external alert message or hosted provisioning occurred.

The scheduled backup service returned success and created a protected encrypted archive containing both the database and private runtime configuration; an authenticated decode verified the configuration exactly matches the source without exposing it. The actual operational CLI detected API_NOT_READY with the API intentionally stopped, then returned OPERATION_OK after temporarily starting the compiled local API. The API was then stopped; a stale lock for a nonexistent dev process was removed, and conditional monitoring is paused until the next dev session. Existing PostgreSQL was reattached to its configured network and migrated without data/credential reset. Private artifacts and keys remain ignored; operational observation summaries contain no credentials or payloads.

## Browser, simulator and historical evidence

Browser fixtures are version commerce-v1. Three full persisted commerce journeys at 360×800, 768×1024 and 1280×900 reach payout/closure, report, CSV download and inbox. Mobile uses 4x CPU, 150ms latency and constrained throughput. Keyboard activation/focus, associated labels, server-committed lost-response retry, recoverable QA errors, reduced motion and no horizontal overflow are asserted. Fifteen main-content axe checkpoints show zero violations; this is tested scope, not general accessibility/physical-device certification.

IoT build wearable-simulator/0.1.0 uses accelerated hardcoded values. Twelve tests cover exact 40-minute threshold, editable settings, rest/reset/cooldown/control, invalid/missing/disconnected/reordered signals, simulated motor failure, local weeks/clock jumps/retention/delete and zero attempted fetch/TCP calls. The earlier pre-move standalone-process comparison proved unchanged capacity/commerce/events; current website tests correctly do not execute sibling code. Physical board/IMU/wiring/build/accuracy/motor/storage/network capture remain pending the device. Communication is deferred.

`evidence/final-local/` is the current record. `evidence/simulator-move/` retains 42/58 relocation observations; `evidence/followup/` retains 54 combined-unit/59 integration/15 browser pre-move observations; baseline `evidence/` retains 34/54/14. Earlier network/cache and initial bootstrap failures are superseded by current passes, not silently rewritten as successes. Existing pg 8 overlapping-query deprecation remains non-failing.

After explicit user authorization, both feature branches were pushed. Website source commit **da170ab** passed hosted run [39470644079](https://github.com/wie-challenge/website/actions/runs/39470644079), including frozen installation, lint/types, unit/integration/browser tests, audit and build. Independent IoT commit **f471b2b** passed hosted run [39470399845](https://github.com/wie-challenge/iot/actions/runs/39470399845), including install/audit/lint/types/tests/build/demo. Exact completed job/step results are retained in `evidence/final-local/website-hosted-ci.json` and `iot-hosted-ci.json`. This report update is a documentation-only follow-up to those validated source commits. Earlier baseline run [39408764675](https://github.com/wie-challenge/website/actions/runs/39408764675) remains historical. No GitHub issue or parent epic was edited; no merge or deployment occurred.
