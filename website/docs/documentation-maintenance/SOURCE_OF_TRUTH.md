# Source of truth

**Last verified:** 1 November 2026.

One authoritative location per topic. Everything else links here.

## Current documentation

| Topic | Authoritative document |
|---|---|
| Project purpose and actors | `00-project/overview.md` |
| Capability status | `00-project/current-status.md` |
| Deliberate boundaries | `00-project/scope-and-boundaries.md` |
| Vocabulary | `00-project/terminology.md` |
| Repository layout | `00-project/repository-map.md` |
| System structure | `02-architecture/system-overview.md` |
| Authorization | `02-architecture/authorization-model.md` |
| Database design | `02-architecture/database-architecture.md` |
| Transactions and locks | `02-architecture/transaction-integrity.md` |
| Events and outbox | `02-architecture/event-and-outbox-model.md` |
| API routes and CSRF | `02-architecture/api-architecture.md` |
| Setup and reproduction | `03-engineering/local-development.md` |
| Migrations | `03-engineering/database-and-migrations.md` |
| Tests and coverage | `09-verification-and-quality/testing-guide.md` |
| Concurrency limits | `09-verification-and-quality/concurrency-limitations.md` |
| Security model | `06-security-and-governance/security-overview.md` |
| Deployment | `07-operations/deployment.md` |
| Monitoring | `07-operations/monitoring.md` |
| Background jobs | `07-operations/background-jobs.md` |
| Runbooks | `07-operations/operational-runbooks.md` |
| Outstanding work | `08-backlog-and-acceptance/known-gaps.md` |
| IoT boundary | `05-iot/wearable-overview.md` |
| Documentation rules | `documentation-maintenance/CONVENTIONS.md` |
| Evidence loss record | `documentation-maintenance/EVIDENCE_RECOVERY_STATUS.md` |

## Code is the final authority

For anything the documents describe, the implementation wins:

| Subject | Authoritative source |
|---|---|
| Database shape | `apps/api/prisma/schema.prisma` |
| Migrations | `apps/api/prisma/migrations/` |
| Request and response shapes | `packages/contracts/src/` |
| Permissions | `packages/contracts/src/permissions.ts` |
| Routes | `apps/api/src/modules/**/*.controller.ts` |
| Transaction behaviour | `apps/api/src/modules/foundation/transaction.ts` |

If a document and the code disagree, the code is right and the document is a defect.

## Historical evidence

`99-archive/` and `docs/engineering/evidence/` hold dated records. They are **not** authoritative for
current behaviour. A historical PASS does not mean the current commit passes.
