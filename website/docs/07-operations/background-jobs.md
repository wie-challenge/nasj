# Background jobs

**Last verified:** 1 November 2026 against `apps/api/src/jobs/`.

The worker is a separate process against the same database. There is no broker.

| Entry point | Command |
|---|---|
| Worker | `pnpm worker` |
| Source | `apps/api/src/jobs/main.ts` |

## Jobs

| File | Responsibility |
|---|---|
| `outbox.ts` | Drain `OutboxEvent` rows and dispatch them |
| `commerce-consumer.ts` | Rebuild commerce projections from recorded milestones |
| `notifications.ts` | Produce scoped in-app notices |
| `alerts.ts` | Raise backup-age and readiness alerts |

## Behaviour

- **At-least-once.** A worker restart replays undelivered rows. Consumers key on event and target
  identity, so a replay is not a duplicate.
- **Metadata only.** Events carry identifiers and status. No request bodies, credentials or free text.
- **No external calls inside a transaction.** Mail is queued, not sent inline.

## Failure modes

| Failure | Effect |
|---|---|
| Worker stopped | Events accumulate; business writes continue unaffected |
| Worker restarted | Undelivered events replay |
| Consumer error | The event stays pending and is retried; the fixed error code is logged |

## Observability

Worker logs carry event and correlation identifiers, status, attempt count and duration — never
exception text or free-text audit content. See [Monitoring](monitoring.md).
