# Database and migrations

**Last verified:** 1 November 2026. 39 migrations, all applied.

## Policy

Migrations are **append-only**. An applied migration is never edited, even to fix a typo in a
comment, because a database that already ran it would not re-run the corrected version.

A correction is always a new migration. The rename history is the clearest example:

| Migration | Action |
|---|---|
| `202610170001_identity_organizations` | Creates `hirfacare_audit_append_only()` |
| `202610200001_nasj_rename` | Renames that function to `nasj_audit_append_only()` |

Both files must remain exactly as written, or replay fails. The same applies to
`20261021010000_revised_foundation`, which adds a role value, and `20261021040000_nasj_operator_role`,
which renames it.

## Commands

```bash
pnpm db:generate   # regenerate the Prisma client after a schema change
pnpm db:migrate    # apply pending migrations
node scripts/pg/migrate-verify.mjs   # apply all migrations to an in-process PostgreSQL and report counts
```

`migrate-verify.mjs` uses PGlite — real PostgreSQL 17.5 compiled to WASM — so it works without
Docker. It applies each `migration.sql` verbatim, as `migrate deploy` would.

## Schema change workflow

1. Edit `apps/api/prisma/schema.prisma`.
2. Run `pnpm db:generate`.
3. Determine whether the change needs SQL. A **relation-only** change (adding a back-relation that
   already has a foreign key) produces no DDL. Prove it:
   ```bash
   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o /tmp/ddl.sql
   ```
   Compare the foreign-key statements against the existing migration.
4. If DDL is required, create a new migration. Never modify an existing one.
5. Run `migrate-verify.mjs` to confirm all migrations still apply cleanly.

## Constraints you must not relax

`execution_unverified`, `payout_status`, `SimulatedSettlement_provenance_check`,
`DeliveryReport_provenance_check` and `deposit_unverified` exist to make false financial and delivery
claims unrepresentable. Relaxing one to make a test pass is fabricating evidence.

See [Database architecture](../02-architecture/database-architecture.md).
