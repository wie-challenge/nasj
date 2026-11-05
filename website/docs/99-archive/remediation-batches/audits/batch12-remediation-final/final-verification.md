# Batch 12 final independent remediation verification

**Decision: READY_FOR_BATCH13_PLANNING**

28 October 2026 · Africa/Tunis. A12-01 and A12-02 are independently resolved within the tested scope. A12-03 safely prepares contractual evidence/reporting while verified-positive settlement remains disabled. No remaining bypass was reproduced. This permits planning, not production deployment, complete Batch 12 acceptance or Batch 13 implementation.

## Independent results

Fresh disposable PostgreSQL/real HTTP verification passed **54 checks**: 39 existing integration/bootstrap checks, six additional independent probes and eight paid-sample/release checks, plus one encrypted restore. The six probes include four separately exercised pipeline stages. Fresh API/web unit runs passed **133/25**; four relevant browser journeys passed. No final command was blocked, failed or skipped. [Commands/results](../../../../engineering/audits/batch12-remediation-final/evidence/summary.json), [HTTP/native log](../../../../engineering/audits/batch12-remediation-final/evidence/focused-final.log), [browser log](../../../../engineering/audits/batch12-remediation-final/evidence/browser.log).

**A12-01:** the exact pending-adjustment legacy close returned **409 FINANCIAL_CLOSURE_REQUIRED**; the order stayed SETTLED and its liability stayed PENDING_REVIEW. Finance closure with incomplete material disposition recorded **DENIED**, preserving the order and stock state. Outstanding payables, exact linked sample obligations, open disputes, partial/unknown buyer receivables, concurrent adjustment/close and repeated requests denied invalid closure. Unauthorized legacy/finance requests returned **403/404**. A source-free synthetic historical order still closed/replayed **201**, without an authoritative payable or verified-payment claim.

Every close-capable transition uses `FinanceService.assess`; managed legacy transitions remain prohibited and finance closure cannot invent an exception. The assessment reuses its supplied transaction. Writers acquire the existing fixed locks **724631902 → 724631903** in the same order; no nested assessment transaction or deadlock was observed in the races.

**A12-02:** linked **DRAFT, SENT, WON and LOST** cases each returned **409**, with zero accepted orders when review was absent. An isolated historical JSON-only link had **zero relational proposal links** and denied both missing review and HOLD/UNFUNDED. REJECT, superseded quote, changed costing/RFQ assumptions and withdrawn funding also denied. Current exact approval allowed acceptance; different-key concurrent requests returned **201/409**, creating one order. Successful-key replay returned **201** with the same order. Multiple revisions and both WON orderings preserved the gate. [Persisted independent results](../../../../engineering/audits/batch12-remediation-final/evidence/persisted-results.json).

**A12-03:** native terms-hash binding, unchanged accepted terms, append-only corrections, version/unique constraints and known/unknown dates passed. Cross-organization date writes returned **404**. Pending, failed, partial, disputed, simulated and overpayment reports stayed outside verified denominators; arbitrary payment-text dates were ignored. The native `execution_unverified` CHECK remains intact and rejects fabricated verified records. No verified-positive payment was manufactured.

## Baseline and preservation

All **872 pinned remediation inputs** match current files. The timestamped full-run manifest/logs reconcile **176 integration scenarios, 52 application browsers, 3 showroom tests, 36 migrations and 131 tables**. That unchanged full regression was not unnecessarily rerun; independent focused runs establish the repaired boundaries. [Baseline manifest](../../../../engineering/batch12-remediation/evidence/commands.json).

Fresh migration checks verified all **36 SQL checksums** and **131 tables**. Encrypted restore compared every table’s content, including **699 rows / four contractual-date records**; the different row count reflects this smaller audit fixture. No product/previous-report contents, index, persistent database or GitHub state changed. Next-generated imports were restored to their hash-verified baseline.

## Acceptance limits

**E18-03/#206, E10-13/#148 and E10-14/#73 remain PARTIALLY_IMPLEMENTED; owner acceptance remains PENDING.** Actual revenue/cost recognition, invoice policy, verified settlement authority, lawful positive financial closure, retention/legal approval and E19-01 participant comprehension remain separate gates. No production readiness or policy-dependent criterion is declared complete. Batch 13 was not started.
