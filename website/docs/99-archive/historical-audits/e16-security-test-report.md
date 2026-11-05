# E16 security test report — 2026-10-20

Simulator ownership update: the user requested IoT ownership after this verification run. The simulator now lives in the independent `iot/simulator` project with its own tools/lockfile/tests/CI. Website commands no longer build/test/run it, and the cross-repository simulator integration scenario was removed. Current website totals are 46 unit and 58 integration tests; IoT separately retains 12 simulator tests. Earlier 54/59 logs below are historical pre-move evidence. Device/application communication remains deferred.

Scope: actual local synthetic website, durable local consumers, reports/downloads/inbox, encrypted backups and independent simulator. Unit/integration/browser evidence is in [test results](e16-test-results.md). This supersedes the prior receipt-only/absent-simulator assessment.

| Boundary | Executed evidence | Result / limit |
|---|---|---|
| Authentication/session | Anonymous, forged/expired/revoked sessions, unverified/disabled accounts, MFA, replay session expiry | PASS implemented routes; hosted ingress/provider configuration unverified |
| Input/origin/CSRF/rate | Strict unknown fields, invalid IDs, malformed/oversized JSON, pagination, origin/proxy spoofing, atomic rate limits | PASS; uploads arbitrary files N/A because absent |
| Resource/tenant roles | Two buyer organizations, assigned internal roles, artisan owner, private drafts, association/delegation/admin denials | PASS; no global ADMIN or manager operational-role bypass |
| Reports and CSV | Foreign buyer/artisan whole-order denial, money minimization for buyer/QA, no arbitrary path, nested mismatch, revocation | PASS actual JSON/CSV routes; fixed enum/integer CSV cells contain no user formulas |
| Inbox | Current approved memberships/account scope; unrelated inbox empty; membership revocation removes old org notices | PASS; no user/tenant scope override and no free-text audit payload exposure |
| Financial/state integrity | Concurrent duplicate/outcome conflict, allocation race, monotone production, QA totals, exact earned/paid/closure and terminal guards | PASS synthetic PostgreSQL; live financial providers absent |
| Audit and consumers | Mutation/outcome/audit/event rollback, metadata sentinel privacy, useful effects rollback, retry exhaustion/replay, real SIGKILL/restart | PASS atomic local effects/receipt; existing external SMTP separate, not exactly-once delivery |
| ETL isolation | Replay/backfill produce stable aggregates with unchanged source ledger; explicit source provenance/coverage and scope | PASS; no cost/time/verified-bank source invented, no wearable dataset accepted |
| Logging | Actual Pino sink excludes secret/body/cookie/authorization/signal sentinels while retaining correlation/duration | PASS tested structured paths; callers still must never put secrets in message text/unreviewed keys |
| Backup | Actual AES-GCM CLI database/private-configuration dump/decrypt/restore, legacy compatibility, wrong-key/tamper failure, private owner/permissions, no overwrite/symlink and seven-day pruning | PASS local/disposable; off-host storage/key escrow and production cutover unverified |
| Operations | Safe liveness/readiness, bounded DB acquisition, lag/failure alerts and approved 24-hour backup freshness | PASS local alert codes; daily backup/five-minute conditional health user timers and private allowlisted alert log configured/tested; no external paging |
| Wearable separation | Twelve simulator tests; fetch/TCP-denied lifecycle makes zero attempts; actual standalone process leaves capacity/order/event ledgers unchanged | PASS software simulation; no physical packet-capture or motor/accuracy claim |
| Supply chain | Current ordinary frozen fresh-source install and both website/IoT dependency audits executed successfully | PASS, no known vulnerabilities reported; dependency resolutions unchanged |

No confirmed unresolved cross-tenant/replay/ledger defect was found in the executed scope. Residual risks: personal IDs in restricted logs/queue/inbox require retention governance; shared locks deliberately serialize prototype throughput; temporary browser retry keys do not survive reload; restore can resurrect historical sessions requiring revocation; backups have a 64 MiB local-demo limit; hosted secret/storage/alert/provider controls and physical privacy checks need separate verification. Absence of a finding in these tests is not a blanket penetration-test/production certification.


Final local verification fixes strict pnpm health-CLI dependency resolution through an API-owned entrypoint. Scheduler subprocess output is reduced to fixed allowlisted codes; malformed/secret-bearing output is never copied to local alerts. Private status/alert files and timer command paths are tested, and actual systemd units validated/installed. A real backup and intentional API outage/recovery were observed. No production cutover, external message or device transport was introduced.
