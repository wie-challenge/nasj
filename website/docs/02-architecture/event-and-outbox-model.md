# Event and outbox model

**Last verified:** 1 November 2026 against `apps/api/src/modules/foundation/audit.ts` and `src/jobs/`.

## Why an outbox

A business command must record its audit trail and emit its downstream signal atomically. Writing to
an external broker inside the transaction would make that impossible: the broker can fail after the
database commits, or hang while holding the global advisory lock.

The outbox solves this. `audit()` writes two rows in the same transaction:

| Table | Content | Protection |
|---|---|---|
| `AuditEvent` | Actor, action, target, before/after snapshots, correlation ID | `audit_append_only` trigger blocks UPDATE and DELETE |
| `OutboxEvent` | Event type, version, target identifiers, correlation ID | Append-only by convention |

## What an event carries

Identifiers and status only:

- `eventType`, `version`
- `actorId`, `organizationId`
- `targetType`, `targetId`
- `correlationId`

It does **not** carry request bodies, credentials, cookies, or free text from audits. This is
deliberate: the outbox is metadata, so a consumer cannot leak a payload it was never given.

## Consumers

`apps/api/src/jobs/` contains:

| File | Role |
|---|---|
| `outbox.ts` | Drains pending events |
| `commerce-consumer.ts` | Rebuilds commerce projections from milestones |
| `notifications.ts` | Scoped in-app notices |
| `alerts.ts` | Backup age and readiness alerts |

The worker runs against the same database. There is no broker, no queue service and no second
datastore.

## Failure behaviour

Delivery is at-least-once. Consumers must be idempotent; they key on the event and target identity.
A worker restart replays undelivered rows rather than dropping them.

## Related

- [Transaction integrity](transaction-integrity.md)
- [Background jobs](../07-operations/background-jobs.md)
