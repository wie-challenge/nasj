# Deployment and migration procedure

No deployment was performed by this change. Local Compose is not a production deployment. Supply reviewed secrets via your host's secret manager; runtime must satisfy `apps/api/src/config/env.ts`: production HTTPS origin, privileged MFA, enabled keyed Arcjet, SMTP authentication/TLS, private PostgreSQL and explicit proxy trust. External provider behavior remains unverified without credentials.

1. Take a protected PostgreSQL backup and verify a restore using the operations runbook.
2. Install locked dependencies, generate the client, build with the intended `API_INTERNAL_URL`: `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm build`.
3. Run reviewed migrations once with a schema-owner `MIGRATION_DATABASE_URL`: `pnpm db:migrate`. Use least-privilege application and worker roles on the private DB. No automatic deploy/publish workflow is added.
4. Start supervised web and API processes: `pnpm --filter @nasj/web start`, `pnpm --filter @nasj/api start`. Start the built local consumer separately: `pnpm --filter @nasj/api worker --watch`.
5. Probe liveness and readiness and validate synthetic sign-in, scoped denial and worker status. Terminate gracefully; worker stops after its current bounded batch.

Migrations `202610200001_e16_reliability` and `202610200002_synthetic_commerce` add tables/type/indexes/constraints without rewriting existing data or backfilling events. The commerce migration preserves the synthetic-only boundary with database CHECK constraints and stores exact integer millimes. New API code requires it. Deploy schema before API/worker. Existing API versions ignore these new tables, permitting application rollback while preserving queue/outcome records. Stop worker before rollback. Do not drop tables or reset migrations as routine rollback: deleting command outcomes weakens retry guarantees. Review any destructive reverse migration separately with a verified backup. Database failure should fail readiness; liveness remains independent.

Hosting packaging, TLS/ingress, runtime credential provisioning, off-site backups, alert routing and signed release approval remain operator responsibilities. No real contracts or money movement are supported.


After additive migration `202610200003_commerce_projections`, run the separate worker for in-app notices and synthetic reporting. Backfill existing orders with `pnpm worker --rebuild-analytics` under trusted server configuration. Prior API/web builds can coexist with the additive tables; preserve them and receipts during rollback. Do not drop identity/commercial data. Configure owner-approved local backup targets and 7-day retention using the operations guide. Hosted storage/scheduling/alert destinations and physical-device verification are not supplied by this change.
