# Browser verification

28 October 2026 · Africa/Tunis.

The final `pnpm test:e2e` run passed **50 application tests and 3 showroom tests**: [browser-release.log](../../../engineering/batch8-11-completion/evidence/browser-release.log). A separate showroom run passed **3 tests**: [browser-demo-final.log](../../../engineering/batch8-11-completion/evidence/browser-demo-final.log). The runner builds the actual Next.js
app, starts the Nest API, provisions native disposable PostgreSQL and local SMTP, and uses real Better Auth
sessions. No new business route is verified solely by mocked backend responses. Deliberate network/error
injections are limited to explicit recovery assertions.

New specs cover all five routes:

- `tests/e2e/planning-intelligence.spec.ts`: `/operator/planning` → `/operator/planning/[orderId]`, persisted
  assessments/ranking, material assumptions, draft/review, positive human override, purpose-scoped history
  and findings, editable effort-range pricing and material-buffer delivery comparison. `/intelligence` covers
  reporting period, empty/unknown results, keyboard/month controls, risk evaluation and backend denial.
- `tests/e2e/product-authority.spec.ts`: `/catalog`, own-artisan acceptance of exact sample terms, completion,
  recognized payable, buyer rejection retaining the obligation, mobile/desktop keyboard and accessibility,
  empty state and a genuine backend retry after an injected outage.
- `tests/e2e/collaboration.spec.ts`: `/collaboration`, private backend-connected support creation/withdrawal
  on mobile/desktop, keyboard access and axe checks.
- `tests/demo-e2e/batch811.spec.ts`: connected synthetic planning/sample/approval/release/progress/inspection,
  voluntary observed-time UI with explicit consent, authenticated earnings/history, private print exclusion,
  intelligence/collaboration records and cross-visitor reset. Existing showroom and old route specs remain.
- `tests/e2e/capacity.spec.ts` adds the delegation-scoped association aggregate and confirms private fields
  are absent, while the existing artisan/coordinator flows still exercise keyboard and axe on both widths.

## Defects found by the browser runs

Sign-in's redirect allowlist omitted the new routes; the planning index used the wrong order-reference
shape; the execution view exposed the old quotation checklist after catalogue binding; and a global print
selector hid presentation evidence. These were corrected and rerun. The commercial fixture now owns an
isolated craft cohort, avoiding randomly overlapping periods from unrelated suite fixtures without weakening
capacity-unknown guards. The commerce regression drains the real worker until its projection is current,
instead of assuming four worker batches will always cover a growing suite.

Tests were corrected to await the actual approval status cell rather than the `Approved` table heading,
to target application error notices rather than Next's route announcer, and to send required JSON on sign-out.
Month controls are exercised with their browser keyboard segments. Earlier failure logs remain available;
only successful final evidence is used by the acceptance matrix.

Real consenting participant comprehension, physical quality and measured real production outcomes are not
browser-test results. See [COMPREHENSION_VALIDATION_PROTOCOL.md](comprehension-validation-protocol.md).
