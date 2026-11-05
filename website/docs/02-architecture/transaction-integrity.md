# Transaction integrity

**Last verified:** 1 November 2026 against `apps/api/src/modules/foundation/transaction.ts`.

Every domain command runs inside `iamTransaction`. It is the single place where identity is
re-validated, concurrency is serialized and atomicity is guaranteed.

## What a transaction does

```text
BEGIN
  pg_advisory_xact_lock(724631902)
  pg_advisory_xact_lock(724631903)
  reload user  -> must be ACTIVE and email-verified
  reload session -> must exist and be unexpired
  run the command
  write AuditEvent
  write OutboxEvent
COMMIT
```

If any step throws, the whole unit rolls back. There is no partial write and no compensating action.

## Why the advisory locks

The two fixed keys serialize all domain writes. This is a deliberate trade-off:

- **Benefit:** a concurrent change cannot land between a guard read and its commit. Check-then-act
  sequences (capacity reservation, custody totals, payout capacity) are safe without per-row locking
  or optimistic-retry logic.
- **Cost:** write throughput is single-file per database. That is acceptable for a prototype with
  bounded concurrency and would need revisiting for production scale.

The acquisition order is fixed, so two transactions can never deadlock against each other.

## What is deliberately outside the transaction

The comment in `transaction.ts` records the constraint: these transactions perform **no SMTP and no
external network requests**. Mail is queued, not sent inline. This keeps transaction duration bounded
and prevents a slow provider from holding the global lock.

## Audit and outbox atomicity

`audit()` writes two rows in the same transaction:

| Row | Purpose |
|---|---|
| `AuditEvent` | Append-only record; `audit_append_only` trigger blocks UPDATE and DELETE |
| `OutboxEvent` | Metadata-only signal for the worker |

Because both commit with the business state, the audit trail cannot disagree with the data it
describes.

## Known limitation

The advisory lock serializes sessions, which means **concurrency cannot be proven by a single
connection**. The Docker-backed integration suite is the only place that exercises genuinely
simultaneous transactions. See [Concurrency limitations](../09-verification-and-quality/concurrency-limitations.md).

## Related

- [Database architecture](database-architecture.md)
- [Event and outbox model](event-and-outbox-model.md)
- [Authorization model](authorization-model.md)
