# Batch 13 implementation backlog

28 October 2026 · Africa/Tunis. **Proposed scope: E18-06 / [#209](https://github.com/wie-challenge/website/issues/209) only.** Planning only; no code, schema, issue state or database has been changed. [Scope evidence and original criteria](scope-audit.md).

## Delivery objective and estimate

An authorized buyer with a confirmed receipt can submit a private structured assessment, correct it without replacing the original, and see permitted follow-up. An authorized support operator can assign follow-up and link a real existing formal case. The case retains its own lifecycle; feedback does not resolve money, delivery discrepancies or obligations.

Source priority **P2**, release **D**, source estimate **3 SP** remain unchanged. Recommended implementation priority: first within the proposed batch. Revised planning complexity: **8 SP**, approximately **5–8 engineering days including verification**, subject to team sizing. This estimate includes two tables, four mutation routes, two scoped read routes and integration into existing buyer/support screens. It excludes external policy review, actual customer recruitment and deployment.

Implement in the following order. Tasks are acceptance work under #209, not invented replacement backlog stories.

## 1. Define the structured contract and delivery eligibility

Complexity: moderate. Dependencies: E09-05 / #60 receipt authority; E14-03 / #181 claims authority; D13-02/D13-03.

- Extend [packages/contracts/src/collaboration.ts](../../../../packages/contracts/src/collaboration.ts) with strict creation/correction/follow-up/case-link schemas, response DTOs and a small feedback transition function. Export through the existing contracts index.
- Use an order, exact BuyerDeliveryConfirmation, category, optional integer rating 1–5, optional plain comment, server date, reporter, follow-up status/owner and version. IDs, provenance and authorization come from the server.
- Define eligibility as a confirmation on a shipment belonging to this order with **received > 0**. Partial receipt, damage and zero accepted pieces remain eligible. An all-missing delivery with received = 0 uses the existing claim workflow; it is not described as a delivered-order satisfaction assessment.
- Do not require full buyer acceptance, payment, financial closure or a positive rating. Operator delivery claims alone, QA approval or accepted quotes do not establish buyer receipt.
- Define one assessment per buyer participant per order; subsequent buyer changes append revisions. Other participating buyers may submit their own assessment.

Done when C1/C2/C3 contract semantics and their negative cases are explicit in shared schemas and meaningful unit tests.

## 2. Add minimal immutable feedback persistence

Complexity: moderate. Dependency: task 1.

- Add BuyerOrderFeedback and BuyerOrderFeedbackRevision to [schema.prisma](../../../../apps/api/prisma/schema.prisma); use the exact fields, constraints and scope described in [technical plan](technical-plan.md).
- Header pins order, reporter and receipt confirmation. Revision rows preserve structured content, actor, time, reason, follow-up snapshot and optional SupportTicket FK.
- Add one new forward migration only. Preserve all 36 existing migrations and every financial/consent/terms constraint; do not create a claims, settlement or CRM table.
- Add unique order/reporter and feedback/version constraints, rating/status checks, restrictive FKs and append-only protection. Header/current-version advancement must be atomic with revision and audit.
- Extend existing native migration/rollback/restore assertions to include empty and populated feedback history. Do not run migration against a persistent database.

Done when duplicate creates, stale versions, revision updates/deletes and failed writes leave no partial history.

## 3. Implement scoped feedback commands and existing-case linkage

Complexity: moderate/high. Dependencies: tasks 1–2.

- Extend [CollaborationService](../../../../apps/api/src/modules/collaboration/collaboration.service.ts) and [controller](../../../../apps/api/src/modules/collaboration/collaboration.controller.ts), reusing IAM transaction, Zod, audit, replay-safe commands and security middleware.
- Add explicit order/feedback authorization helpers. Existing collaboration access includes artisans/coordinators for other functions; do not reuse that broad orderIds set as buyer-feedback permission.
- Create/correct as the authorized buyer author; follow-up as same-operator support with support.case.manage plus current assignment to that buyer. Validate follow-up owners against the same scoped support authority.
- Expose status/history through paginated, bounded projections. An order-filtered read includes minimized eligible receipt IDs/counts/provenance; existing shipment summaries do not expose confirmation IDs. Buyer participants see their own assessment; support sees only authorized order assessments. Case detail visibility is checked independently.
- Link only a SupportTicket already related to the exact ORDER. Reuse the existing ticket creation, assignment, attachments, escalation and resolution controls. Feedback must never impersonate the buyer to create a ticket.
- Case linking requires authority to view both resources and manage the feedback follow-up; reporter-created cases and support-created cases retain their actual reporter identity. Link records create no settlement or quantity mutation.
- New feedback commands enqueue no external email/messages. Existing case notifications continue under existing explicit preferences.
- Extend the existing GovernanceService subject export and support-purpose inventory with the new feedback records, excluding internal notes and other participants' data; retain pending qualified policy review and no-purge behavior.

Done when C1–C5 cannot be bypassed by forged IDs, multi-organization membership, another buyer author, revoked assignment or idempotent replay.

## 4. Complete the buyer and support journey

Complexity: moderate. Dependency: task 3.

- Extend the existing RFQ/order workspace in [procurement.tsx](../../../../apps/web/src/components/procurement.tsx) at /procurement/:id using its orderId. Add a small feedback panel after the delivery section; do not create a new customer portal.
- Show receipt eligibility and existing assessment/history; preserve entered data on errors and retain idempotency key until a command succeeds. Render comments as plain text.
- Extend [collaboration-workspace.tsx](../../../../apps/web/src/components/collaboration-workspace.tsx) at /collaboration with a bounded feedback follow-up list, scoped owner selector and explicit existing-case link. Reuse the current ticket form for a new claim, then link its result. Leave /support/cases and its different legacy SupportCase model intact.
- Keep buyer comments/corrections separate from support follow-up notes; present claim status separately from feedback status.
- No public testimonial switch, showroom-wide review permission, commercial contact collection, attachments copied into feedback, or automatic outreach. Include synthetic/unverified source labels.
- Before writing frontend code, follow [web AGENTS.md](../../../../apps/web/AGENTS.md) and the relevant bundled Next.js documentation.

Done when a buyer and support user can complete the journey on mobile and desktop, including retries, empty states, keyboard use and accessible error messages.

## 5. Verify and assemble acceptance evidence

Complexity: moderate/high. Dependency: all prior tasks.

Required tests:

- **Units:** category/rating/comment validation, allowed follow-up transitions, eligibility boundaries and response minimization.
- **Real HTTP/disposable PostgreSQL:** authorized create/reload; partial/damaged receipt; no receipt; operator-only report; receipt from another order; forged organization/author; outsider/artisan/coordinator; revoked buyer membership and operator assignment; another buyer's private assessment; invalid owner; cross-order/private ticket; correction and original preservation.
- **Concurrency/idempotency:** parallel same-author creation yields one aggregate; same-key retry returns the original result; changed payload/same key conflicts; stale expectedVersion conflicts; simultaneous buyer correction/support update never loses either accepted revision; revocation serializes with writes.
- **Independent persisted results:** receipt lineage, revision actor/version/content, restrictive FK behavior, denied mutation counts and exact audit attribution. Feedback/case follow-up must leave payables, payment disputes, adjustments, receipt quantities and financial closure state unchanged.
- **Privacy integration:** subject export includes only that subject's permitted feedback/corrections, excludes internal notes and others' cases, honors current authority, and does not invent a deletion or retention policy.
- **Browser:** real buyer receipt → feedback → support assignment → existing claim link/status, mobile/desktop with axe; invalid submission, server failure/retry, forbidden reads and preserved drafts.
- **Regression:** extend collaboration/execution fixtures rather than rebuild commerce. Rerun A12-01/A12-02/A12-03 focused safeguards during implementation, native migration/populated-upgrade/restore checks, relevant units/browser tests, lint/typecheck/build, then one full regression on final implementation source. None is run as part of this planning audit.

Definition of Done: all five original #209 criteria have executable evidence; receipt/author/tenant boundaries hold; case history remains authoritative; no public disclosure or automatic financial consequence; schema upgrade/restore is demonstrated; documentation lists synthetic evidence and external gates. **Owner acceptance remains PENDING until separately given.**

## Excluded backlog and external decisions

- **#192 / E15-06:** deferred, despite P1 source priority, because demo learning is a separate journey. Keep the issue open and its release/priority unchanged.
- **#207 / E18-04:** deferred until recurring schedule/version/release provenance and mandatory finance-gate applicability are designed against #104/#42/#103.
- **#208 / E18-05:** deferred until cohort/expense attribution definitions and legitimate paid evidence are available. Existing intelligence is not an implementation of this story.
- No production use of real feedback before purpose/access, retention/correction, preservation and named privacy responsibilities receive qualified review under E14-09/#74. Software work with synthetic fixtures can proceed under future authorization without inventing those approvals.
- Actual recognition, invoice policy, verified settlement, lawful closure and E19-01 participant comprehension remain separate gates. This plan does not change any Batch 12 status.

Stop here. Implementation requires a subsequent owner instruction.

