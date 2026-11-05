# Batch 13 implementation report — E18-06 / #209

28 October 2026 · Africa/Tunis. Work remains unstaged and uncommitted. No deployment, persistent
database migration, GitHub mutation, stash, reset or clean was performed. Everything below is
synthetic software evidence in disposable PostgreSQL and browser fixtures.

**Owner acceptance for E18-06 / #209 remains PENDING.** No criterion is marked accepted, and the
E14-09 qualified privacy review remains pending.

## Outcome

One private buyer-success journey now runs end to end on existing authorities:

> confirmed buyer receipt → private structured assessment → buyer correction with preserved
> original → scoped support follow-up with a named owner → linkage to an existing order claim whose
> status stays authoritative.

Nothing was rebuilt. There is no new microservice, no parallel claims system, no customer portal, no
public rating surface and no automatic financial or notification consequence.

## Implemented capabilities

- **Eligibility is a real receipt, not a projection.** A buyer may submit feedback only with an exact
  `BuyerDeliveryConfirmation` on a shipment of that same order where `received > 0`. An operator
  delivery report, `CommercialOrder.delivered`, QA approval or an accepted quotation never
  establishes eligibility. Partial and damaged receipts remain eligible, including a receipt with
  `accepted = 0`. A delivery with nothing received is refused with `NO_CONFIRMED_RECEIPT` and
  directed to the existing missing-delivery claim flow, which continues to work.
- **One aggregate per order and buyer author.** A second creation is `DUPLICATE_FEEDBACK`, not a
  silent replacement. Another eligible buyer participant records their own independent assessment.
- **Every change is an appended, complete snapshot.** `SUBMITTED`, `BUYER_CORRECTION`, `FOLLOW_UP`
  and `CASE_LINK` revisions each carry category, rating, comment, follow-up status/owner/note,
  optional case link and a reason. A buyer correction replaces only buyer-owned fields; a support
  follow-up leaves the buyer comment, rating and category untouched.
- **Case linkage is honest.** The only linkable object is an order-related `SupportTicket` in
  `/collaboration` whose `relatedId` equals this exact order and whose organization equals this
  order's operating organization. The older `SupportCase` at `/support/cases` is untouched and never
  used. Linking writes a `FEEDBACK_LINKED` ticket event, never changes ticket status, and never
  resolves a claim or closes an order.
- **Follow-up status is separate from claim status.** `OPEN → FOLLOW_UP/RESOLVED`,
  `FOLLOW_UP → OPEN/RESOLVED`, and `RESOLVED → FOLLOW_UP` only with a stated reason. `FOLLOW_UP`
  requires an owner; the owner must be an active same-operator member with `support.case.manage` and
  a current, unrevoked assignment to that buyer. No default role was widened.

## Reused authorities

Identity and session (`iamTransaction`, active verified account, live session), buyer organization
membership with `buyer.rfq.read` + `buyer.delivery.confirm`, internal membership with
`support.case.manage`, `OperatorAssignment`, `SupportTicket`/`SupportTicketEvent`, `ZodValidationPipe`,
`replaySafe` idempotency receipts, `audit` + outbox, the fixed advisory-lock order
`724631902 → 724631903`, `PrismaService` transactions and the shared `RateBucket` API limiter.
`FinanceService` and `ProcurementService.accept` were not written to and remain the closure/funding
authorities.

## New schema

Only two additive tables, in migration `20261028160000_buyer_order_feedback` (37th migration; all 36
previous files and their checksums are untouched):

| Table | Purpose |
|---|---|
| `BuyerOrderFeedback` | header pinning order, buyer reporter, exact receipt confirmation, server-derived `sourceClass`/`scenarioId`, `createdAt`, `currentVersion` |
| `BuyerOrderFeedbackRevision` | append-only complete snapshot per version with actor, kind, category, rating, comment, follow-up status/owner/note, optional `linkedTicketId` and reason |

Native guarantees: unique `(orderId, reporterId)`; unique `(feedbackId, version)`; restrictive
`ON DELETE RESTRICT` foreign keys on every relation; CHECK constraints for version ≥ 1, category,
rating 1–5, comment and note length ≤ 2000, follow-up status, owner-required for `FOLLOW_UP`,
reason-required for `RESOLVED` and for any version above 1, source class, and scenario presence for
demo submissions; a `BEFORE UPDATE OR DELETE` append-only trigger on revisions; a header identity
guard rejecting any change to order/reporter/receipt/source/scenario/createdAt and any version advance
other than exactly one; header delete rejection; an eligibility trigger re-checking the receipt,
`received > 0` and shipment/order lineage; and a revision-chain trigger enforcing monotonic versions
and the exact-order/exact-operator case link. No cascading erasure of historical business records.

## New API

Six routes under the existing `/api/v1/collaboration` controller:

| Route | Authority |
|---|---|
| `GET /order-feedback` | own assessments (buyer author) or scoped support; optional `orderId` filter adds minimized `eligibleReceipts` and assignable `followUpOwners` |
| `GET /order-feedback/:id/history` | buyer author, or scoped support; buyer projection withholds internal notes and inaccessible case ids |
| `POST /orders/:id/feedback` | active buyer membership + `buyer.delivery.confirm` + `buyer.rfq.read` |
| `POST /order-feedback/:id/corrections` | reporter only, with `expectedVersion` and reason |
| `POST /order-feedback/:id/follow-up` | scoped support: internal membership + `support.case.manage` + current assignment |
| `POST /order-feedback/:id/case-link` | scoped support plus independent existing ticket visibility |

Errors follow the documented contract: unknown entity/scope → 404, known resource without mutation
authority → 403, invalid payload → 400, eligibility/duplicate/stale-version/changed-replay/invalid
transition → 409. Pagination defaults to 20, maximum 50. Actor, provenance and timestamps are always
server-derived; `src` traffic cannot set `reporterId`, `sourceClass` or `scenarioId` (strict schemas
reject the fields). Audit rows record action, actor, organization, feedback/version/source ids and a
reason classification — never the private comment body.

## UI

- `/procurement/:id` → Delivery tab: a buyer feedback panel beside the existing logistics section,
  bound to confirmed-receipt options from the scoped read. It shows the current assessment, its
  version, follow-up state/owner, permitted claim status, source label, correction history
  (internal notes withheld) and the correction form. Draft text survives errors, the idempotency key
  is retained until a command succeeds, version conflicts explain the reload, and a new local
  `nasj:logistics-updated` event refreshes eligibility immediately after a receipt is confirmed.
- `/collaboration`: a support follow-up section listing only assessments the viewer can manage, with
  an owner selector limited to eligible assigned support managers, status transitions, internal notes,
  an existing-order-claim selector built from tickets already visible to that actor, and versioned
  history. Claim creation reuses the existing ticket form; creating and linking remain two separate
  authorized actions and the buyer is never impersonated. `/support/cases` is unchanged.

Comments render as plain text. There is no testimonial switch, no public rating, no marketing
publication and no automatic email.

## Privacy and governance integration

`GovernanceService.exportOwn` now includes the subject's own `orderFeedback` with full correction
history, and a minimized `feedbackActions` list of revisions the subject authored on someone else's
assessment (metadata only, no private content). Internal follow-up notes are exported as `null` for
every row. The retention inventory gained a `BUYER_ORDER_FEEDBACK` class with explicit purpose,
access roles, preservation rationale and a correction process that mentions no invented retention
duration; review status stays `PENDING_QUALIFIED_POLICY_REVIEW` with purging disabled.

## Migration result

`prisma migrate deploy` applied the new migration cleanly to a populated pre-migration disposable
PostgreSQL 17.7 database in `feedback-migration.scenarios.ts`: 130 baseline tables and every row hash
unchanged, the new tables absent before and present after, native constraints/triggers verified, a
valid assessment accepted, and duplicate aggregate, invalid rating, version jump, unassigned
`FOLLOW_UP`, cross-order link, revision UPDATE/DELETE, header receipt change and header version jump
all rejected. A failed revision insert rolls its header advance back. A `pg_dump`/`pg_restore` cycle
into a second disposable container reproduced both history tables byte-for-byte and retained the
append-only trigger.

## Verification totals

Full details, exact logs and both reproducers are in
[BATCH13_VERIFICATION.md](batch13-verification.md); the machine-readable record is
[verification-summary.json](../../engineering/evidence/batch13/verification-summary.json).

| Signal | Result |
|---|---|
| API unit tests | 140 passed, 0 failed |
| Web unit tests | 25 passed, 0 failed |
| Full integration scenarios | 196 passed, 0 failed |
| E18-06 HTTP/PostgreSQL scenarios | 13 passed |
| E18-06 migration/upgrade/restore scenarios | 6 passed |
| Showroom isolation scenarios | 5 passed |
| Browser journeys (mobile 390×844, desktop 1280×900) | 2 passed, 0 axe violations |
| Full application browser suite | 54 passed, 0 failed |
| Showroom browser suite | 3 passed, 0 failed |
| `pnpm lint` | pass, 419 files, no findings |
| `pnpm typecheck` | pass |
| `pnpm build` | pass |
| Prisma schema validation | pass |
| `git diff --check` | pass |

## Remaining limitations

- Feedback is not a claim, payment, quality completion, commercial acceptance, financial closure or
  publication. It never changes payables, adjustments, disputes, receipt quantities, accepted terms or
  closure state; the integration suite asserts this before and after follow-up and case linking.
- No real participant feedback may be collected before the qualified purpose/access/retention review
  under E14-09/#74. Every label in the UI states that user-submitted feedback about a synthetic order
  does not prove a real purchase or verified satisfaction.
- Owner acceptance, and any publication or public-rating feature, require separate explicit
  instruction under their own backlog authority.

## Files

**Contracts** `packages/contracts/src/collaboration.ts` (categories, follow-up transitions,
eligibility, case-link matching, provenance derivation, comment sanitizer, four command schemas, two
query schemas, six view DTOs).

**API** `apps/api/src/modules/collaboration/order-feedback.ts` (new scoping/authorization/view
helpers), `collaboration.service.ts` (six commands/reads, workspace projection),
`collaboration.controller.ts`, `apps/api/src/modules/governance/governance.service.ts`,
`governance/retention.ts`.

**Schema** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20261028160000_buyer_order_feedback/migration.sql`.

**Web** `apps/web/src/components/order-feedback.tsx`,
`order-feedback-support.tsx`, `collaboration-workspace.tsx`, `procurement.tsx`,
`logistics-workspace.tsx`, `apps/web/src/lib/logistics-events.ts`.

**Tests** `apps/api/test/order-feedback.scenarios.ts`,
`apps/api/test/feedback-migration.scenarios.ts`, `apps/api/test/order-feedback.fixture.ts`,
`apps/api/test/unit/collaboration.test.ts`, `apps/api/test/unit/batch12.test.ts`,
`apps/api/test/demo.scenarios.ts`, `apps/api/test/integration.ts`, `tests/e2e/order-feedback.spec.ts`,
`tests/e2e/setup.ts`.
