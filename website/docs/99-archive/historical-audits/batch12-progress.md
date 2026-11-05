# Batch 12 progress

28 October 2026. Working tree began with 98 changed/untracked paths from earlier batches; preserve them. No staging, commits, deployment, persistent migrations or GitHub writes. E19-01 participant evidence remains open.

## Initial audit (before implementation)

| Story | GitHub issue | Existing functionality | Missing criteria | Planned changes |
|---|---|---|---|---|
| E18-01 | #204 | Organization identity, membership, buyer relationship permission | Prospect stages, consented contacts, follow-up history | Scoped prospect record referencing existing organizations, versioned snapshots |
| E18-02 | #205 | Catalogue revisions, paid sample authority, RFQs | Commercial proposal versions and win/loss evidence | Append-only proposals; scoped RFQ conversion, no production commitment |
| E18-03 | #206 | Accepted quote, cost estimate, payable/deposit/payout events | Supported actual costs, dated cash model, review | Extend existing finance event annotations and exact projections |
| E10-11 | #146 | Financial source records and authorization | Reconciled period export | Audited CSV, source IDs, evidence groups and injection protection |
| E10-13 | #148 | Simulation due dates and reported executions | Verified denominator and unknown handling | Contract-source dates only, pure metric plus scoped report |
| E10-14 | #73 | Conservative closure assessment; managed-order transition blocked | Detailed linked sample obligations, explicit enforcement and policy exception handling | Preserve liabilities, atomic closure decision, no unapproved waiver |
| E16-08 | #77 | Protected backup CLI, native restore drill, health/log/alert tests | Delivery retry visibility, current drill evidence | Extend existing alerts; rerun existing isolated recovery checks |
| E14-09 | #74 | Privacy requests, revocation, draft inventory | Current full inventory and review representation | Purpose inventory, pending retention policy, no destructive purge |

## Decisions

- Reuse Organization as buyer identity; a prospect is a relationship, never verified buyer enrollment.
- Commercial proposals never create sample commitments or payables. Won requires authorized RFQ evidence.
- Keep one ledger. Record attributable cost evidence as immutable existing FinanceRecordEvent annotations.
- No approved live bank/tax/closure-exception policy exists. Preserve evidence limitations; do not fabricate verification or legal approval.

## Next

Implement Phase A deltas, then financial controls, operational/privacy deltas, targeted tests and one complete regression. Evidence goes in docs/engineering/evidence/batch12/.

## Implementation checkpoint

Implemented additive migration `20261028140000_batch12_commercial_operations`: three relationship/history tables and optional source annotations on existing FinanceRecordEvent. Sales, proposal versioning, explicit RFQ linkage, exact-quote funding review, costs/cash model, grouped CSV, verified-denominator metrics, guarded closure decision and retention inventory are wired to existing authentication/authorization/audit/idempotency. Finance obligation authority is unchanged. No exception policy or bank verification was invented. Added notification failure/stall alerts and broader log redaction.

Targeted HTTP: 14 new scenarios passed (27 including existing bootstrap checks); mobile and desktop Batch12 journeys both passed with axe after correcting long-code wrapping. API units: 131 passed; web units: 25 passed. First full integration: 164 passed, including native migration, populated upgrade and encrypted restore. Subsequent final changes strengthen legacy-close denial, unverified organization-name correction and privacy redaction; rerun the affected/full checks before final claims. Next: final regression/browser/build, validate exact evidence totals and produce the two acceptance documents.

## Final checkpoint

Completed the authorized software work and evidence package. Final full regression: 166 integration scenarios; 52 application browser tests plus 3 showroom tests; 131 API and 25 web unit tests. Latest focused runs: 29 authenticated integration/bootstrap scenarios and 2 mobile/desktop journeys, including won proposals traced to existing buyer-authorized acceptance. Lint (410 files, no findings), type checking, production build, Prisma validation and whitespace checks passed. Native PostgreSQL 17.7 applied 35 migrations, preserved 100 baseline tables and ended with 130 tables. Encrypted restore verified 130 tables / 2,788 rows. Logs and exact results: evidence/batch12/verification-summary.json.

Required documents: BATCH12_IMPLEMENTATION.md and BATCH12_ACCEPTANCE_MATRIX.md. Matrix: four verified software stories, three partially implemented financial stories, one retention story blocked on qualified review. All eight owner acceptances are PENDING. No policy-dependent actual contribution, invoice mapping, successful financial close or destructive retention capability is claimed complete. No persistent DB, deployment, GitHub state, staging or commit was changed. Batch 13 is unstarted.

Resume only from the documented policy/evidence gates or a new owner instruction; no further implementation/test action remains pending in this execution.
