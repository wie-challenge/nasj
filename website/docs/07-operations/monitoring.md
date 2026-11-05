# Monitoring

**Last verified:** 1 November 2026 against `apps/api/src/modules/health/` and `scripts/`.

## Health endpoints

| Endpoint | Checks | Failure |
|---|---|---|
| `GET /api/health/live` | Process is running | — |
| `GET /api/health/ready` | PostgreSQL reachable | Safe `503` |

Readiness does **not** certify SMTP, Arcjet or a backup. It answers one question: can the API reach its
database.

## Logging

API logs are structured JSON with:

- a random correlation ID
- a normalized route label
- status and duration

Request bodies, raw URLs, credentials, cookies and wearable payloads are omitted or redacted.
Sentinel-secret tests verify this.

**Identifiers remain personal metadata.** Restrict log access even though payloads are redacted.

## Operator checks

```bash
pnpm ops:check
```

Probes local readiness with a three-second timeout, database and queue status, failed deliveries, and
lag over five minutes. Emits fixed JSON codes and a nonzero exit status for a supervisor.

## Alerts

`apps/api/src/jobs/alerts.ts` raises:

| Alert | Trigger |
|---|---|
| `BACKUP_MISSING` | No backup recorded |
| `BACKUP_STALE` | Last backup older than 24 hours |
| `BACKUP_UNAVAILABLE` | Backup storage invalid or inaccessible |

There is **no external paging integration**. Alerts are local codes, an exit status and a private
alert log. Wiring them to on-call is not implemented.

## Related

- [Operational runbooks](operational-runbooks.md)
- [Background jobs](background-jobs.md)
