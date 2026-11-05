# Batch 12 implementation and acceptance report

28 October 2026 · Africa/Tunis. Work remains unstaged and uncommitted. No deployment, persistent migration, GitHub mutation or persistent showroom reset was performed.

## Outcome and scope

The [eight-story matrix](batch12-acceptance-matrix.md) preserves all **41 original criteria** and verified issue mappings: E18-01/#204, E18-02/#205, E18-03/#206, E10-11/#146, E10-13/#148, E10-14/#73, E16-08/#77 and E14-09/#74. Four stories have verified software criteria; contribution, accounting export and financial closure retain policy-dependent missing criteria; retention acceptance is blocked on qualified review. All owner acceptance remains PENDING. Earlier Batch 8–11 participant-comprehension evidence remains unresolved.

## Reused and extended

Existing Organization/Better Auth membership and operator assignment remain the identity and scoping authorities. Existing procurement, catalogue, paid-sample consent, ArtisanPayable, deposits, payout reports, disputes, FinanceRecordEvent, audit/outbox and replay-safe transactions remain authoritative. No second financial ledger, implicit transfer or sample agreement was introduced.

New `/api/v1/sales` endpoints manage discovery, qualification, assigned ownership, contact basis/review dates and next actions. Prospect revisions and proposal revisions are append-only. A new prospect uses the existing unapproved Organization identity without buyer membership; permitted correction cannot change approved buyer identities. Expiry/opt-out hides contact details and blocks proposal sending. Proposal revisions preserve exact sent scope and outcome evidence; won requires an assigned, submitted RFQ. Won alone creates no production commitment. The customer stage derives from existing buyer-authorized exact-quote acceptance, explicitly labelled synthetic or legally unverified.

Finance additions under `/api/v1/finance` provide order analysis, immutable attributable-cost evidence, advisory dated cash reviews, explicit-permission accounting exports, payment timeliness and recorded closure decisions. Sales-linked RFQ acceptance requires scoped finance review of the exact sustainable costed quote and documented funding plan. Such review is not bank verification. TND arithmetic uses integer millimes, including signed variance; unknown dates/coverage remain incomplete. Shared sample liabilities are disclosed in full, not silently allocated across orders.

Exports contain stable source IDs, half-open bounded periods, exact separate evidence/subledger totals, formula-safe CSV and export audit records without beneficiary/contact details. Synthetic receipts, pending requests and reported executions remain distinct from verified settlement. An accepted quote is explicitly not a tax invoice or recognized revenue. Timeliness excludes synthetic, partial, disputed, overpaid and unknown evidence from verified denominators and uses immutable contractual dates, never a report-generated due date.

Closure preserves every obligation, includes the exact bound sample, and atomically records denial/checklist/snapshot/actor/reason. Finance-backed orders cannot bypass it through legacy simulated closing. Successful close and exceptions remain disabled without approved policy; an administrative role cannot waive artisan debt.

Responsive existing-style interfaces cover `/operator/sales`, finance analysis/export/closure controls, funding review and `/admin/retention`. Contact errors, retries, keyboard labels, mobile wrapping and axe checks were exercised. The nine-class purpose inventory records ownership, access, triggers, preservation and correction/removal rules with qualified review pending; operational review cannot enable purging. Wearable data stays outside commercial storage and exports.

## Database and operations

Only `20261028140000_batch12_commercial_operations` was added: three prospect/proposal history tables, optional source annotations on existing FinanceRecordEvent, foreign keys, unique source/version keys and append-only triggers. Native disposable PostgreSQL 17.7 applied **35 migrations**, preserving **100 baseline tables** and producing **130 final public tables**. Historical migrations and financial/inventory constraints were preserved. Existing SQL-only constraint metadata drift remains reviewed output; no suggested FK removal was executed.

The existing protected backup CLI and isolated restore harness were reused. The final drill checks every table hash, financial/idempotency history and configuration recovery: 130 tables / 2,788 rows, backup 402 ms and restore/verification 2,947 ms. These are small isolated drill measurements, not production recovery guarantees. Existing wrong-key, tamper, permissions and backup failure tests remain. Structured transaction rejections retain correlation IDs while redacting private data; notification failures/ambiguity and sending-age review extend existing fixed-code alerts. [Operations runbook](../../07-operations/operational-runbooks.md) distinguishes reviewed local RPO/RTO targets from measured drills and production ownership gaps.

## Verification

Final evidence lives in [evidence/batch12](../../engineering/evidence/batch12). Full regression: **131 API unit tests, 25 web unit tests, 166 integration scenarios, 52 application browser tests and 3 showroom tests**. The latest focused API run passed 29 scenarios (including bootstrap checks), and the latest mobile/desktop run passed 2 tests, validating final Batch 12 changes separately. See [verification-summary.json](../../engineering/evidence/batch12/verification-summary.json) for exact logs. Native migration, populated upgrade, encrypted restore, transaction rollback and concurrent constraints are included in the integration harness. Lint, typecheck, production build, Prisma validation and `git diff --check` are recorded there. Earlier failed diagnostic logs are retained and are not passing evidence.

## Remaining gates and next batch

Supported actual contribution needs approved recognition definitions and complete cost/revenue evidence. Invoice reconciliation needs an approved billing source/policy. Positive financial close needs approved settlement and lawful disposition/exception rules; current software correctly denies unsupported closure. Retention periods, preservation exceptions and named incident/controller responsibilities require qualified review. Real payments, actual buyer results, hosted recoverability and legal compliance are not verified. No failing software gate or known critical defect is waived to obtain acceptance.

Owner review may assess the implemented scope now. Unconditional Batch 12 acceptance and live-pilot readiness remain blocked by these explicit gaps. Batch 13 was not started.
