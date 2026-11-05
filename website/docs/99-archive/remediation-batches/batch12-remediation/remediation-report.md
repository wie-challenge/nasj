# Batch 12 financial remediation

28 October 2026 · Africa/Tunis. **A12-01 and A12-02 are repaired and their exact counterexamples now deny. A12-03 has safe due-date/state-reporting preparation; verified-positive settlement remains unavailable and E10-13 remains PARTIAL.** All work is uncommitted and unstaged. Historical reports/audit evidence were preserved; no persistent migration, deployment, GitHub mutation, real transfer or new feature batch occurred.

## A12-01 — one closure authority

The legacy CLOSED guard used an incomplete list of tables and optional FinanceRecordEvent.orderId annotations. `CommerceService.orderAction` now invokes `FinanceService.assess` inside the existing IAM transaction. The same assessment serves financial readiness and persisted finance closure decisions. It follows real relationships from the order/RFQ, acceptance, batches, linked sample/payable sources, deposits, requests/executions, adjustments, disputes and material records, including older target-ID finance events. It adds explicit unknown/unreconciled buyer receivable reasons.

A source-free historical synthetic state machine remains available only when no authoritative finance/inventory/sample/logistics source exists; its existing quantity, simulated settlement and disposition rules are checked by the same assessment. This is not verified financial closure. Managed/ledger-backed closure still fails closed without approved policy. Explicit finance exceptions remain denied and cannot erase debt.

IAM advisory locks serialize closure with existing adjustment/financial writers. Financial writes refuse a CLOSED order without a reviewed reopening policy, so concurrent requests cannot add an accepted adjustment after a source-free synthetic close. Permission checks precede that status disclosure. Existing idempotency, scoped authority and actor/reason/snapshot audit behavior remain.

**Before:** 201/CLOSED with PENDING_REVIEW adjustment. **After:** 409/FINANCIAL_CLOSURE_REQUIRED; order stays SETTLED and adjustment stays pending. The finance endpoint records DENIED rather than approving an exception. New permanent checks also cover stock readiness, outstanding payable, dispute, partial buyer evidence, repeated denial and concurrency; existing sample tests preserve exact linked sample liabilities.

## A12-02 — review before commitment, independent of WON

Authorized RFQ links now persist in every proposal revision at DRAFT/SENT/WON; later revisions inherit a link rather than silently dropping it, and changing RFQ requires a separate proposal. Old JSON-only links are read through an explicit matching-buyer/operator compatibility predicate, preserving append-only history rather than updating old rows.

The documented applicability boundary is **an explicitly linked sales RFQ at any historical stage, or an RFQ with an explicit finance-review record**. Unrelated historical procurement has no new blanket gate. A salesperson cannot disable a gate by recording LOST, omitting a reference or delaying WON.

The latest ordered finance review must approve DOCUMENTED_PLAN and bind the exact RFQ version/terms, quote revision/expiry/snapshot, current cost and feasibility evidence, plus funding status/evidence. A shared canonical hash helper prevents Prisma include-shape differences and preserves exact millimes. Append-only review versions order decisions independently of transaction-start timestamps. Missing, HOLD/UNFUNDED, REJECT, changed assumptions/cost/quote or withdrawn funding deny acceptance. Newer costing requires a fresh costed quote and review. No approval implies bank verification.

**Before:** 201 with no review or with explicit HOLD/UNFUNDED. **After:** 409/FINANCE_REVIEW_REQUIRED in both cases. Current approved evidence still permits one idempotent authoritative acceptance, whether WON is recorded before or after it; no sample commitment, payable or artisan acceptance is created by the proposal.

## A12-03 — explicit contractual evidence, honest operational states

Additive migration `20261028150000_financial_remediation_dates` introduces **ContractualDueDate**, an evidence/history table linked to the existing ArtisanPayable ledger. It records an exact date or explicit UNKNOWN, source evidence, actor/reason, version/correction chain, originating offer/sample reference, exact immutable payable-terms SHA version and offer version at recording. It never rewrites accepted terms or changes amounts. Unique versions, FKs, known/unknown checks, same-payable predecessor checks and append-only triggers protect history.

`GET/POST /api/v1/finance/orders/:id/contractual-dates` applies existing assigned finance/reconciliation authorization and exact order/sample-payable scope. Corrections append a new record. The report no longer parses arbitrary payment-condition text for dates. The finance UI records/reads evidence history and shows its source/version and unverified status.

Timeliness separately exposes request and execution statuses, scheduled/initiation/pending/failure states where represented, dispute, partial unverified reports, overpayment review, simulations and unknowns. Reported amounts are not paid amounts; denominator exclusions and the unavailable-verification boundary are explicit. **The native execution_unverified constraint is unchanged.** No reviewed bank/provider/manual verification authority exists, so no verified-positive DB row or real payment is fabricated. Pure positive-case arithmetic remains a model test, not service acceptance evidence.

## Verification and disposition

Final results: **133 API units, 25 web units, 176 HTTP/native integration scenarios, 52 application browser tests and 3 showroom tests passed**. Ten new permanent HTTP scenarios and two new units extend the existing harness. Four targeted browser journeys passed, including actual due-date evidence entry, partial-report display, HOLD submission and mobile/desktop regression. [Executed commands and migration/restore detail](regression-results.md).

Native PostgreSQL 17.7 applied **36 migrations / 131 public tables**. The restore drill now runs after Batch 12 scenarios so the archive includes **3 populated contractual-date history rows**; all 131 tables / 3,152 rows and source hashes restored. Old migrations/constraints were preserved. No new package or parallel ledger was introduced.

[Updated matrix](updated-acceptance-matrix.md): **3 verified, 4 partial, 1 blocked external review; all owner acceptance PENDING**. Actual contribution, invoice reconciliation, verified settlement, lawful positive close and retention approval remain separate evidence/policy gates. Another independent review of the repaired financial boundaries is recommended before Batch 12 acceptance and Batch 13 implementation. Batch 13 remains unstarted.
