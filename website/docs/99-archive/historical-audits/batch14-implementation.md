# Batch 14 implementation report — E15-06 / #192

28 October 2026 · Africa/Tunis. Work remains unstaged and uncommitted. No deployment, persistent
database migration, GitHub mutation or persistent showroom reset was performed.

**Owner acceptance for E15-06 / #192 remains PENDING.** All evidence is synthetic software evidence in
disposable PostgreSQL and browser fixtures. Real participant feedback collection stays disabled until
the E14-09 / #74 qualified privacy review.

## Outcome

A showroom visitor can leave a private, structured assessment of a specific screen of the synthetic
demonstration. It is validated, rate-limited, provenance-labelled, persisted, and preserved across a
showroom reset. A real administrator can then triage it from a scoped inbox with fully attributable,
append-only moderation history.

Nothing was rebuilt. There is no new feedback service, no CRM, no ticketing platform, no
`BuyerOrderFeedback` reuse, no `SupportTicket` reuse and no public review surface.

## Implemented capabilities

- **Capture.** `POST /api/v1/demo/feedback` accepts `scenarioId`, a closed `screenKey`, a category
  (`USABILITY`, `CONTENT`, `DEFECT`, `IDEA`) and an optional plain comment bounded to 2,000 characters.
  Strict schemas reject any attempt to supply `visitorId`, `sourceClass`, `generation`, `status`,
  `createdAt` or `actorId`.
- **Visitor identity.** Resolved only from the existing HttpOnly `nasj_demo_visitor` cookie, whose raw
  token is never stored — only its SHA-256 hash. Writes additionally require the existing HMAC
  `X-Demo-CSRF` proof bound to that token plus `origin` equality, reusing `DemoService.control`
  unchanged.
- **Scenario ownership.** A scenario the visitor does not own is indistinguishable from a missing one
  (404). Generation is copied from the scenario server-side, never from input.
- **Abuse controls.** A dedicated `feedback` rate policy (`RATE_FEEDBACK_MAX` / `RATE_FEEDBACK_WINDOW`,
  default 8 per 300s) is added to the existing `SecurityService` bucket — the single limiter datastore.
  On top of it, a per-visitor-per-scenario cap of 10, an optional client `dedupeKey` backed by a
  partial unique index, and the showroom's existing idempotency receipt (`DemoCommand`, widened
  forward to include the `feedback` operation) so a same-key replay returns the original result and a
  changed payload conflicts.
- **Reset preservation.** A reset archives the scenario (`ARCHIVED` + `archivedAt`) and never deletes
  it, so feedback survives automatically because the foreign key is `ON DELETE RESTRICT`. No change to
  `DemoService.reset` was needed for data safety.
- **Moderation.** `GET /api/v1/admin/demo-feedback` (paged, filterable by status, category and
  scenario), `GET /api/v1/admin/demo-feedback/:id` (detail plus ordered history) and
  `PATCH /api/v1/admin/demo-feedback/:id` (transition) are `@AdminOnly()` and additionally call
  `PolicyService.requireAdmin` inside the transaction. Archived generations remain reviewable.
- **Transitions.** `NEW → TRIAGED | DISMISSED`, `TRIAGED → NEW | ACTIONED | DISMISSED`; `ACTIONED` and
  `DISMISSED` are terminal. Closing out requires a stated reason. A guarded `expectedStatus` check
  returns 409 `STALE_STATUS` so a stale tab cannot overwrite a colleague.
- **Attribution.** Every moderation action appends a `DemoFeedbackEvent` with the reviewer's real
  `User` id, from/to status and note, plus an `AuditEvent` that deliberately excludes the comment body.
- **Provenance.** `sourceClass` distinguishes `VISITOR_SUBMITTED` from `SYNTHETIC_SEEDED`, is
  server-derived, and every DTO and UI label states that the record is a visitor opinion about a
  synthetic demonstration that proves neither a real participant view nor a product result.
- **Privacy inventory.** A new `DEMO_VISITOR_FEEDBACK` retention class records purpose, access roles,
  trigger and preservation reason with `retentionDuration: null` and
  `PENDING_QUALIFIED_POLICY_REVIEW`. Purging remains disabled.

## Reused authorities

`DemoVisitor` + visitor cookie, `DemoService.control` HMAC proof, `DemoScenario` as the isolation unit,
`assertDemoSession` for persona sessions, `DemoCommand` idempotency receipts, the fixed advisory-lock
order `724631902 → 724631903`, `ZodValidationPipe`, `PolicyService.requireAdmin`, `@AdminOnly()`, the
`AuditEvent` append-only ledger and the `RateBucket`/`SecurityService` limiter. Batch 13's
`BuyerOrderFeedback`, `SupportTicket` and the legacy `SupportCase` were not touched.

## New schema

One additive migration, `20261028170000_demo_feedback` (38th; all 37 previous files untouched):

| Table | Purpose |
|---|---|
| `DemoFeedback` | scenario, visitor, generation, server-derived `sourceClass`, `screenKey`, `category`, comment, `status`, optional `dedupeKey`, `createdAt` |
| `DemoFeedbackEvent` | feedback, nullable actor, kind, from/to status, note, `createdAt` |

Native guarantees: restrictive foreign keys on every relation; CHECK constraints for generation,
source class, category, status, comment length, the closed screen vocabulary and dedupe length; a
partial unique index on `(scenarioId, visitorId, dedupeKey)` where the key is present; an append-only
trigger on events; a content guard permitting only `status` to change and making a closed status
terminal; a delete guard on the aggregate; and an anchor trigger proving the visitor owns the scenario,
the generation matches and a row starts in `NEW`. `DemoFeedbackEvent.actorId` is nullable because a
visitor submission is anonymous, with a CHECK that requires an actor for every moderation kind and
forbids one for `SUBMITTED` — so history is attributable where it must be and never fabricates a user
for an anonymous visitor.

## New API

| Route | Authority |
|---|---|
| `POST /api/v1/demo/feedback` | visitor cookie + `X-Demo-CSRF` + `Idempotency-Key` |
| `GET /api/v1/demo/feedback` | visitor cookie, own submissions only |
| `GET /api/v1/admin/demo-feedback` | `ADMIN` (guard + service check) |
| `GET /api/v1/admin/demo-feedback/:id` | `ADMIN` |
| `PATCH /api/v1/admin/demo-feedback/:id` | `ADMIN`, guarded `expectedStatus` |

## UI

- `/demo`: a **Share feedback** section with a screen/story select drawn from the closed vocabulary, a
  category select, an optional comment with a live character count, a plain-text provenance note, and
  the visitor's own recent submissions. A failed request keeps both the draft and the idempotency key
  and offers retry. While submitting, the fieldset is disabled so a double submit cannot fire.
- `/admin/demo-feedback`: an inbox with status/category filters, summary counts, per-item provenance
  label and a collapsible moderation history, plus a decision form that requires a reason for
  closure. A navigation entry sits beside **Participant concerns**.

Both include accessible labels, keyboard operation, axe-clean markup and mobile layouts.

## Verification totals

Full detail, logs and reproducers: [BATCH14_VERIFICATION.md](batch14-verification.md);
machine-readable record: [verification-summary.json](../../engineering/evidence/batch14/verification-summary.json).

| Signal | Result |
|---|---|
| API unit tests | 147 passed, 0 failed |
| Web unit tests | 25 passed, 0 failed |
| Full integration scenarios | 206 passed, 0 failed |
| E15-06 HTTP/security scenarios | 4 passed |
| E15-06 migration/upgrade/restore scenarios | 6 passed |
| Showroom isolation scenarios | 9 passed |
| New E15-06 browser journeys | 2 (both pass in isolation and in the full suite) |
| Full application browser suite | 54 passed, 0 failed |
| Showroom browser suite | 5 passed, 0 failed |
| `pnpm lint` | pass, 426 files, no findings |
| `pnpm typecheck` | pass |
| `pnpm build` | pass |
| Prisma schema validation | pass |
| `git diff --check` | pass |

## Remaining limitations

- Feedback is not a claim, a review, a testimonial, a rating, a payable or verified evidence, and no
  command touches `FinanceService`, `ProcurementService.accept`, payables, adjustments, disputes,
  receipts, acceptances or closure state.
- A visitor returning after the 24-hour cookie expiry receives a fresh visitor identity and cannot
  read older submissions. That is deliberate: re-linking an expired cookie would require retaining a
  linkable identifier beyond its purpose.
- No attachments, threaded replies, email notification, comment search or export exist in this
  increment.
- Real collection at scale, owner acceptance and any publication remain gated.

## Files

**Contracts** `packages/contracts/src/demo.ts`.

**API** `apps/api/src/modules/demo/demo-feedback.admin.ts`,
`demo-feedback.admin.controller.ts`, `demo.controller.ts`, `demo.service.ts`, `demo.module.ts`,
`apps/api/src/security/policies.ts`, `apps/api/src/config/env.ts`,
`apps/api/src/modules/governance/retention.ts`.

**Schema** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20261028170000_demo_feedback/migration.sql`.

**Web** `apps/web/src/components/demo-feedback-panel.tsx`, `demo-feedback-admin.tsx`,
`demo-showroom.tsx`, `apps/web/src/lib/demo-api.ts`, `apps/web/src/lib/app-navigation.ts`,
`apps/web/src/app/(protected)/admin/demo-feedback/page.tsx`.

**Tests** `apps/api/test/demo.scenarios.ts`, `apps/api/test/demo-feedback-migration.scenarios.ts`,
`apps/api/test/unit/demo-feedback.test.ts`, `apps/api/test/integration.ts`,
`apps/api/test/unit/batch12.test.ts`, `apps/api/test/batch12.scenarios.ts`,
`tests/demo-e2e/showroom.spec.ts`.
