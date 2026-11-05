# Batch 12 remediation regression results

28 October 2026 · Africa/Tunis. [commands.json](../../../engineering/batch12-remediation/evidence/commands.json) records each exact command, cwd, start/end UTC, exit code and full log. All nine final commands exited **0**. [Source hashes](../../../engineering/batch12-remediation/evidence/release-source-hashes.json) pin the uncommitted inputs; no captured source changed during verification (Next-generated imports are explicitly excluded).

## Executed checks

- `pnpm test:integration`: **176 passed** (166 prior + 10 permanent remediation checks); no skipped scenario path. Real authenticated requests and native PostgreSQL, not mocked money or an impossible settlement state.
- `pnpm test:e2e`: **52 application tests and 3 showroom tests passed**, zero failures/skips. Added assertions extend existing journeys rather than inflating named browser-test counts.
- `pnpm --filter @nasj/api test`: **133 passed**, zero failures/skips (131 prior + 2 units).
- `pnpm --filter @nasj/web test`: **25 passed**, zero failures/skips.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, Prisma validate from `apps/api`, `git diff --check`: pass.

Targeted evidence: **39 integration/bootstrap checks**, of which 26 are Batch 12 and 10 are new remediation checks; **4 browser tests**; **10 targeted Batch 12 units**. These overlap the full suite and are not additional unique totals. [Ten-scenario index](../../../engineering/batch12-remediation/evidence/scenarios.json), [machine summary](../../../engineering/batch12-remediation/evidence/verification-summary.json).

## Exact negative counterexamples

- `R12 closure exact pending-adjustment counterexample`: invalid legacy close returns **409**, finance close records **DENIED**, order remains SETTLED and FinancialAdjustment remains PENDING_REVIEW. No blocker fixture was removed. Repeat denial and unauthorized/policy-exception paths remain fail-closed.
- `R12 SENT proposal keeps an authorized RFQ link`: absent review, **HOLD/UNFUNDED** and **REJECT** each return **409**, with zero created orders. Current review permits one authoritative concurrent/idempotent acceptance; stale RFQ, changed costing, superseded quote and withdrawn funding deny. Historical JSON links stay gated.
- `R12 contractual dates...` and two supported-state checks: valid date/UNKNOWN pairing, immutable correction history, version/tenant denial, no agreement rewrite, scheduled/pending/failed/partial/disputed/simulated/overpayment reporting, zero verified denominator. A native attempted verified row is rejected by the existing CHECK. Arbitrary JSON payment-condition dates are ignored.

## Native migration, preservation and restore

Only `20261028150000_financial_remediation_dates` was authored for remediation; total chain **36**. Fresh native deploy, populated old-column preservation, migration checksums, rollback, concurrency/uniqueness, append-only evidence and existing finance/inventory constraints pass in the established harness. The comparator is **100 pre-Batch8 baseline tables → 131 final public tables**, including migration history; immediate pre-remediation schema had 130 tables. New date-table FKs/unique/correction checks are exercised through PostgreSQL and HTTP.

The protected encrypted backup/restore verifies **131 tables / 3,152 rows**, including **3 contractual-date rows**, configuration recovery and financial/audit/idempotency history. Measured backup **301 ms** and restore/verify **3200 ms** are disposable drill observations, not production RPO/RTO guarantees. The original twenty Batch 8–11 tables still have 65 foreign keys. Prisma-only preexisting removal suggestions remain reviewed output; no enforced SQL FK was dropped.

## Diagnostic history and limits

Targeted iterations found and corrected a review snapshot include-shape mismatch, strict JSON typing/native simulated-state fixture issues, and the new browser actor’s missing explicit date-recording permission. The first browser attempt was stopped to reload that corrected fixture; the final targeted run passed all four tests. Earlier logs are diagnostic, not final passing gates. Expected-invalid assertions were not weakened to accept bad behavior. The final complete regression was run once after these corrections.

All databases were newly created disposable harness containers. No persistent data, showroom generation, GitHub issue, deployment, staging or commit was changed. Historical engineering/audit reports remain intact. Approved settlement/recognition/invoice/exception/retention policy and genuine real-world evidence remain external gates; no test is presented as legal, financial or banking validation.
