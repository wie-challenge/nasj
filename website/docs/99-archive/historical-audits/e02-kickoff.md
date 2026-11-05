# E02 — Buyer procurement and RFQ kickoff

Started 2026-10-20 after the E16 review, local demos and PR checks passed. The user selected E02 and requested a new epic branch after testing.

Branch: `epic/e02-buyer-procurement-and-rfq-catalog`, based on merged website main `54b82eb` ([PR #214](https://github.com/wie-challenge/website/pull/214)). The older `epic/e02-buyer-procurement-and-rfq` branch is preserved. This is the kickoff and implementation plan, not acceptance evidence that an E02 story is complete. No issue status was changed.

Implementation follow-up: #31 now has a catalog and RFQ prefill implementation on this branch. Current acceptance evidence and limitations are recorded in [the catalog report](e02-catalog-report.md). The inventory below preserves the starting dependency audit; no E02 issue is automatically closed by that implementation.

## Starting evidence

- The local desktop buyer/artisan/operator demo passed: RFQ, quote, voluntary offer, production, QA, shipment, buyer acceptance, separate simulated receipts/payouts, closure, report, CSV and inbox. Five axe checkpoints had zero violations. Local artifacts: `.local/e16-premerge-demo.log`, `.local/e2e-report.json`, `.local/commerce-desktop-operator.png` (ignored, synthetic data).
- Website [PR verification](https://github.com/wie-challenge/website/actions/runs/39480297635) and [head verification](https://github.com/wie-challenge/website/actions/runs/39480268172) passed before merge: install, setup, client generation, lint, types, 46 unit tests, 58 integration scenarios, 15 browser cases, audit and build.
- Independent IoT lint/types/12 tests/build/demo passed. The accelerated fixture produced one simulated 200 ms reminder. [IoT PR #1](https://github.com/wie-challenge/iot/pull/1) is merged. Physical checks for [#197](https://github.com/wie-challenge/website/issues/197) remain pending; E02 does not introduce device communication.
- The existing local site and API were checked at `http://localhost:3000/auth/login` and `http://127.0.0.1:3001/api/health/ready`; both returned 200. Existing Docker Desktop PostgreSQL/Mailpit services were reused. Other applications were not restarted.

## Dependency audit

GitHub story bodies and issue states were read on 2026-10-20. All nine E02 stories remain open. Recheck each prerequisite and its actual implementation before starting a dependent story; synthetic E16 coverage does not automatically complete the broader product stories.

| Story | Declared dependencies | Starting decision |
|---|---|---|
| [#31 — Buyer craft and example product catalog](https://github.com/wie-challenge/website/issues/31) | #30 closed | **First eligible P0 story.** Build the buyer-safe synthetic catalog and RFQ entry. |
| [#33 — RFQ draft creation, validation and submission](https://github.com/wie-challenge/website/issues/33) | #31 open; #32 closed | Wait for #31. Audit existing E16 draft/version/replay behavior against all #33 criteria and its revision deliverable before extending it. |
| [#95 — RFQ design reference attachments](https://github.com/wie-challenge/website/issues/95) | #33 open | Wait. No upload endpoint exists in the current baseline. |
| [#96 — RFQ status and attributable activity timeline](https://github.com/wie-challenge/website/issues/96) | #33 open | Wait. Existing status/inbox is not the full scoped actor/timestamp timeline. |
| [#97 — RFQ revisions and feasibility clarifications](https://github.com/wie-challenge/website/issues/97) | #96 open | Wait. Preserve quoted content and add reviewed immutable revision/clarification semantics. |
| [#100 — Buyer sample review and preproduction approval](https://github.com/wie-challenge/website/issues/100) | #98 and #99 open | Blocked on E20 sample and sign-off records. |
| [#101 — Permission-scoped order discussions](https://github.com/wie-challenge/website/issues/101) | #40 open | Blocked on the reviewed exact-quote acceptance product story. |
| [#102 — Buyer procurement document center](https://github.com/wie-challenge/website/issues/102) | #65 and #60 open | Blocked on reviewed invoice and delivery-receipt documents. |
| [#104 — Reorder from an approved product](https://github.com/wie-challenge/website/issues/104) | #103 and #40 open | Blocked on approved SKUs and the exact-quote acceptance product story. |

## First implementation: #31

Extend the current application rather than create a second commerce subsystem. Reuse the active craft catalog, shared contracts, Nest authorization, existing buyer RFQ form and synthetic provenance rules. Keep example fixtures separate from verified inventory or E20-approved live SKUs.

- [ ] Provide a bounded buyer-safe projection with category, example, image/alternative text, unit and specification summary.
- [ ] Display indicative lead-time ranges with their fixture assumptions; show no claim of available stock, verified supply or guaranteed delivery.
- [ ] Label every synthetic example and make unavailable examples visibly unavailable.
- [ ] Handle empty categories and missing images with accessible fallbacks.
- [ ] Link an eligible example into the existing RFQ form; revalidate craft/specification on the server and require the buyer to confirm quantity, destination and future deadline.
- [ ] Verify mobile browsing, keyboard operation, unavailable/missing-image/empty states, RFQ prefill and server rejection of forged or inactive selections. Capture evidence before considering the story complete.

The current implementation has `GET /api/v1/craft-skills`, active craft lookup in the commerce workspace and the guarded `POST /api/v1/commerce/rfqs` flow. It has no buyer product/example catalog. Inspect `apps/api/src/modules/artisans`, `apps/api/src/modules/commerce`, `packages/contracts/src/commerce`, `apps/web/src/components/commerce-workspace.tsx` and `tests/e2e/commerce.spec.ts` before extending those boundaries. Read `apps/web/AGENTS.md` and the installed Next documentation before frontend edits.

## Working boundaries

Use fictional fixtures and disposable databases for test writes. Preserve local credentials, existing records and the user's generated dev-mode `apps/web/next-env.d.ts` change. Do not reset volumes, start unrelated containers, infer hardware results or claim real contracts/payments. Local software/demo verification does not close #197. At kickoff, the branch and planning commit were created locally. The later catalog implementation and its feature PR are documented in the catalog report.
