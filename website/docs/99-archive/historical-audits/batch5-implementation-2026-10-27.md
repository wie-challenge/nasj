# Batch 5 — Inventory, custody and financial controls

Engineering report, 27 October 2026. Application repository: `website/`. Work extends the pre-existing uncommitted implementation. No GitHub issues were closed, no live transfers were initiated, no physical stock was independently verified, and no persistent database was migrated.

## A. Backlog coverage

Issue numbers, acceptance criteria and direct prerequisites were verified against live GitHub through authenticated read-only CLI access. The connector returned 404; CLI access succeeded. The full source snapshot is `evidence/batch5-20261027/github-issues.json`. All eleven target issues remain **OPEN / Proposed**. Software verification below does not substitute for owner acceptance.

- **E07-02 — [#68](https://github.com/wie-challenge/website/issues/68).** Gate: #39, CLOSED / Done. Implemented: exact quantities/units, material and supplier identity, receipt date/location, scoped recording, receipt deduplication, append-only movements and conserved stock buckets. Evidence: inventory contracts/service, migration 070000, inventory unit/HTTP scenarios and browser material journey. Unimplemented: independent physical receipt verification and approved warehouse acceptance policy. **Partially Implemented.**
- **E07-03 — [#69](https://github.com/wie-challenge/website/issues/69).** Gates: #51 CLOSED / Done; #68 OPEN / Proposed. Implemented: requirement-bound reservations for approved orders and accepted batches, compatible units, atomic availability checks, concurrent exclusion, replay-safe release, distinct issue/consumption and replacement reservation after documented shortage. Evidence: inventory reservation and replacement HTTP scenarios. Unimplemented: acceptance with verified physical lots; upstream #68 acceptance. **Implemented — Unverified** for the complete synthetic reservation workflow; live use remains gated.
- **E07-04 — [#70](https://github.com/wie-challenge/website/issues/70).** Gate: #69 OPEN / Proposed. Implemented: lot/batch/destination/sender/recipient/quantity/time, reservation decrement, pending receiver acknowledgement, direct acknowledgement and separate assisted reports, custody and discrepancy history. Evidence: inventory HTTP/browser custody journeys. Unimplemented: independently verified real custody; approved assisted confirmation evidence. **Partially Implemented.**
- **E07-05 — [#127](https://github.com/wie-challenge/website/issues/127).** Gate: #70 OPEN / Proposed. Implemented: expected-versus-received display, short/damaged receipt, preserved actual and expected quantities, scoped coordinator reporting, explicit reconciliation reason/history, production blockers and replacement acknowledgement. Evidence: shortage/replacement/authorization scenarios and artisan materials screen. Unimplemented: independent accountless confirmation and later-defect case handling beyond the current receipt/return workflow. **Partially Implemented.**
- **E07-06 — [#71](https://github.com/wie-challenge/website/issues/71).** Gates: #68 and #70 OPEN / Proposed. Implemented: return condition/custody/reason/evidence, quarantine, authorized disposition, damaged segregation, consumption bounds and replay protection. Original history is retained and no artisan pay is deducted. Evidence: return/restock-denial/consumed-stock HTTP scenarios. Unimplemented: approved stock valuation and cost attribution, live inspection policy, irreversible waste accounting beyond unavailable damage/loss segregation. **Partially Implemented.**
- **E10-05 — [#66](https://github.com/wie-challenge/website/issues/66).** Gates: #41 and #65 OPEN / Proposed. Implemented: claimed receipt amount separated from expected quotation amount, TND/date/reference/evidence, normalized duplicate reference denial, partial/overpayment classification, independent review, audited corrections and pending verification. Evidence: finance unit/HTTP/browser scenarios. Unimplemented: bank evidence authority, actual reconciliation/funding release, unmatched-receipt intake and approved invoice/credit policy. **Partially Implemented.**
- **E10-07 — [#62](https://github.com/wie-challenge/website/issues/62).** Gates: #61 and #39 CLOSED / Done. Implemented: payable-bound requests, outstanding reservation limits, independent maker/checker for every amount under conservative policy v1, current explicit scope, stale snapshot checks, dispute holds, concurrent exclusion and approval history. Evidence: revoked/suspended/self/duplicate/excessive/stale approval scenarios; independent browser checker. Unimplemented: owner-approved live thresholds and operating policy. **Implemented — Unverified.**
- **E10-08 — [#63](https://github.com/wie-challenge/website/issues/63).** Gates: #61 CLOSED / Done; #62 OPEN / Proposed. Implemented: independent approval prerequisite, failed execution attempts and retries, partial manually reported execution, reference deduplication, immutable execution evidence, verification-pending accounting; verified paid remains zero. Evidence: HTTP failure/retry/partial/forged-verification tests and browser execution report. Unimplemented: approved manual bank verification or provider integration, actual settled partial payments and verified receipt reconciliation. **Partially Implemented.**
- **E10-09 — [#145](https://github.com/wie-challenge/website/issues/145).** Gates: #143 and #61 CLOSED / Done. Implemented: own authenticated claim against batch/payable, evidence, handler, seven-day response target, finance queue escalation marker, review/proposal/history, claimant acceptance/closure, preserved obligations and payout holds. Evidence: HTTP and browser dispute lifecycle. Unimplemented: approved accountless assisted reporting, operational response SLA/notifications, verified financial correction evidence. **Partially Implemented.**
- **E10-10 — [#72](https://github.com/wie-challenge/website/issues/72).** Gates: #67 and #71 OPEN / Proposed; #61 CLOSED / Done. Implemented: separate reviewed settlement proposals with direction/evidence/reasons, immutable snapshot of terms, work, quality, delivery, material custody, payments and disputes; independent review ends at approved-pending-policy, never erases payables or imposes rework. Evidence: adjustment maker/checker and liability-preservation tests. Unimplemented: cancellation transition #67, approved entitlement/valuation/refund policy, effective negotiated deductions or actual refund execution. **Partially Implemented.**
- **E10-14 — [#73](https://github.com/wie-challenge/website/issues/73).** Gates: #60 CLOSED / Done; #63, #66 and #72 OPEN / Proposed. Implemented: scoped closure assessment, explicit delivery/bank/payable/payout/dispute/material/adjustment/tax blockers, immutable checklist/ledger snapshot with actor/time; legacy managed-order settlement/closure bypass denied. Evidence: finance closure HTTP/browser assertions and legacy route denial. Unimplemented: lawful actual closure transition, verified evidence and authorized exception policy. No exception or successful closure is fabricated. **Partially Implemented.**

## B. Working journeys

Internal operators use `/operator/inventory` to select their approved internal stock organization, record labeled lots, reserve against an existing released requirement, issue a handover, inspect custody history, reconcile recorded shortages, quarantine returns, authorize disposition and record consumption. Production requirements remain separate from stock. A reported shortage blocks start/progress; replacement stock is a new reservation/handover/acknowledgement rather than a correction of the old receipt.

Association coordinators use `/association/materials` to see only currently assigned recipients and record PHONE/IN_PERSON receipt reports. These remain pending independent verification. Revocation removes access immediately. Coordinators cannot impersonate a direct artisan acknowledgement or settle a financial claim.

Authenticated artisans use `/artisan/materials` for expected supplies, direct acknowledgement and shortage/damage reporting. `/artisan/compensation` keeps agreed, earned, payable and verified-paid amounts separate, displays execution reports as unverified, and supports own disputes and acceptance/closure of a proposed response. A closed dispute never erases its payable.

Buyer representatives retain their existing quotation/delivery-confirmation journey. The finance order response exposes their own expected/claimed deposit information while withholding artisan obligations and internal costs. Operator delivery reports are not buyer acceptance. Buyer-accepted pieces update the procurement delivered projection transactionally.

Financial reviewers use `/operator/finance` or the connected procurement finance panel. Explicit scoped grants enable deposit review, payout request, independent approval, manual execution reporting, dispute response, settlement proposals and persisted closure assessment. Approval alone is not a transfer. Every available execution path stays unverified. The closure panel explains blockers and offers a working assessment action, without a fake “close” button.

## C. Files changed

Batch 5 changes are layered over the pre-existing dirty tree. The initial file inventory is retained separately; this report does not attribute all repository differences to this batch.

- Contracts: `packages/contracts/src/inventory.ts`, `finance.ts`, `permissions.ts`, `foundation.ts`, and exports in `index.ts`.
- Backend: new `apps/api/src/modules/inventory/` and `modules/finance/`; registration in `app.module.ts`; existing procurement `execution.ts`, `logistics.ts`, `logistics.controller.ts`; commerce `commerce.service.ts` for managed closure bypass; registry explicit-grant provisioning.
- Frontend: `inventory-workspace.tsx`, `finance-workspace.tsx`, operator inventory/finance pages, association/artisan materials pages, artisan compensation integration, procurement panel, navigation and route allowlist.
- Database: Prisma schema and additive `20261027070000_inventory_controls`, `20261027080000_financial_controls` migrations.
- Tests: inventory/finance unit and HTTP scenarios, `batch5-upgrade.scenarios.ts`, execution regression extensions, synthetic browser fixture, real `tests/e2e/batch5.spec.ts`, integration/browser harness wiring.
- Documentation: this report; `BATCH5_AUDIT_2026-10-27.md`; `batch5-inventory.md`; API notes; foundation tracker; raw verification evidence.

## D. Database migrations

The six existing 27 October migrations retain their initial hashes. The complete migration chain is exercised on disposable PostgreSQL only. `20261027070000_inventory_controls` adds MaterialLot, InventoryMovement, MaterialReservation, MaterialHandover, MaterialReceipt, MaterialReturn, MaterialReconciliation and MaterialReadiness. MaterialReadiness is an operational projection; the original BatchMaterialRequirement and release snapshot stay immutable.

`20261027080000_financial_controls` adds BuyerDepositRecord, PayoutRequest, PayoutExecutionRecord, PaymentDispute, FinancialAdjustment, FinanceRecordEvent and OrderClosureAssessment. It backfills delivered only for procurement-managed orders from buyer-accepted confirmation quantities, without changing historical states or legacy commerce totals.

Constraints protect nonnegative conserved inventory, recognized units/provenance, custody balances, once-only receipt/reconciliation, return condition/disposition, positive TND amounts, maker/checker distinction, supported unverified states and unique reported references. Append-only triggers protect movements, original receipts/reconciliations, execution evidence, financial history and closure assessments. The populated upgrade scenario preserves users, sessions, accepted work, immutable payables and a nonzero legacy delivered sentinel.

Migration outcomes and exact command results are recorded under H. No persistent development or production migration was applied during this task. Their current live deployment status was not queried; operators must check status and review deployment separately.

## E. API contracts

Existing global authentication, privileged MFA, CSRF, origin checks, strict Zod validation, safe errors and audit attribution apply. POST commands require `Idempotency-Key`, scoped authorization and IAM transactions before replay.

Inventory prefix `/api/v1/inventory`:

- GET `organizations/:id`: `inventory.stock.read`.
- GET `my-handovers`: authenticated artisan ownership or assigned coordinator receipt authority.
- POST `organizations/:id/lots`: `inventory.stock.register`, internal organization.
- POST `lots/:id/reservations`, `reservations/:id/release`: `inventory.stock.reserve`, matching operator organization and current buyer assignment.
- POST `reservations/:id/handovers`: `inventory.stock.handover`, current order/recipient management scope.
- POST `handovers/:id/receipts`: own artisan or `inventory.stock.receive` with current coordinator assignment/management.
- POST `handovers/:id/reconcile`, `handovers/:id/returns`, `handovers/:id/consumption`, `returns/:id/disposition`: `inventory.stock.adjust` with resource scope.

Finance prefix `/api/v1/finance`:

- GET `orders/:id`: assigned scoped finance reader; buyer receives a restricted own-order projection.
- GET `my-statement`: authenticated artisan's own batches and claims.
- POST `orders/:id/deposits`: `finance.deposit.record`.
- POST `deposits/:id/review`: `finance.deposit.review`, independent reviewer.
- POST `orders/:id/payouts`: `finance.payout.request`.
- POST `payouts/:id/approve`: `finance.payout.approve`, distinct maker/checker and current eligibility.
- POST `payouts/:id/executions`: `finance.payout.execute`, approved unchanged payable, no unresolved claim.
- POST `orders/:id/disputes`: authenticated owner of the batch artisan profile.
- POST `disputes/:id/review`: `finance.dispute.manage` for handler actions; claimant ownership for accepting/closing a resolution.
- POST `orders/:id/adjustments`: `finance.adjustment.propose`.
- POST `adjustments/:id/approve`: `finance.adjustment.approve`, independent checker; remains pending compensation policy.
- GET `orders/:id/closure`: assigned finance read scope.
- POST `orders/:id/closure`: `finance.closure.assess`; stores an assessment, never a successful payment or closure.

Repaired existing POST `/api/v1/procurement/orders/:id/payables/reconcile`: `finance.payable.reconcile`, current internal organization and buyer assignment. `finance.payout.read` retains scoped read access and cannot mutate. Existing admin grant provisioning accepts the new granular grants; ADMIN itself does not confer them.

## F. Financial and inventory invariants

Inventory uses bigint thousandths, serialized as integer strings. METERS supports thousandths; PIECES/UNITS require whole units. Received = available + reserved + issued + consumed + damaged/loss + quarantine. Cumulative returned is history, not an additional stock bucket. Reservation moves available to reserved, handover moves reserved to issued, consumption moves issued to consumed, and a return moves the corresponding issued/damaged balance to quarantine. Only authorized UNUSED disposition restores availability. Releasing a reservation restores only unissued stock.

Replacement eligibility subtracts active reservations, in-transit stock and net usable acknowledged receipts from the requirement. Receipt history is immutable. A shortage reconciliation separately segregates loss, and replacement material receives its own custody chain. Any contributing pending-verification lot keeps readiness pending even when other receipts are synthetic. An assisted report never becomes direct receipt.

TND uses existing bigint millimes and three-decimal formatting. Deposit coverage compares claimed—not verified—amount with the accepted quotation. Duplicate references are normalized and rejected. Claimed coverage does not unlock funding. Payout requests reserve eligible payable amount so concurrent requests cannot exceed it. Execution reports reserve portions of the approved request; failed attempts do not reduce verified liability. Verified paid remains `0.000`, independently of simulations or manual reports.

Approval policy v1 requires independent approval for all positive amounts, snapshots the payable amount and rechecks it on approval/execution. Current membership/grants and buyer assignment are checked before idempotency replay. Open claims hold payouts. Adjustment proposals retain existing agreed terms and obligations while entitlement policy is unavailable.

For procurement-managed orders, `CommercialOrder.delivered` means **buyer-accepted pieces**, maintained as the sum of immutable confirmations in the same locked transaction. Received, damaged and missing remain separate. The field is a denormalized projection, not a second independently editable fact. Legacy non-procurement demonstration semantics remain untouched. No commercial order state is migrated.

## G. Security evidence

The HTTP scenarios exercise read-only reconciliation denial before explicit grant, cross-organization and platform-admin denial, revoked grant and coordinator assignment, suspended membership, unsupported provenance/forged verification rejection, duplicate obligations, maker/checker denial and concurrent request/approval exclusion. Execution evidence remains unverified; SQL rejects verified escalation. The authenticated artisan is the claimant; coordinator-assisted financial impersonation is blocked. Finance/buyer/private artisan projections remain separate and contain no wearable or health data.

The old synthetic order action route rejects managed procurement delivery/settlement/closure transitions, so simulated payments cannot bypass closure assessment or overwrite buyer-accepted totals. Original immutable financial records are not edited to make tests pass.

## H. Executed test evidence

Commands executed from `website/` on 27 October 2026:

- `pnpm lint` — PASS, 318 files, zero findings.
- `pnpm typecheck` — PASS, contracts/API/API test and tools/Next route generation/web.
- `pnpm --filter @nasj/api test` — PASS, 70 tests; zero failures/skips.
- `pnpm --filter @nasj/web test` — PASS, 13 tests; zero failures/skips, including exact stock input conversion.
- `pnpm test:integration` — PASS, 110 scenarios on newly created disposable PostgreSQL with SMTP capture. Includes all previous regressions, finance governance, inventory replacement/mixed provenance, migration preservation and encrypted real pg_dump/pg_restore of 96 tables / 2,259 synthetic rows.
- `pnpm --filter @nasj/api test:batch5` — PASS, focused real HTTP execution/finance and inventory scenarios plus populated migration preservation. Final run includes a direct production-start denial for pending physical stock verification and required inventory idempotency headers.
- `pnpm test:e2e` — PASS, 36/36 browser tests, zero failures/skips, including both Batch 5 real-API journeys and all existing regressions. Final rerun includes ordinary-unit quantity inputs and the corrected compensation summary.
- `pnpm build` — PASS, contracts, API and optimized Next build with the new routes.
- `sha256sum -c docs/engineering/evidence/batch5-20261027/initial-migration-hashes.txt` — PASS, all six earlier migrations unchanged.
- `git diff --check` — PASS.

Raw logs live in `evidence/batch5-20261027/`. The first complete browser run passed 35/36 and failed on an ambiguous duplicated compensation summary. That duplicate presentation was removed; final browser outcome is reported above. Earlier moving-schema runs found and repaired attempts to mutate immutable release requirements, bigint JSON serialization and incomplete test fixture authority/CSRF headers. None of those failed runs is counted as passing evidence.

Tests use controlled synthetic identities/stock/payment reports in disposable databases. Browser journeys use real APIs and database writes rather than mocked successful bank responses. No skipped test is counted as passed. Initial failures during active schema development were used to repair immutable projection handling, JSON bigint presentation and fixture expectations; only final complete runs establish the results above.

## I. Remaining limitations

Owner acceptance is still required for all eleven stories. Open upstream funding, invoice and cancellation gates remain open. Migration deployment to persistent environments needs a separate authorized operation. Actual warehouse verification, stock valuation/waste accounting, bank evidence authority, payout-provider integration/manual settlement review policy, invoice/tax/legal approval and live compensation entitlement policy are absent. Accountless acceptance still cannot create work; accountless material reporting stays pending and financial dispute assistance is blocked without an approved path. No coordinator can silently waive a worker's claim. No lawful closure exception has been approved or implemented. Screens remain English within the existing responsive design system; live operational training, accessible assisted evidence and translated acceptance remain owner work.

Financial closure is intentionally unreachable while required policy or evidence is absent. A passing negative test proves the blocker, not actual settlement or pilot readiness.

## J. Next batch readiness

This implementation supports controlled synthetic demonstrations and software review, subject to the executed results in H. It is **not evidence of readiness for real inventory custody, buyer settlement or artisan payment**. Before a live controlled pilot, owners must accept the implemented journeys and prerequisites, authorize/migrate a staging environment, approve stock custody/inspection/valuation and compensation/cancellation processes, establish independently auditable bank/payout evidence, approve tax/invoice/contracts/privacy obligations and demonstrate reconciliation, incident response and restore procedures against the intended deployment. Real funds and inventory must remain outside the demonstration until those gates are evidenced.
