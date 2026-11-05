# Database architecture

**Last verified:** 1 November 2026. 134 Prisma models, 39 applied migrations.

`apps/api/prisma/schema.prisma` is the authoritative technical definition. This document explains the
design decisions behind it; it does not restate the schema.

## Shape

| Measure | Value |
|---|---|
| Models | 134 |
| Migrations | 39, all immutable once applied |
| Engine | PostgreSQL 17 |
| Access | Prisma 7 with the `@prisma/adapter-pg` driver adapter |

## Design rules

### Migrations are append-only

An applied migration is never edited. A correction is a new migration. The rename history shows why:
`202610170001` creates a function named `hirfacare_audit_append_only`, and `202610200001` renames it.
Both files must remain as they are, or a database that already ran them cannot be replayed.

### Immutability is enforced in the database, not the service

Several tables are protected by triggers, so no code path — including a future one — can rewrite
history:

| Trigger | Protects |
|---|---|
| `audit_append_only` | `AuditEvent` |
| `DeliveryReport_immutable` | Operator delivery reports |
| `BuyerDeliveryConfirmation_immutable` | Buyer receipts |
| `ContractualDueDate` chain | Contractual date history |
| `BuyerOrderFeedback*` | Feedback revisions |

### Anti-fabrication constraints

The financial and logistics tables carry CHECK constraints that make a false claim unrepresentable:

| Constraint | Effect |
|---|---|
| `SimulatedSettlement_provenance_check` | A simulated settlement is always `SYNTHETIC` and `bankVerified = false` |
| `execution_unverified` | A payout execution can never be marked bank-verified |
| `payout_status` | No payout reaches a settled state |
| `DeliveryReport_provenance_check` | Delivery reports stay synthetic |
| `deposit_unverified` | Buyer deposits cannot claim verification |

This is why "verified payment" reports as unavailable: the schema forbids the state, by design,
until an approved verification authority exists.

### Exact arithmetic

Money is stored as integer millimes (`BigInt`), never floating point. Material quantities use integer
thousandths. Formatting happens at the presentation boundary only.

## Tenant boundaries

Organization ownership is carried on the business objects themselves (`operatorOrganizationId`,
`buyerOrganizationId`, membership rows). Every query scopes through the caller's active memberships.
See [Authorization model](authorization-model.md).

## Known concurrency limitation

Domain writes serialize behind two global advisory locks. This is safe but single-file per database.
See [Transaction integrity](transaction-integrity.md).

## Related

- [System overview](system-overview.md)
- [Data flow](data-flow.md)
- [Database and migrations](../03-engineering/database-and-migrations.md)
