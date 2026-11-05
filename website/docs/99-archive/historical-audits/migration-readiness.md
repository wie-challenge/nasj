# Migration and release readiness — Batch 6

No persistent database was migrated, reset or restored by this batch. A read-only status inspection of the existing local development target returned UNAVAILABLE; no services were started. No production backup was read. Readiness below is evidence from controlled synthetic disposable databases, not staging deployment or pilot authorization.

## Migration chain

The original eight recent migrations 20261027010000 through 20261027080000 precede the new additive `20261027090000_demo_scenarios`. The new migration adds DemoVisitor, DemoScenario, DemoIdentity and DemoCommand. Unique visitor/generation, one ACTIVE generation per visitor, unique persona identity, scoped command keys, foreign keys and immutable identity/command triggers enforce ownership and replay foundations. It does not rewrite earlier commercial states, payables, inventory movements or authentication records.

The initial eight-file SHA-256 inventory is `evidence/batch6-20261027/initial-migration-hashes.txt`. Validate it after work. `prisma validate` and TypeScript check the schema/client independently of deployment. The complete chain is applied normally to newly created disposable PostgreSQL in integration and browser tests.

## Observed backup/restore upgrade drill

`apps/api/test/migration-readiness.scenarios.ts` creates a new disposable source at the Batch 5 boundary with normal `prisma migrate deploy` against a temporary migration directory containing the original twenty migrations. It seeds synthetic identities, organizations, capacity, accepted terms, batch, material requirements and a recognized payable using existing controlled fixtures. It captures a table-by-table row digest, pg_dumps the source, encrypts/authenticates/decrypts the archive, and verifies the PostgreSQL custom-format signature.

A second disposable target receives that archive with pg_restore. Every source table's digest must match before upgrade. The script checks migration status, applies the full current chain using normal migrate deploy, compares every prior business table digest again and confirms the four new showroom tables are empty. Only `_prisma_migrations` changes its migration bookkeeping. All twenty-one migrations must be finished. No caller-supplied persistent source or target is accepted.

The existing integration restore drill separately runs the repository's private encrypted backup tool and checks every synthetic table/configuration after restore. Final command outcomes and row/table counts are recorded in BATCH6_IMPLEMENTATION.md and raw logs; the procedures alone are not a pass claim.

## Schema drift findings

The drill also runs read-only `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`. It reports older inventory/finance foreign keys that are not represented as Prisma relations. Inventory and finance models intentionally retain scalar identifiers while SQL establishes restrictive foreign keys. The new showroom models include their SQL-matching Prisma relations and no longer add to this difference. The exact diff is retained between SCHEMA_DRIFT_REVIEW_BEGIN/END in `migration-readiness.log`. This is a known schema-management limitation, not a clean-drift claim. Do not apply the generated diff: it would remove database-enforced relationships. Before persistent release, reconcile declarative relation metadata with the manual SQL under separate review, confirm intended checks/triggers, and validate a candidate migration on a restored copy. `db push` and database reset are not release procedures.

## Release security review

Demo entry is fail-closed outside DEMO_MODE, requires loopback database/public origins and nasj_demo, and cannot run with NODE_ENV=production. It uses the existing Better Auth provider and distinct demo cookie prefix; no raw credentials are emitted to the browser. A visitor proof is HttpOnly and hashed in PostgreSQL. Mutations require exact origin, visitor-bound CSRF and idempotency. Ordinary business APIs retain session CSRF, privileged MFA, current roles/grants, assignment checks, rate limits and redacted errors. Showroom sessions are rejected without matching active visitor ownership; resetting does not revoke unrelated sessions.

Production still requires HTTPS, configured rate protection and authenticated TLS mail, with privileged MFA. Public QR records remain coarse, approved and revocable; they expose neither individual worker pay nor monitoring records. No new bank/provider or physical evidence integration is enabled. Environment/credential files stay ignored/private. Test logs contain synthetic records and safe error categories, not secret connection strings.

## Staging deployment procedure — owner authorization required

1. Record intended environment, database/schema, existing migration status, release commit and approver. Stop if target identity is unclear; do not infer it from a local default.
2. Use the existing backup procedure with private key/config files, verify archive authentication and retention/access ownership. Do not print keys, passwords or connection URLs.
3. Restore the target's approved backup into an isolated disposable environment, compare protected records and rehearse the complete additive migrate deploy plus consistency/regression checks.
4. Review schema drift and all SQL-only constraints/triggers. Confirm environment, sessions, MFA, origin/CSRF/rate policies, QR privacy and test results against the deployment topology.
5. Obtain authorization for the concrete persistent target migration and maintenance/recovery plan. This batch does not provide that authorization.
6. Apply reviewed migrations with the normal mechanism; never reset or push a schema to erase conflicts. Verify identities/sessions, accepted quotes, commitments, inventory and finance histories and current application readiness.
7. On failure, stop writes, retain evidence and execute the approved restore/recovery plan on the approved target. An additive migration is not automatically reversible by dropping new tables; retain immutable scenario history. Do not run a destructive rollback blindly.

Remaining gates: owner acceptance, clean external setup rehearsal, current organizer source, deployment-specific TLS/proxy/mail/backup/monitoring validation, retained-demo cleanup/quota policy if hosting, and separate real-world stock/bank/legal/tax approvals. Synthetic demo reliability, staging readiness and live pilot readiness are separate decisions.
