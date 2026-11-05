# Native PostgreSQL migration execution

28 October 2026 · Africa/Tunis.

Docker contexts `default` and `desktop-linux` are accessible in this execution environment. The existing
harness provisions `postgres:17.7-alpine` containers with random credentials and random loopback ports,
uses `prisma migrate deploy`, and removes each disposable container and volume in `finally` cleanup.
The old sandbox/Docker blockers do not apply to this run. No persistent database was selected.

## Executed foundation

[Native evidence](../../../engineering/batch8-11-completion/evidence/migrations-native-final.log) records PostgreSQL 17.7, **34 applied migrations**,
**100 baseline / 127 final public tables** (including `_prisma_migrations`), **20 original Batch 8–11 tables**,
and **65 foreign keys on those original tables** after completion. All original new tables have primary keys,
foreign keys where a parent relation applies, and indexes. `RecommendationPolicy` is a root configuration
record and correctly has no parent foreign key.

The original migrations were deployed after the existing baseline:

- `20261028010000_production_planning`
- `20261028020000_product_catalog`
- `20261028030000_collaboration`

Completion migrations continue additively through `20261028130000_planning_intelligence_authority`.
Historical tracked migrations and SQL-enforced inventory/finance constraints were preserved.
The seven additional tables beyond the original twenty support preserved legacy sample evidence,
forecasts/comparisons, observed time, alerts, reviewed reporting policies and private case images.

`apps/api/test/batch811-migrations.scenarios.ts`, wired into the existing integration harness, executes:

1. A populated synthetic pre-Batch8 baseline through `20261027090000_demo_scenarios`, followed by native
   migrate deploy. Every value of every preexisting column is hashed before/after and preserved. New nullable
   columns are not mistaken for modifications of old business facts.
2. The twenty-table PK/FK/index inventory.
3. Migration-history checksums against every SQL file, with finished/rollback state checks.
4. A foreign-key failure that rolls back every write in its transaction.
5. Concurrent independent PostgreSQL clients racing on the same unique policy version: one succeeds and
   one receives the expected unique-constraint error.

The full domain integration suite adds real offer/capacity locking, concurrent consent, atomic plan issuance,
reallocation, sample recognition, duplicate operations and rollback checks. Those are database executions,
not substitutes based on source inspection or PGlite's single connection.

## Upgrade, restore and drift

[Upgrade/restore evidence](../../../engineering/batch8-11-completion/evidence/upgrade-restore.log) rehearses encrypted backup and restoration of a
populated pre-Batch6 database, normal migrate deploy and preserved old-column hashes. The full suite also
performs `pg_dump`/`pg_restore` and checks every table in an isolated target. Restore targets start from the
foundation baseline so a newer target FK cannot interfere with restoring an older archive.

New catalogue/sample/image relation metadata was aligned with authoritative SQL `ON UPDATE NO ACTION`,
constraint names and indexes. No SQL foreign key was dropped to make Prisma's diff green. The remaining
inventory/finance drift is the preexisting SQL-only FK metadata discrepancy, enumerated between
`SCHEMA_DRIFT_REVIEW_BEGIN/END` in [integration evidence](../../../engineering/batch8-11-completion/evidence/integration-release.log). The regression
allows only those existing removal suggestions; they are reviewed output, not executed DDL.

`scripts/pg/migrate-verify.mjs` and `test/pg-harness/` are older in-process fallback tools. Their previous
numbers are not the evidence for this native run. No `prisma db push` was used.
