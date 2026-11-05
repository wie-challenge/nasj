# Integration test results — Batches 8–11

28 October 2026. All database execution used disposable native PostgreSQL 17.7 containers. No persistent database was migrated.

## Executed verification

- `pnpm test:integration`: **150 scenarios passed** through the existing authenticated HTTP harness, real transactions, permissions, CSRF and local SMTP capture. [Complete output](../../../engineering/batch8-11-completion/evidence/integration-release.log).
- API unit suite: **123 passed**, no failures or skipped tests. [Output](../../../engineering/batch8-11-completion/evidence/api-unit-release.log).
- Web unit suite: **25 passed**, no failures or skipped tests. [Output](../../../engineering/batch8-11-completion/evidence/web-unit-release.log).
- `pnpm test:e2e`: **50 application tests and 3 showroom tests passed**. [Output](../../../engineering/batch8-11-completion/evidence/browser-release.log).
- Separate showroom verification: **3 passed**. [Output](../../../engineering/batch8-11-completion/evidence/browser-demo-final.log).
- Native migration verification: **5 checks passed**, 34 migrations, 100 baseline tables preserved and 127 final public tables, including migration history. The original twenty Batch 8–11 tables have 65 foreign keys after completion. [Output](../../../engineering/batch8-11-completion/evidence/migrations-native-final.log).
- Populated upgrade and encrypted backup/restore checks passed. [Output](../../../engineering/batch8-11-completion/evidence/upgrade-restore.log). Full integration also exercises the final schema and restore path.
- Type checking, lint, Prisma validation, production build and whitespace verification are recorded separately in the evidence directory and verification summary.

The [scenario coverage index](../../../engineering/batch8-11-completion/evidence/scenario-coverage.json) maps the brief's **50 workflow scenarios and 18 negative security cases** to executed assertions. These are requirement mappings within the existing 150 integration scenarios; they are not 68 additional independent tests. Some requirements intentionally share a complete business journey.

## Covered behavior

Counteroffer review creates a replacement offer and requires the artisan's exact explicit acceptance. Concurrent acceptance creates one batch; stale terms, insufficient capacity and expired offers fail without partial writes. Schedule changes require independently authorized buyer and artisan consent, and stale changes cannot silently alter deadlines.

Buyer-approved catalogue binding creates an append-only procurement projection. Instructions and inspection use that pinned projection. Paid sample work requires exact compensation terms and personal acceptance; completion recognizes one existing artisan payable, which survives buyer rejection without claiming payment.

Planning exercises hard constraints, weights, review, human override history, material uncertainty, issuance, reallocation and authorized pricing handoff. Intelligence exercises immutable forecasts, voluntary time and correction provenance, earnings coverage, scoped analytics, sparse-cohort suppression, month boundaries, fairness populations, alerts and reviewed reporting policy.

Collaboration exercises scoped discussions, exceptions, future pauses, coordinator access revocation, aggregate capacity, optional support explanations, ticket evidence, privacy and correction handling. Notification tests use local SMTP only: preflight failure, explicit retry, concurrent workers, opt-out, ambiguous acknowledgement and interrupted sends preserve truthful delivery states without blind duplicate sends.

## Limits

Passing software checks does not demonstrate real participant comprehension, real production quality, actual payment, income improvement or forecast accuracy. E19-01 criterion 5 remains blocked on consenting participant sessions. Owner acceptance remains pending for all 33 stories. Diagnostic logs from earlier failed runs remain preserved; the release logs above are the final verification authority.
