Generated 2026-10-29T21:51:59.262417+00:00. Read-only product/backlog/GitHub audit. Owner acceptance **PENDING**.

Confirmed findings are source/runtime bounded. No P0 was found in the examined paths; unexamined paths are not certified.

## FPA-01 — P1: Dedicated AI service cannot import its configured package

Affected: #156.

- Exact locations: ../ai-backend/pyproject.toml:27; ../ai-backend/Dockerfile:18; ../ai-backend/src/hirfacare_ai/main.py:3.
- Reproduction: evidence/ai-tests.log; evidence/ai-package-import.log; run .venv/bin/python -m pytest in ai-backend.
- Expected/original scope: Configured wheel, imports, ASGI entry point and tests resolve the actual source package.
- Actual: All use nasj_ai, while only src/hirfacare_ai exists; pytest exits 4 during collection.
- Impact: Standalone AI deployment and tests are broken. Website intelligence is internal TypeScript and does not depend on this service. #156 remains unimplemented independently of this packaging defect.
- Minimal correction: Choose one package namespace and update source layout/imports/build/ASGI/tests consistently.
- Required verification: Clean package build/install; collect and run tests; start container and exercise service-authenticated health/inference previews.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-02 — P2: Production accepts non-enforcing Arcjet default

Affected: #38, #78, #87.

- Exact locations: apps/api/src/config/env.ts:58; apps/api/src/config/env.ts:104; apps/api/src/security/security.service.ts:55; apps/api/src/security/security.service.ts:147.
- Reproduction: evidence/security/security-probes.ts and security-probes-4.log; injected deny decision, no provider network.
- Expected/original scope: Production configuration enforces rate denials or fails startup.
- Actual: A valid production configuration defaults to DRY_RUN. Twelve injected denied requests pass; local limiter is not invoked. LIVE control returns 429.
- Impact: Brute-force/abuse protections may silently observe rather than enforce. Config-dependent defect, not proof of a live deployed exposure. Demo mode is prohibited in production; do not attribute this to #192 production collection.
- Minimal correction: Require LIVE for production, or enforce a local rate floor even when external decisions are observational.
- Required verification: Production startup matrix and endpoint-level 429 under accepted defaults; test explicit observational nonproduction configuration.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-03 — P2: Synthetic-ready closure assessment conflicts with native CHECK

Affected: #73.

- Exact locations: apps/api/src/modules/finance/finance.service.ts:1355; apps/api/src/modules/finance/finance.service.ts:1492; apps/api/prisma/migrations/20261027080000_financial_controls/migration.sql:113.
- Reproduction: evidence/security/security-probes.ts and security-probes-4.log; actual assess() through controlled read adapters, then native INSERT into disposable PostgreSQL.
- Expected/original scope: A returned assessment can be persisted atomically by its save route.
- Actual: Service returns SYNTHETIC_ONLY_READY; closure_blocked permits only BLOCKED/NEEDS_REVIEW; native CHECK rejects with 23514.
- Impact: Synthetic assessment save path fails. No liability erasure or live financial closure bypass demonstrated. This is a composed reproduction, not a full HTTP closure scenario.
- Minimal correction: Align persisted status vocabulary with explicitly synthetic assessment semantics using an additive migration; retain all live closure gates.
- Required verification: Full HTTP assess/save/read flow, native statuses, rollback and all liability blockers; no real payment assertions.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-04 — P2: Incomplete observed hours produce an available hourly rate

Affected: #176.

- Exact locations: apps/api/src/modules/intelligence/intelligence.service.ts:581; apps/api/src/modules/intelligence/intelligence.service.ts:616; packages/contracts/src/intelligence.ts:525.
- Reproduction: evidence/business/earnings-service-probe.ts; earnings-service-reproduction.json; controlled reads, actual earnings service.
- Expected/original scope: Missing duration for any compensation-covered work makes the full-scope hourly rate unavailable or limits both numerator and denominator to the same known scope.
- Actual: Two 50-unit records, one 60 minutes and one null, unlock full 120 TND batch compensation and return AVAILABLE at 120 TND/hour.
- Impact: Overstates effective hourly earnings; contradicts original missing-hours requirement. Synthetic probe follows OBSERVED code path, not genuine participant evidence.
- Minimal correction: Require complete, nonoverlapping, consented time coverage for full compensation, or allocate compensation to precisely matched observed scope.
- Required verification: Null/zero/overlap/partial-unit time cases at service and API; reporting UI unknown-state coverage.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-05 — P2: Passed deadlines remain merely at risk for up to one day

Affected: #152.

- Exact locations: packages/contracts/src/intelligence.ts:100; packages/contracts/src/intelligence.ts:118.
- Reproduction: evidence/business/risk-boundary-probe.ts; risk-boundary-executed.log.
- Expected/original scope: Outstanding production becomes OVERDUE immediately after the applicable deadline.
- Actual: At six hours past the timestamp, Math.ceil produces zero days and returns AT_RISK/DEADLINE_IMMINENT.
- Impact: Incorrect risk urgency and potentially delayed intervention; no unsupported ML accuracy claim is involved.
- Minimal correction: Compare timestamps for overdue; round only presentation durations.
- Required verification: Before/equal/after deadline by one millisecond, within 24 hours, approved schedule replacement and Tunis boundary cases.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-06 — P2: Reallocation never computes replacement delivery feasibility

Affected: #116.

- Exact locations: apps/api/src/modules/procurement/planning.ts:418; apps/api/src/modules/procurement/planning.ts:913; apps/api/test/planning-intelligence.scenarios.ts:808.
- Reproduction: Inspect reallocate/replacementCandidates; current integration accepts constant UNKNOWN_THROUGHPUT_NOT_RECORDED for every replacement..
- Expected/original scope: Recompute candidate delivery feasibility when adequate dated throughput/assumptions exist and explain genuinely missing inputs.
- Actual: Capacity candidates refresh, but delivery feasibility is hard-coded UNKNOWN and no dated calculation is attempted.
- Impact: Original C4 remains partial despite closed state. Safe unknown is preferable to a fabricated feasible claim, but does not fulfill recomputation. The test every() also lacks a nonempty assertion.
- Minimal correction: Connect replacements to documented deterministic feasibility inputs and preserve the evaluated snapshot/reason; retain unknown for insufficient input.
- Required verification: Known-feasible, known-infeasible, insufficient inputs, nonempty candidates and accepted-work invariants.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-07 — P2: Buyer-feedback edit after lost response traps retries

Affected: #209.

- Exact locations: apps/web/src/components/order-feedback.tsx:48; apps/web/src/components/order-feedback.tsx:147; apps/web/src/components/order-feedback.tsx:180.
- Reproduction: evidence/frontend/b13-retry-probe.ts; b13-retry-results.json and four screenshots. Chromium at 390/1280px with real current app/disposable DB; route.fetch commits then route.abort loses response; edit and retry twice..
- Expected/original scope: Retry the original immutable request/key to recover the committed result before sending edited intent.
- Actual: Create and correction both reuse the original key with edited bodies and repeatedly return 409 IDEMPOTENCY_CONFLICT. One original row/version survives.
- Impact: Recoverability defect, not duplicate writes or authorization bypass. Existing browser test aborts before commit and retries unchanged, missing this case. Batch 14 has separate passing recovery tests.
- Minimal correction: Retain immutable submitted payload with its key; recover it, refresh authoritative state/version, then allow fresh edited intent.
- Required verification: Both operations at both widths; committed/uncommitted response loss, editing, repeated retry, reload and accessibility announcements.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-08 — P2: Collaboration creation workflows are disconnected from UI

Affected: #112, #121, #122.

- Exact locations: apps/web/src/components/collaboration-workspace.tsx:102; apps/web/src/components/collaboration-workspace.tsx:177; apps/web/src/components/collaboration-workspace.tsx:254; apps/api/src/modules/collaboration/collaboration.controller.ts:68.
- Reproduction: Full web-source endpoint search: UI operates existing exception/revision/counteroffer records but never calls their three creation endpoints. Browser fixture seeds an exception via API..
- Expected/original scope: Authorized users can initiate counteroffers, exceptions and schedule changes through the product, including implications before consent.
- Actual: Backend creation exists; UI only lists/reviews existing records. Counteroffer display shows quantity/date but no resulting pay/effort/material preview.
- Impact: Important workflows depend on API/fixture intervention; happy review tests overstate end-to-end completeness.
- Minimal correction: Add scoped creation and preview flows, preserving downstream approval authority and original terms.
- Required verification: Start from empty state without direct API seeding for the action under test; valid, denied, stale and declined-change browser cases.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-09 — P2: Preferred-language offer decisions are not implemented

Affected: #44.

- Exact locations: apps/web/src/components/commerce-workspace.tsx:854; apps/web/src/components/artisan-workspace.tsx:153; tests/e2e/production.spec.ts:97.
- Reproduction: Select supported French/Arabic profile preference and inspect offer review/actions; current UI explicitly states reviewed translation unavailable..
- Expected/original scope: Offer accept/decline/clarification is available in supported preferred language.
- Actual: English terms/actions remain, with a truthful missing-translation notice. Existing browser test asserts that notice rather than fulfillment.
- Impact: Original C4 incomplete; informed decision/accessibility usability gap, not a false translation claim.
- Minimal correction: Provide reviewed translations for offer terms and decisions with safe fallback and explicit unavailable-state handling.
- Required verification: French/Arabic preferred-language complete decision and clarification flows, RTL, keyboard and screen-reader checks.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

## FPA-10 — LOW: Database does not independently bind status header to latest history

Affected: #192.

- Exact locations: apps/api/prisma/migrations/20261028170000_demo_feedback/migration.sql:69; apps/api/src/modules/demo/demo-feedback.admin.ts:125.
- Reproduction: Inspect native content/terminal/append-only triggers and transaction. No deferred cross-table consistency constraint exists..
- Expected/original scope: Direct DB writes that change header status require corresponding attributable valid transition history.
- Actual: Application updates header, history and audit in one transaction; privileged direct SQL can change an open header without a matching event.
- Impact: Defence in depth only; no HTTP path for unauthorized changes demonstrated. Existing Batch14 LOW observation retained.
- Minimal correction: Consider a deferred invariant or controlled database write function; preserve migration history.
- Required verification: Native mismatch must reject at commit; valid transactional updates and rollback remain supported.
- Dependencies: Owner-authorized remediation; no product change made by this audit.

Additional boundaries: showroom stores visitor token hashes, uses HMAC proof plus origin, scopes generation/ownership, denies six personas including genuine SUPPORT, and rechecks ADMIN authority inside IAM transactions. Reset archives feedback; authenticated original visitors may read their own archived submissions by design, while other/expired visitors cannot. Raw token storage was not found in the reviewed paths. Idempotency is not a grant of authority. Dedicated feedback rate defaults are 8/300 seconds; tight 2/300 test override proves the guard, not the production default value. Existing independent remediation adversarial evidence is preserved; this fresh regression uses the final working tree.

B13 BuyerOrderFeedback remains a separate model/service from B14 DemoFeedback. SupportTicket/SupportCase, ledger and contractual state are not written by B14 feedback; regression checks state hashes and rollback. This is not certification of all Support/finance behavior. #73 remains held for financial/legal authority and genuine settlement; the synthetic CHECK mismatch does not relax that gate. #74 has null retention duration and PENDING_QUALIFIED_POLICY_REVIEW. No approval to collect genuine participant feedback, publish testimonials or enable a real pilot is established.

QA gaps: test names/counts cannot replace requirements. Reallocation explicitly expects UNKNOWN and uses potentially vacuous every(); offer browser test expects translation unavailable; B13 retry test previously loses the request before commit; genuine forecast validation cannot be proven by synthetic data merely labeled OBSERVED in a test fixture. All are reflected in bounded verdicts rather than a blanket failure of unaffected criteria.
