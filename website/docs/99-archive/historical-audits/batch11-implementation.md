# Batch 11 — Operational Collaboration

Engineering review: 28 October 2026, Africa/Tunis. Repository: `website/`. No GitHub issue was edited.

## A. Backlog coverage

| ID | Original criterion | Implemented | Remaining | Code status |
|---|---|---|---|---|
| E02-05 | Changes create a version with traceable history | Pre-existing `ProcurementRevision` chain already versions RFQ changes and feasibility questions. Batch 11 adds order-linked discussion without rewriting accepted terms. | No new RFQ revision editor was needed. | IMPLEMENTED_UNVERIFIED (pre-existing) |
| E02-07 | Conversation tied to permitted order participants | `OrderDiscussion`/`DiscussionMessage` scoped to orders the caller participates in as buyer, operator, artisan or assigned coordinator; `internalOnly` messages are filtered from non-internal viewers. | — | IMPLEMENTED_UNVERIFIED |
| E06-05 | Exception visible to assigned coordinator; resolution logged | `ProductionException` with reporter role, category, severity, evidence, status lifecycle and resolution. The reporter's `description` is never overwritten. | — | IMPLEMENTED_UNVERIFIED |
| E06-06 | Change impact shown and affected parties approve revised commitments | `ScheduleRevision` stores previous and proposed deadlines, impact JSON, and `PENDING_APPROVAL` until the buyer approves. Only approval applies the new deadline. | Batch-level only; per-artisan multi-batch cascades are not modelled. | IMPLEMENTED_UNVERIFIED |
| E04-05 | Permission scoped, logged and revocable | Pre-existing `OnboardingAuthorization` and `DelegationGrant` cover assisted registration. Batch 11 does not create a second authority and does not grant acceptance authority. | No new endpoints; existing ones were not altered. | IMPLEMENTED_UNVERIFIED (pre-existing) |
| E04-07 | No automatic acceptance; manager must approve modified terms | `Counteroffer` with `PROPOSED → MANAGER_REVIEW → ARTISAN_ACCEPTED`, declined or withdrawn. `counterofferCreatesAgreement` is true only for `ARTISAN_ACCEPTED`. | Applying an accepted counteroffer back to the offer terms is not automated. | PARTIALLY_IMPLEMENTED |
| E04-08 | No new offers until availability restored | `AvailabilityPause` sets `availabilityStatus = PAUSED`, which the existing eligibility engine already treats as a hard block; resume restores it. Commitments and compensation untouched. | — | IMPLEMENTED_UNVERIFIED |
| E04-09 | No access to nonmember finances or biometric information | Existing directory/capacity projections already enforce this. Batch 11 adds no new aggregate capacity surface and reads no biometric data. | Not re-implemented; verified by inspection only. | IMPLEMENTED_UNVERIFIED (pre-existing) |
| E19-01 | Work instructions versioned, images captioned and language chosen, with printable fallback | Existing `ProcurementRevision` instructions plus `preferredLanguage`; Batch 9 reference images carry captions. | No new illustrated-instruction renderer was built this batch. | PARTIALLY_IMPLEMENTED |
| E19-03 | Training requests private to authorized support role and not used as automatic exclusion criteria | Support cases with category `SUPPORT_REQUEST` are visible to the reporter and support operators only. No ranking input reads support requests. | — | IMPLEMENTED_UNVERIFIED |
| E14-03 | Ticket lifecycle, attachments, owner and deadlines defined | `SupportTicket` + `SupportTicketEvent` with category, related resource, priority, owner, due date, resolution and full event history. | Attachments are an evidence reference string, not stored files. | IMPLEMENTED_UNVERIFIED |
| E14-06 | Opt-in channel, localized content and delivery status tracked | `notificationPlan` returns `SKIPPED_NO_OPT_IN` or `UNDELIVERABLE_NO_PROVIDER` rather than pretending to send; opted-in in-app deliveries are recorded as `DELIVERED`. | Localised template catalogue is not implemented; body text is English. | PARTIALLY_IMPLEMENTED |

## B. Working journeys

1. An artisan or coordinator reports a material shortage. It appears `OPEN`; a critical unresolved shortage
   blocks readiness for planning.
2. A coordinator acknowledges and later resolves it with a written resolution; the original description is
   retained verbatim.
3. When a disruption threatens the deadline, a coordinator proposes a new date. It stays
   `PENDING_APPROVAL` and the effective deadline remains the old one.
4. The buyer approves; only then does the offer deadline move.
5. An artisan counteroffers quantity and deadline. A manager approves the changed terms; the artisan must
   still accept explicitly before `createsAgreement` becomes true.
6. An artisan pauses availability; new offers stop, existing commitments and pay are unchanged, and resume
   restores availability.
7. A participant opens a support case, an operator progresses and resolves it, and each change appends a
   `SupportTicketEvent`.
8. A buyer and operator exchange messages on the order; internal notes stay internal.
9. A participant opts in to a category; only opted-in in-app notifications are created, and external channels
   are recorded as undeliverable.

## C. Architecture

- `packages/contracts/src/collaboration.ts` — transition tables, readiness rule, schedule effect,
  counteroffer agreement rule, pause effects and notification honesty.
- `apps/api/src/modules/collaboration/` — service, controller, module.
- `collaboration-workspace.tsx` at `/collaboration`.

Existing discussion, question and revision records in `ProcurementService` are untouched.

## D. Database changes

Migration `20261028030000_collaboration` (additive, 9 tables, no `DROP`): `OrderDiscussion`,
`DiscussionMessage`, `ProductionException`, `ScheduleRevision`, `Counteroffer`, `AvailabilityPause`,
`SupportTicket`, `SupportTicketEvent`, `NotificationDelivery`.

## E. APIs

| Method | Route | Permission |
|---|---|---|
| GET | `/api/v1/collaboration` | scoped participant |
| POST | `/api/v1/collaboration/exceptions` | batch artisan, assigned coordinator or operator |
| POST | `/api/v1/collaboration/exceptions/:id` | assigned coordinator or operator |
| POST | `/api/v1/collaboration/schedule-revisions` | coordinator or operator |
| POST | `/api/v1/collaboration/schedule-revisions/:id/decision` | buying organization or platform admin |
| POST | `/api/v1/collaboration/counteroffers` | the offer's own artisan |
| POST | `/api/v1/collaboration/counteroffers/:id/review` | manager in the operator organization |
| POST | `/api/v1/collaboration/counteroffers/:id/accept` | the offer's own artisan |
| POST | `/api/v1/collaboration/availability/pause` \| `resume` | the artisan |
| POST | `/api/v1/collaboration/tickets` \| `/tickets/:id` | reporter; manage requires `support.case.manage` |
| POST | `/api/v1/collaboration/orders/:id/discussions` | order participant |
| POST | `/api/v1/collaboration/notifications/preferences` | self |

## F. Business rules

- Exception transitions: `OPEN → ACKNOWLEDGED | UNDER_REVIEW | CLOSED`; `ACKNOWLEDGED → UNDER_REVIEW |
  ACTION_REQUIRED | RESOLVED`; `→ CLOSED`; `CLOSED` is terminal.
- Readiness: an unresolved `MATERIAL_SHORTAGE` blocks only at `CRITICAL`; `PRODUCTION_DELAY` never blocks;
  other categories block at `CRITICAL`.
- Schedule: `effectiveDeadline = APPROVED ? proposed : previous`; `requiresBuyerApproval = deltaDays > 0`.
- Counteroffer: agreement exists only at `ARTISAN_ACCEPTED`.
- Pause: `blocksNewOffers = paused`, `preservesAcceptedCommitments = true`,
  `affectsFairnessEligibility = false`.

## G. Security

- Every mutation re-resolves membership and organization scope server-side; the client's view is never the
  authority.
- A counteroffer can only be created or finally accepted by the artisan holding the offer; a manager approval
  explicitly returns `createsAgreement: false`.
- A schedule extension can only be approved by the buying organization (or platform admin).
- Non-participants receive `404` for order resources.
- Internal discussion messages are filtered out of non-internal views.
- Notifications are only written for opted-in categories; no external channel claims delivery.
- Support requests are never read by any ranking function, so they cannot become an exclusion criterion.

## H. Tests

- `node --import tsx --test test/unit/collaboration.test.ts` — PASS, 7 tests covering exception lifecycle,
  readiness blocking, unapplied schedule change, counteroffer non-agreement, pause preservation, ticket
  lifecycle and notification honesty.
- Full API unit suite — PASS, 108 tests. `pnpm lint`, typechecks and `pnpm build` — PASS.

Not executable here: integration, browser and demo suites (no PostgreSQL/Docker; sandbox denies `tsx` IPC).

## I. Limitations

- Accepted counteroffer terms are not written back onto the offer automatically.
- Support attachments are evidence references, not uploaded files.
- Notification bodies are English only; no localised template catalogue exists.
- Illustrated work instructions (E19-01) reuse existing versioned text and captioned images only.

## J. Next readiness

Ready for owner review of exception handling, schedule approval gating, counteroffer voluntariness and
notification honesty. E04-07 and E19-01 remain partially implemented.
