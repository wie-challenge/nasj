# Operations, backup and recovery

API JSON logs contain random correlation IDs, normalized route labels, status and duration. Request bodies, raw URLs, credentials, cookies and wearable payloads are omitted/redacted. Actual Pino output is tested with sentinel secrets. IDs remain personal metadata: restrict log access. Worker logs expose event/correlation IDs, status, attempts, duration and fixed error codes, without exception text or free text from audits.

`GET /api/health/live` checks the process; `GET /api/health/ready` checks PostgreSQL and safely returns 503 when unavailable. PostgreSQL connection acquisition is bounded to five seconds. Readiness does not certify SMTP/Arcjet or a backup. `pnpm ops:check` probes local readiness with a three-second HTTP timeout, database/queue status, failed deliveries and lag over five minutes. A configured `BACKUP_DIRECTORY` also enables missing/stale (>24-hour) backup alerts; invalid/inaccessible backup storage emits BACKUP_UNAVAILABLE. Fixed JSON codes and nonzero exit support a supervisor. Local user timers and a private alert log are available below. No external paging integration is configured.

## Approved local-demo policy

On 2026-10-20 the user explicitly approved: **owner = project user; recovery point target = 24 hours; recovery time target = four hours; encrypted-backup retention = seven days**. These are reviewed targets for the local synthetic demo, not measured production guarantees. The local owner has enabled the daily backup and five-minute health timers described below; alerts stay in the private local log. Hosted/off-site storage, region, key escrow and production ownership remain outside the selected local-demo scope. A local disk alone does not protect against host loss.

The executable `pnpm ops:backup` runs PostgreSQL 17 `pg_dump -Fc` inside the selected Docker default-context container. Container authentication stays internal: no password or database URL in command arguments. The tool supports archives up to 64 MiB for this local demo and fails on larger dumps; use reviewed streaming/managed backups before larger deployment. It encrypts in memory using **AES-256-GCM**, random nonce and authenticated HCAB1 format, writes a new 0600 archive without overwrite/symlink following and requires a private owned directory and owned 0600, exactly 32-byte key file. Wrong keys/tampered envelopes fail authentication before any restore. No unencrypted archive or configuration copy is written by the backup command. Managed local backups include the private runtime `.env` (including authentication/encryption configuration) inside the authenticated encrypted payload; the backup encryption key itself remains separate. Old matching private archives are pruned only after a new backup succeeds; unrelated files are preserved. Root ignore rules exclude key/dump/encrypted archive artifacts.

Prepare private directories and a key outside Git (example path under ignored `.local` for the local demo). Back up the key separately under owner-controlled access; loss of the key makes restoration impossible. Do not print the key or upload archives/environment files in CI.

```sh
install -d -m 700 .local/backups .local/backup-keys
(umask 077; set -C; openssl rand 32 > .local/backup-keys/demo.key)
export BACKUP_CONTAINER=nasj-postgres-1
export BACKUP_DIRECTORY="$PWD/.local/backups"
export BACKUP_KEY_FILE="$PWD/.local/backup-keys/demo.key"
export BACKUP_DATABASE_USER=nasj
export BACKUP_DATABASE_NAME=nasj
export BACKUP_CONFIG_FILE="$PWD/.env"
pnpm ops:backup
pnpm ops:check
```

Choose the actual container/user/database from the local compose configuration; the example is not automatically executed. Generate the key once and preserve it; do not overwrite an existing recovery key. Success emits BACKUP_CREATED, filename, encrypted byte count, configurationIncluded flag, duration and number of expired archives removed. Failure emits only BACKUP_FAILED and a nonzero exit. Backup-age checks inspect private archive metadata, not decryptability or source integrity; periodic restores remain mandatory.

The real integration drill invokes this exact backup CLI against a newly created synthetic test container, decrypts/authenticates the payload, verifies private configuration byte-for-byte into the isolated test context, extracts a 0600 temporary database archive and restores using `pg_restore --clean --if-exists --exit-on-error` into a second disposable container and compares every public table's row count/content hash. This includes RFQs, orders, offers, batches, inspections, exact payment amounts, command outcomes, audits, notices, projections and receipts. Both containers/private files are removed in finally blocks. The destructive restore helper accepts only test-harness container names. It cannot accept a production restore URL. See the measured observations in `../engineering/e16-test-results.md`.

Production recovery requires an isolated target, protected decryption tooling/key access, disabled integrations and explicit cutover review. Do not restore over the working database. Check migration history, quantities, earned/paid/outstanding obligations and all row hashes. Historical identity backups can resurrect sessions/tokens: revoke/rotate before cutover. Preserve audit and deduplication history. A successful small local drill does not demonstrate hosted/off-site recovery or the approved four-hour target at production scale.

## Worker, analytics and replay

`pnpm worker --watch` runs committed local inbox delivery and synthetic analytics ETL. `--once` processes at most 50 events. `--status` reports counts, oldest pending age and up to 20 failed event IDs. Five failures enter FAILED with fixed LOCAL_CONSUMER_FAILED; retries use exponential delays. Investigate code/version/source first, then `pnpm worker --retry-failed EVENT_ID`. Queue access is trusted-server only; no public replay endpoint exists. Do not erase outcomes/receipts/queue rows as an operational remedy.

The prototype uses the existing database outbox for these justified workloads, without a broker. API commands and consumers acquire the same IAM locks in a fixed order; this intentionally serializes short prototype transactions to preserve consistent source snapshots. Row locks are the running state; no stale lease is needed. A killed process rolls back and releases its claim. Projection, notice and receipt effects commit atomically. Both failure-after-effects and actual SIGKILL/restart recovery are tested. This is at-least-once processing with durable local deduplication, not exactly-once external delivery or a demonstrated growth-scale throughput claim.

`pnpm worker --rebuild-analytics` recomputes order projections from authoritative synthetic rows and shipment/acceptance audit milestones, in cursor batches of 50 (maximum programmatic batch 100). It writes no commercial ledger or notices. Re-running is safe; metrics remain stable and asOf advances. Backfill failures exit nonzero; retry rebuild from the start safely. Normal event delivery carries persisted attempts/duration/failure/lag. Reports display stale/pending status for outstanding buyer-organization events. External email/invitation/support delivery remains separate from this database-local worker; do not call SMTP inside its transaction.

For incidents: correlate safe request/event IDs, inspect readiness/DB availability and migration state, check worker health/lag, repair the cause and selectively replay. On regression stop the worker and roll back to the previous compatible API/web build while preserving additive tables. For failed migration inspect `_prisma_migrations`, back up, repair and use reviewed resolve/deploy procedures. Never reset shared data. Hosted routing, off-site storage and provider outages need separate deployment verification.


## Local-demo schedule and alert destination

`pnpm ops:setup --prepare` validates the canonical local development configuration, preserves an existing private recovery key/configuration, and prepares/verifies user systemd units under ignored `.local/operations/units`. `pnpm ops:setup --enable` installs only NASJ-managed units in the current user's systemd directory and enables the timers; it refuses unmanaged replacements. `pnpm ops:setup --disable` disables those timers while preserving backup archives and keys. No system-wide services, external alert messages or lingering user session are configured.

The backup timer runs daily at midnight in the host timezone and catches missed runs when the user manager resumes. The health timer checks every five minutes while `.local/dev.lock` indicates the canonical `pnpm dev` session is active. It pauses while the application is intentionally stopped; stale locks after a crash still allow outage detection until the normal launcher cleans them up. The local host was configured and checked on 2026-10-20. The project's previously disconnected PostgreSQL container was reattached to its own existing Docker network; migrations were then applied without resetting its volume or credentials.

`pnpm ops:run backup` / `pnpm ops:run health` invokes the actual underlying commands with bounded timeouts. Only allowlisted result codes reach `.local/operations/{backup,health}.json`, a private 0600 latest-status file, and failures append to private `alerts.ndjson` (bounded to approximately 1 MiB). Raw child output, exception details and secrets are never copied to alerts. systemd also records service exit state. User-timer execution requires the machine and user manager to be running; the reviewed RPO/RTO remain targets, not guarantees while the host is off. Reprepare units after changing the Node installation/project location; the local units reference the current explicit executable and source paths.

```sh
pnpm ops:setup --prepare
pnpm ops:setup --enable
systemctl --user list-timers 'nasj-local-*'
pnpm ops:run backup
pnpm ops:run health
systemctl --user status nasj-local-backup.service nasj-local-health.service
pnpm ops:setup --disable
```

A real scheduled-service backup succeeded. An intentionally stopped API produced API_NOT_READY; starting the existing compiled API made the actual operational command return OPERATION_OK. The temporary API process was then stopped, and health monitoring is paused until the next canonical dev session. Tests also exercise malformed/secret-bearing child output filtering, private alert/status permissions and symlink rejection. `scripts/check-operations.ts` now boots its API-owned entrypoint so strict pnpm resolution finds reflect-metadata in its declared package.


Database-only legacy payloads remain readable. Current payload version 2 stores a bounded private configuration file together with the PostgreSQL custom dump, all authenticated/encrypted under HCAB1. Configuration inputs must be owned regular files with no symlink, private permissions and a maximum of 1 MiB; the total encrypted input remains limited to 64 MiB. `unpackDatabaseBackup(decryptBackup(...))` separates database and configuration for a reviewed isolated recovery. Never print recovered configuration or overwrite the active `.env`; stage it with 0600 permissions outside the live application and review target URLs/session rotation before cutover. No private-document/upload feature exists to back up; add any future required document store to the inventory. Preserve/recover the backup key separately.

## Batch 12 operational and privacy extension

The existing local-demo RPO (24 hours), RTO (four hours), seven-day encrypted-backup retention and project-user ownership remain targets reviewed for the local synthetic scope. Current measured isolated drill timings belong in `../engineering/evidence/batch12/integration-final.log`; they are observations, not hosted recovery guarantees. Run the existing restore harness with integrations disabled in a new disposable target; preserve all table hashes, native constraints, migration history, financial source IDs and idempotency records. Wrong-key, tampered-backup, permissions, failed backup and stale/missing backup checks remain executable unit tests. Never restore into the working database or run a persistent demo reset as part of this drill.

`ops:check` now adds `NOTIFICATION_REVIEW_REQUIRED` for failed or ambiguous email submissions, and `NOTIFICATION_SENDING_AGE_REVIEW` for notifications created more than five minutes ago that are currently marked sending (an age heuristic, not a measured attempt timeout). Investigate the provider acknowledgement before requeueing; `SENDING`/`UNCERTAIN` must not be blindly resent. API readiness, DB failure, outbox failures/lag and backup storage/freshness remain separate fixed alert codes. Domain transaction failures log a correlation ID and fixed rejection code without request contents, exception text or private financial evidence. Existing HTTP and security audit events retain their established boundaries. Local alerts are not an external paging service.

Before live recovery or pilot operation, name primary/on-call operations, privacy and security incident owners; verify off-host encrypted storage, key recovery, delivery acknowledgement and escalation channels in the chosen deployment. During an incident, preserve redacted correlation/audit evidence, revoke compromised sessions or memberships through existing controls, disable affected integrations, restore and verify only in isolation, then obtain an explicit cutover decision. Do not erase financial or contractual history as incident cleanup.

The governed inventory is `GET /api/v1/governance/retention` (platform governance only), rendered at `/admin/retention`. Its nine commercial data classes cover identity/membership, profiles, contacts, agreements, finance, support/attachments, production observations, audit/security and synthetic records. Purpose, access, retention trigger, preservation, correction/removal and response ownership are technically represented. Durations and named controller/incident assignments remain pending qualified review. Recording an operational review does not grant legal approval or enable purging. Contact expiry/opt-out removes contact details from the sales view; accepted obligations and history remain protected. Existing privacy request and public trace-revocation workflows remain authoritative. Wearable raw readings and summaries remain local-only, outside the commercial inventory and exports.
