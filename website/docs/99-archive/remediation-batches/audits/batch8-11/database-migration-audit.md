# Database & Migration Audit — Batches 8–11

Date: 28 October 2026. Repository: `website/`.

## 1. Verdict

**The three new migrations have NOT been executed against any PostgreSQL database. Their correctness is
unverified by execution.** They were checked statically only. Do not describe them as passing.

## 2. Environment blockers — exact evidence

| Probe | Command | Result |
|---|---|---|
| Docker client | `docker context show` | `desktop-linux` (client present) |
| Docker daemon | `docker info` | `permission denied … unix:///home/ashenix/.docker/desktop/docker.sock` |
| Docker daemon (compose context) | integration harness | `permission denied … unix:///var/run/docker.sock` |
| Compose | `docker compose version` | `v5.6.1` (client present) |
| PostgreSQL ports | `/dev/tcp` probe | 5432 **closed**, 5442 **closed**, 5542 **closed** |
| `psql` | `command -v psql` | not installed |
| `postgres` binary | `command -v postgres` | not installed |
| Unix socket | `ls /tmp/.s.PGSQL*` | none |
| Integration harness | `node --import tsx test/integration.ts` | `docker --context default run --rm -d … postgres:17.7-alpine` → permission denied |
| `pnpm test:integration` | — | `EPERM: listen …/tsx-1000/*.pipe` (sandbox IPC) |
| `pnpm test:e2e` | — | same Docker permission failure after codegen |

Two independent blockers: (a) the sandbox denies the `tsx` IPC socket, so the `pnpm` wrappers fail before
starting; (b) even bypassing that, the integration harness itself needs the Docker socket, which is
permission-denied. **No alternative database is available in this session.**

## 3. Static migration review

Files under `apps/api/prisma/migrations/`:

| Migration | Tables | `BEGIN`/`COMMIT` | Destructive statements |
|---|---|---|---|
| `20261028010000_production_planning` | 6 | yes / yes | none |
| `20261028020000_product_catalog` | 5 | yes / yes | none |
| `20261028030000_collaboration` | 9 | yes / yes | none |

Total 20 new tables, matching the reported 6 + 5 + 9.

Checked: no `DROP TABLE`, no `DROP COLUMN`, no `ALTER TYPE … USING`, no data backfill. Each file is a
single transaction. New migrations are dated after the newest existing migration
(`20261027090000_demo_scenarios`), so ordering is correct.

Not checked (impossible without execution): whether each statement applies cleanly, constraint naming
collisions, index build success, foreign-key target columns, transaction rollback behaviour.

### Tables by migration

**Batch 8 (6):** `RecommendationPolicy`, `RecommendationSnapshot`, `AllocationPlan`, `AllocationPlanItem`,
`AllocationOverride`, `ScheduleScenario`.

**Batch 9 (5):** `ProductSpecification`, `ProductSpecificationRevision`, `ProductSampleRequest`,
`SampleEvaluation`, `BuyerSampleApproval`.

**Batch 11 (9):** `OrderDiscussion`, `DiscussionMessage`, `ProductionException`, `ScheduleRevision`,
`Counteroffer`, `AvailabilityPause`, `SupportTicket`, `SupportTicketEvent`, `NotificationDelivery`.

### Key constraints declared in the schema

- `AllocationPlan @@unique([orderId, version])`
- `AllocationPlanItem @@unique([planId, artisanProfileId])`, `offerId @unique`, `replacementForId @unique`
- `ProductSpecification @@unique([ownerOrganizationId, productCode])`
- `ProductSpecificationRevision @@unique([specificationId, revisionNumber])`
- `BuyerSampleApproval amendmentOfId @unique`
- All foreign keys `ON DELETE RESTRICT` — no cascade deletes into commercial history.

## 4. Prisma relation-metadata drift

The Batch 6 note about drift between Prisma relations and SQL-enforced inventory/finance foreign keys was
investigated. `npx prisma validate` passes, so the schema is internally consistent; the drift is between the
**schema model** and **constraints that exist only in SQL migrations**. Executing
`prisma migrate diff --from-migrations … --to-schema` would be required to enumerate it precisely, and that
needs a shadow database.

**Recommendation:** treat this as a separate reviewed task. Do **not** delete SQL-enforced constraints to make
a diff clean; they may be the only enforcement of an inventory or finance invariant. Enumerate the drift,
then decide case by case.

## 5. Restore/rollback readiness

Not assessed in this session. The repository has `ops:backup` and restore scenarios
(`apps/api/test/restore.scenarios.ts`), but exercising them needs a live database. Rollback of these three
migrations would require dropping 20 tables; since all are additive and nothing existing references them,
a forward-fix is safer than a rollback.

## 6. Reproducible verification runbook

On a machine with working Docker:

```bash
docker run --rm -d --name nasj-audit-pg -e POSTGRES_USER=audit -e POSTGRES_PASSWORD=audit -e POSTGRES_DB=audit -p 127.0.0.1:5599:5432 postgres:17.7-alpine
```

```bash
DATABASE_URL=postgresql://audit:audit@127.0.0.1:5599/audit pnpm --filter @nasj/api exec prisma migrate deploy
```

```bash
DATABASE_URL=postgresql://audit:audit@127.0.0.1:5599/audit pnpm --filter @nasj/api test:integration
```

Then verify the 20 tables:

```bash
docker exec nasj-audit-pg psql -U audit -d audit -c "select tablename from pg_tables where schemaname='public' order by 1;"
```

Never point `DATABASE_URL` at the development, showroom, staging or production database. `prisma db push` is
forbidden for this verification.

## 7. Residual risks

1. **Unverified execution** — the migrations may fail on first real use. Treat as P0 until proven.
2. **Drift** — unresolved, may mask a constraint mismatch.
3. **No rollback rehearsal** — recovery path untested.
4. **Demo database** — the separate demo project (`5542`) has its own volume; the new tables are not seeded
   there (see `SHOWROOM_INTEGRATION_AUDIT.md`).
