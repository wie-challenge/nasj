# E16 execution plan

Historical initial audit/plan. The current full-epic follow-up and final dispositions are in [E16_ACCEPTANCE_MATRIX.md](e16-acceptance-matrix.md) and [E16_ENGINEERING_REPORT.md](e16-engineering-report.md). Earlier missing-commerce/ETL/simulator statements describe the starting point, not the current code.

1. Retrieve all 12 stories, parent and comments; preserve requirement snapshots. Audit foundation before edits.
2. Keep existing toolchain; verify frozen install. Add additive persistence for command outcomes, outbox and receipts.
3. Extract existing capacity and approval rules into pure shared domain functions; provide exact bounded TND primitives with boundary tests. Integrate actual rules only.
4. Integrate optional durable idempotency into self-service and assisted capacity mutations, checking current authorization even on replay. Preserve existing API callers.
5. Persist metadata-only outbox alongside existing transactional IAM audits. Deliver to an internal receipt consumer through a separate bounded worker with retries and diagnostics; no external transmission.
6. Test successful/concurrent replay, mismatched keys, rollback, revoked access, failed/recovered delivery and privacy schema rejection against disposable PostgreSQL.
7. Execute actual backup/restore on disposable data. Add request duration, operational documentation and mobile/keyboard/browser failure checks.
8. Run quality gates and final review; document exact remaining commerce/ETL/firmware/operator dependencies in acceptance, security, tests and release reports.

Release A correctness takes priority. Local issue snapshots retain release C/D metadata even though the supplied task groups this work under A/B. Full commercial state/reconciliation and firmware simulation cannot be substituted for missing upstream implementations.


## Follow-up authorized scope: finish #32, #88 and #195

The product backlog's explicit commerce state machines and relevant RFQ/offer/progress/QA/settlement rules were inspected. A bounded, synthetic-only persisted commerce module now supplies the required authoritative write paths and responsive critical journeys. Pure guards, exact millimes, consent/role/tenant checks, required scoped command keys, version conflicts and transactional audit/outbox are integrated. Domain/property-style, PostgreSQL concurrency/reconciliation and mobile/desktop/keyboard/axe/slow-browser evidence are in E16_TARGET_STORIES_REPORT.md. Original firmware/ETL/production-operation limitations remain separate. This follow-up supersedes the earlier assumption that the three stories must wait for complete upstream product epics.
