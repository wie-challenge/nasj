# Completion report: #32, #88 and #195

Historical #32/#88/#195 completion report at baseline 9eb6d37. Current expanded counts, simulator/ETL/operations and remaining full-epic limits are in [E16_ENGINEERING_REPORT.md](e16-engineering-report.md) and [E16_TEST_RESULTS.md](e16-test-results.md).

Scope: the user's three requested stories, implemented in the existing website architecture and validated on synthetic records. This supersedes their earlier partial statuses. Other E16 stories and the complete product/release are not automatically marked complete. GitHub issue status was not changed.

## #32 — Pure Domain State, Money and Quantity Invariants: COMPLETE

| Acceptance criterion | Implementation and evidence |
|---|---|
| Unit transitions, exact decimals and allocations | Pure `packages/contracts/src/commerce/domain.ts` plus existing `domain.ts`; exhaustive state/role edge tests and deterministic 500-partition quantity/money checks in `commerce-domain.test.ts` |
| Guarded RFQ/order/offer/batch/payment transitions independent of UI | All five typed state vocabularies/explicit edges, preconditions, terminal/duplicate denial and controlled conservative branches; every corresponding Nest command invokes them inside its transaction |
| Exact TND and documented rounding/units | bigint millimes in domain/API commands and PostgreSQL BIGINT; decimal-string UI/API serialization; signed-64-bit bound, HALF_UP rational rounding and unit×quantity overflow tests; quote/offer/payment persisted exactness |
| Allocation, production, QA and settlement reconciliation | Capacity reservations/accepted commitments <= declared/order quantity; cumulative output <= assignment; approved+rejected+pending=submitted; delivered<=approved; separate buyer/artisan settlement limits and unresolved-obligation closure guards |
| Valid/invalid/boundary/duplicate/impossible paths | Unit + actual PostgreSQL concurrency/replay, stale version, declined/expired offers, unauthorized owner actions, excess production, inspection mismatch/reinspection history, overpayment and unpaid/pending/disputed closure tests |

Files: shared commerce domain/contracts, `apps/api/src/modules/commerce/`, additive migration `202610200002_synthetic_commerce`, `apps/api/test/{commerce.fixture,commerce.scenarios}.ts`, `test/unit/commerce-domain.test.ts`. [Architecture and exact equations](../../02-architecture/commerce-domain.md).

## #88 — Responsive Accessible Critical User Journeys: COMPLETE for the implemented synthetic journeys

| Acceptance criterion | Implementation and evidence |
|---|---|
| Keyboard/small-screen flows and reduced motion | 360×800 and 1280×900 commerce journeys, keyboard action/focus assertions, existing 320px skip-link/login tests; reduced-motion CSS overrides inline animations |
| Buyer RFQ, artisan decisions/progress, operator review | Real `/commerce/buyer`, `/commerce/artisan`, `/commerce/operator` pages with saved/editable drafts, immutable quote/offer terms, voluntary decisions, progress, QA and fulfillment; API persisted assertions |
| Labels/keyboard/focus/understandable validation | Native forms/labels/textarea/details/buttons, visible focus, bounded inputs, required terms, explicit cumulative semantics, QA reconciliation errors, role-specific actions |
| Reduced motion/text alternatives/status announcements | Text-first card/definition-list layout, loading/empty states, `role=status/alert`, safe recoverable network errors; server-committed progress response dropped and retried without duplication |
| Representative slow browser/device conditions | Mobile Chromium emulates 4× CPU slowdown, 150ms latency and 200/100KiB/s down/up throughput; axe WCAG A/AA-tag checkpoints; no horizontal overflow; captured mobile output visually inspected |

Files: `commerce-workspace.tsx`, three protected pages, shared existing accessible UI, responsive CSS/navigation, `tests/e2e/commerce.spec.ts`, pinned `@axe-core/playwright` 4.14.0. Eight axe checkpoints across two viewports have zero detected violations. JSON/screenshot evidence is retained through the Playwright reporter and CI artifact configuration.

This is no blanket WCAG certification, independent screen-reader audit, cross-browser or physical low-end-device measurement. The slow conditions are emulated and screenshots are observed browser output.

## #195 — Reproducible Setup, API and Firmware Documentation: COMPLETE

README links repository-local development/architecture/API/security/testing/deployment/operations/firmware guides. They describe pinned tools, real commands/environment/migrations/seed, the new pages/contracts/roles/state/money/replay rules, safe errors, built API/worker startup, additive migration rollback, synthetic-only limitations and unavailable firmware/hardware explicitly. No secrets or fabricated board/wiring/build instructions are included. Reset uses disposable test databases, not destructive commercial endpoints.

The documented commands were exercised against the installed workspace. Clean-source install attempts and any registry/cache blocker are recorded honestly in the [test results](e16-test-results.md) and raw evidence; later clean steps are never called passing when installation prevented them. Hardware is unavailable rather than simulated without a contract. Full cold network reproducibility, deployment/provider behavior and physical verification are distinguished from these documentation criteria.

## Verification and limits

Current evidence is in [test results](e16-test-results.md), [security report](e16-security-test-report.md) and `evidence/`. All three stories are implemented for the synthetic prototype. Advanced contract amendments/remedies, real payments, external notifications, ETL, firmware/hardware, production operations and a complete competition release remain outside this completion claim. Verification did not perform production writes, live financial transactions, merges, application deployments or GitHub issue closure.
