# Concurrency limitations

**Last verified:** 1 November 2026.

## The claim that cannot be made

**Genuine multi-connection concurrency has not been proven in this environment.**

Domain writes serialize behind two global advisory locks
(`pg_advisory_xact_lock(724631902)` and `724631903`) taken at the start of every transaction. That
makes check-then-act sequences safe. It does not mean the system has been tested under truly
simultaneous load.

## Why the available harness cannot prove it

The PGlite harness runs real PostgreSQL 17.5 over the wire protocol, so SQL, Prisma and HTTP
behaviour are genuine. But it **serializes connections**. Measured directly:

| Observation | Result |
|---|---|
| Session B executing while A holds an open transaction | times out |
| `distinctSessions` | false |

Reporting that as concurrency testing would be false. It is single-connection evidence.

## What would prove it

The Docker-backed integration suite creates disposable PostgreSQL containers and runs genuinely
concurrent scenarios. It requires Docker, which the delivery sandbox denies.

Until that suite runs, these rows remain **BLOCKED**, not passed:

| ID | Scenario |
|---|---|
| G71-07 | Duplicate payout retry under concurrent submission |
| G20-06 | Duplicate delivery confirmation under concurrent submission |

## Residual risk

A defect that only appears when two transactions interleave — lost update, write skew, phantom
read — would not be caught by the current evidence. The advisory lock makes such defects unlikely
for domain writes, because they cannot interleave at all. Anything that bypasses the lock would not
be covered.

## Related

- [Transaction integrity](../02-architecture/transaction-integrity.md)
- [Testing guide](testing-guide.md)
