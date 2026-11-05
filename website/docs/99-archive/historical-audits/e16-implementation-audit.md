# E16 implementation audit — 2026-10-20

Historical initial audit/plan. The current full-epic follow-up and final dispositions are in [E16_ACCEPTANCE_MATRIX.md](e16-acceptance-matrix.md) and [E16_ENGINEERING_REPORT.md](e16-engineering-report.md). Earlier missing-commerce/ETL/simulator statements describe the starting point, not the current code.

## Baseline and scope

The website is an independent Git repository with a clean initial worktree. pnpm 11.3.0 / Node 24, strict TypeScript, Next.js 16, NestJS 11, Better Auth, Prisma 7/PostgreSQL, Zod contracts, Biome and Playwright are already implemented. Four migrations preserve identity, organization, artisan and governance history. CI runs static checks, disposable PostgreSQL integration tests and browser tests. Sibling AI and IoT repositories are planning placeholders and are not runtime dependencies.

Public GitHub access returned 404; authenticated `gh api` succeeds. All parent/story descriptions are preserved in `issues/`; twelve retrieved comment lists were empty. Issue #197 reports zero comments but its comments endpoint repeatedly returned unexpected EOF, recorded in its snapshot. The optional sibling detailed backlog supplies additional context. Requirements are not inferred from issue titles.

| Story / issue | Initial status | Existing locations | Gaps / dependencies / recommended changes |
|---|---|---|---|
| E16-01 #32 | MISSING | Capacity validation in contracts and ArtisansService; approval rules in OrganizationsService | No pure domain package/rules, exact TND utility or domain tests. Extract actual capacity/approval rules. Commerce state machines depend on absent RFQ/order/offer/batch/payment models; do not invent these. |
| E16-02 #88 | PARTIAL | web components, globals.css, identity browser tests | Existing semantic forms, skip link, focus and reduced motion. Need mobile/keyboard/failure assertions. Buyer RFQ and production screens absent. No independent WCAG audit. |
| E16-03 #194 | PARTIAL | API integration runner, Playwright tests/setup | Existing synthetic identity/org/artisan journeys and isolated containers. Complete commerce journey unavailable. Add replay/rollback/recovery regressions with persisted assertions. |
| E16-04 #195 | PARTIAL | README, sibling docs | Website checkout depends on optional sibling links for detailed docs. Add self-contained API/architecture/development/deployment/security/testing/firmware/operations guides and actual evidence. |
| E16-05 #78 | PARTIAL | auth guard/gateway, policy service, security service, Zod pipes | Existing independently enforced sessions/RBAC/CSRF and rate limits; rerun tests and extend new header validation. Provider deployment credentials unavailable. |
| E16-06 #75 | MISSING | IAM advisory-lock transactions | Locks prevent races but capacity retries create revisions/audits. Add durable scoped key ledger, payload binding and concurrent replay tests; absent commercial commands remain blocked. |
| E16-07 #76 | PARTIAL | foundation/audit.ts, append-only DB trigger | IAM audits are transactional; no durable outbox or consumer. Add metadata-only events and database-local idempotent consumer; no external publisher requirement exists yet. |
| E16-08 #77 | PARTIAL | pino logging, request IDs, live/ready | No backup/restore drill or incident runbook, request duration missing. Docker available; exercise disposable backup/restore. Production RPO/RTO/owner/storage/alerts require operator decisions. |
| E16-09 #79 | PARTIAL | policy service and organization/artisan integration scenarios | Existing scoped organization/assisted access. Add replay reauthorization and privacy rejection tests. Commercial/download models absent. |
| E16-10 #196 | MISSING | No worker/ETL | Introduce only database-local outbox processing with bounded batches, retries, receipts and diagnostics. Commercial ETL depends on absent E13-02 and commerce schemas. |
| E16-11 #30 | PARTIAL | pnpm workspace, lockfile, scripts, migrations, CI | Foundation exists; frozen install verified. Full checks, additive schema/recovery verification and clean-checkout build still needed. No platform container packaging. |
| E16-12 #197 | BLOCKED | sibling iot README only | No board, firmware, IMU, motor or local-summary implementation. Document exact software/privacy checks and blocked physical matrix; no fabricated simulator/hardware results. |

## Cross-cutting findings

- No monetary or commercial mutation exists, so exact money primitives cannot honestly be described as integrated settlement processing.
- Individual wearable fields are absent and strict schemas reject additional fields. Existing arbitrary text fields are not a semantic sensitive-data detector; avoid copying snapshots/text into events or analytics.
- IAM uses two global advisory locks: correct serialization at foundation scale, potential throughput bottleneck at growth scale. Preserve lock order in new transactions.
- Audit and resource permissions must be rechecked before returning idempotent outcomes; session/key possession alone is insufficient.
- Existing local Compose is not production infrastructure. Real provider checks, off-site retention, alert routing, hardware behavior and complete commerce acceptance remain release risks.
- No production writes, money movement, issue status changes, pushes or deployments are authorized.


## Follow-up disposition

This document preserves the initial repository audit. The user subsequently requested completion of #32/#88/#195. The explicit commerce states/rules in the product specification were sufficient to implement a bounded synthetic vertical workflow without claiming full upstream epics. The current implementation and verified status are in E16_TARGET_STORIES_REPORT.md and the updated acceptance matrix; statements above that commerce did not yet exist describe the baseline only.
