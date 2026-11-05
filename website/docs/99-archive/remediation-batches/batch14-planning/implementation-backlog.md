# Batch 14 implementation backlog

28 October 2026 · Africa/Tunis. **Proposed scope: E15-06 / [#192](https://github.com/wie-challenge/website/issues/192) only.**
Planning only; no code, schema, migration, database or GitHub state was changed by this audit. Original
criteria and evidence: [SCOPE_AUDIT.md](scope-audit.md). Design: [TECHNICAL_PLAN.md](technical-plan.md).

## Delivery objective and estimate

A showroom visitor can leave one or more structured, valid feedback entries about a synthetic
demonstration, with the screen/story and category they choose, persisted in shared storage and
rate-limited. A real authorized team reviewer can triage those entries from a scoped inbox and every
status change is attributed and preserved. A reset archives the scenario without destroying or
cross-exposing feedback. Nothing becomes a customer review, a claim, a testimonial or a public rating.

Source priority **P1**, release **C**, source estimate **5 SP** unchanged. Revised planning complexity
is **8 SP**, roughly **4-6 engineering days including verification**. It excludes real participant
recruitment, research analysis and any external policy review.

Implement in the following order. Tasks are acceptance work under #192, not invented replacement
stories.

## 1. Shared contracts and closed vocabularies

Complexity: low. Dependencies: none.

- Extend [packages/contracts/src/demo.ts](../../../../packages/contracts/src/demo.ts) with
  demoScreenKeys, demoFeedbackCategories, demoFeedbackStatuses, the transition helper, the provenance
  label helper, demoFeedbackCreateSchema, demoFeedbackDecisionSchema, demoFeedbackQuerySchema,
  demoFeedbackHistoryQuerySchema and the response DTOs. Export through the existing contracts barrel.
- screenKey must be a closed enum covering the showroom overview, the stage progress section, each
  id in [presentationScenes](../../../../apps/web/src/lib/presentation-scenes.ts) and the persona
  workspaces. Do not accept arbitrary strings.
- Strict objects: reject visitorId, sourceClass, status, generation and createdAt. Comment max 2000,
  note max 1000. Mandatory reason on the modifier for ACTIONED and DISMISSED, enforced in the service
  (not silently defaulted).
- Pure transition helper: NEW to TRIAGED to ACTIONED or DISMISSED; TRIAGED back to NEW; terminal
  ACTIONED and DISMISSED. Unit-test every pair, not only the happy path.

Done when the vocabulary, validation and transition rules are explicit in shared schemas with
meaningful unit tests, including forged-field rejection.

## 2. Minimal additive persistence

Complexity: moderate. Dependency: task 1.

- Add DemoFeedback and DemoFeedbackEvent to [schema.prisma](../../../../apps/api/prisma/schema.prisma)
  with the fields, constraints and indexes in the technical plan.
- One forward migration only, next valid timestamped directory after the existing 37. Preserve all
  historical migrations, financial constraints and the Batch 13 feedback tables untouched.
- Native guarantees: restrictive FKs, CHECK constraints for sourceClass/screenKey/category/status/
  generation/lengths, partial unique (scenarioId, visitorId, dedupeKey) where the key is not null,
  append-only trigger on DemoFeedbackEvent, and a guard permitting only status to change on
  DemoFeedback after insert.
- Status write and event insert must be atomic.
- Add a named relation distinct from Batch 13's BuyerFeedbackScenario to avoid Prisma relation
  ambiguity on DemoScenario.
- Extend the native migration/upgrade/restore harness with empty and populated feedback plus history.

Done when duplicate creation, invalid enum values, revision UPDATE and DELETE, failed transaction
rollback and populated upgrade are all rejected or preserved correctly on disposable PostgreSQL.

## 3. Visitor capture API and abuse controls

Complexity: moderate/high. Dependencies: tasks 1-2.

- Extend [demo.controller.ts](../../../../apps/api/src/modules/demo/demo.controller.ts) and
  [demo.service.ts](../../../../apps/api/src/modules/demo/demo.service.ts). Reuse DemoService.control's
  visitor proof, the fixed transaction lock order and the existing idempotency patterns.
- POST /api/v1/demo/feedback and GET /api/v1/demo/feedback as specified. Resolve visitor identity only
  from the HttpOnly cookie; never from the body.
- Verify scenario ownership (scenario.visitorId equals the resolved visitor) before insertion and on
  every read. A scenario belonging to another visitor is 404.
- Enforce a per-visitor-per-scenario cap in addition to the rate bucket, and support an optional
  dedupeKey.
- Add a dedicated feedback rate policy to [policies.ts](../../../../apps/api/src/security/policies.ts) and
  the PolicyName union, with env-configurable max and window and a conservative default. Do not add a
  second limiter datastore.
- Replay safety: a same-key replay returns the original result only after re-checking current visitor
  authority.
- No external email, message or webhook.
- Audit: capture is not an audit action per submission (volume); moderation is. Do not log comment
  bodies in structured logs.

Done when forged identity, forged scenario, cross-visitor writes, duplicate submissions, flooding and
CSRF failure are all denied with zero rows written.

## 4. Moderator API

Complexity: moderate. Dependency: task 3.

- New controller (or an admin section on the demo controller) protected by @AdminOnly and
  PolicyService.requireAdmin inside the transaction, matching
  [participant-concerns.controller.ts](../../../../apps/api/src/modules/registry/participant-concerns.controller.ts).
- GET list with status and category filters and page/pageSize, GET detail with ordered history,
  PATCH status with expectedStatus, GET summary counts.
- Guarded transition so two reviewers cannot both win from one prior state; the loser receives 409
  STALE_STATUS.
- Append a DemoFeedbackEvent for every accepted change and write an AuditEvent with action, actor,
  target ids, from/to status and reason classification but no comment body.
- Archived scenarios are fully reviewable; nothing is filtered to ACTIVE only.

Done when a plain user, an artisan and the synthetic support persona are all denied, and moderation
history survives every transition attempt.

## 5. Visitor feedback UI

Complexity: moderate. Dependency: task 3. Read [apps/web/AGENTS.md](../../../../apps/web/AGENTS.md) and the
relevant bundled Next.js documentation before writing frontend code.

- Extend [demo-showroom.tsx](../../../../apps/web/src/components/demo-showroom.tsx) with a Share feedback
  disclosure near the stage progress. Category, screen/story, optional comment with maxLength and count.
- Rename or scope the existing transient feedback string state so it is never confused with real
  submissions.
- Extend [demo-api.ts](../../../../apps/web/src/lib/demo-api.ts) with a feedback operation that carries the
  X-Demo-CSRF proof and a retained idempotency key.
- Preserve the draft and key on failure; distinguish unavailable-and-retry from invalid; show a
  provenance-honest confirmation; list the visitor's own recent feedback for this scenario.
- State plainly that the submission is not customer satisfaction, verified evidence or publication.
- Accessible labels, keyboard operation, error association, mobile layout.

Done when a visitor can submit, see it persisted after reload, correct a validation error and retry a
failed request without losing text.

## 6. Moderator review UI

Complexity: moderate. Dependency: task 4.

- New admin page following the existing `/admin/participant-concerns` page at
  `apps/web/src/app/(protected)/admin/participant-concerns/page.tsx`
  and add a navigation entry in [app-navigation.ts](../../../../apps/web/src/lib/app-navigation.ts).
- Inbox table with filters, detail with full comment and ordered attributed history, status control that
  requires a note for ACTIONED and DISMISSED and posts expectedStatus.
- Provenance label on every row; seeded synthetic rows visually distinct from visitor submissions.
- No free-text search over comments in the first increment; no export.

Done when a reviewer can triage end to end on mobile and desktop with an accessible, attributable
history.

## 7. Governance and privacy integration

Complexity: low/moderate. Dependencies: tasks 2-4.

- Add a RETENTION_INVENTORY class for visitor demonstration feedback in
  [retention.ts](../../../../apps/api/src/modules/governance/retention.ts) with purpose, access roles,
  trigger and preservation reason, retentionDuration null and PENDING_QUALIFIED_POLICY_REVIEW. Do not
  reuse the DEMO_SYNTHETIC trigger wording, which implies deletion on reset.
- Keep purge disabled. Invent no duration, legal basis or deletion schedule.
- Document explicitly why an anonymous visitor cannot be linked into a subject export, rather than
  fabricating a link. If a future authenticated demonstration account exists, revisit this.
- Confirm no feedback content enters public traceability, the presentation deck or any evidence page.

Done when the inventory reflects the new class, review status is unchanged as pending, and no public
surface exposes a comment.

## 8. Security and abuse test suite

Complexity: high. Dependency: tasks 3-4.

Extend [apps/api/test/demo.scenarios.ts](../../../../apps/api/test/demo.scenarios.ts) rather than creating
a new framework. Cover the full HTTP/PostgreSQL list in the technical plan: valid submission, invalid
category, oversized comment, invalid screen, forged visitor, forged scenario, cross-visitor scenario,
duplicate, cap, rate limit with Retry-After, CSRF failure, cross-visitor read, unauthorized moderator
(plain user, artisan, synthetic support persona), moderation transition, history preservation, reset
without data loss, reset without cross-generation disclosure, source provenance, and expiry producing a
fresh identity.

Concurrency: parallel submissions, duplicate keys, changed payload same key, simultaneous moderation
actions, stale status.

Also assert independent database state: denied requests write zero rows, moderation events are
append-only, and no BuyerOrderFeedback, SupportTicket, SupportCase, payable, adjustment, dispute or
receipt row changes.

## 9. Browser and accessibility tests

Complexity: moderate. Dependency: tasks 5-6.

Extend [tests/demo-e2e/showroom.spec.ts](../../../../tests/demo-e2e/showroom.spec.ts) and add a moderator
journey. Cover the form, validation errors, submission confirmation, failed request and retry with a
preserved draft, mobile 390x844 and desktop 1280x900, axe on main with zero violations, horizontal
overflow, keyboard-only submission, moderator list/detail/transition, and reset followed by team review
of archived feedback with a second visitor unable to see it.

## 10. Verification and evidence

Complexity: moderate/high. Dependency: all prior tasks.

Required: contracts units, extended demo integration scenarios, concurrency cases, browser journeys,
native migration plus populated upgrade plus restore, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
`git diff --check`, and one full regression on final source. Recheck Batch 13 buyer-order feedback
isolation, Batch 12 closure and funding, persona isolation and governance restrictions. Store logs under
`docs/engineering/evidence/batch14/`.

Definition of Done: all five original #192 criteria have executable evidence; visitor isolation and
reset preservation hold; moderation is ADMIN-only and fully attributed; no synthetic row is promoted to
real evidence; schema upgrade and restore are demonstrated; documentation labels synthetic evidence and
external gates. **Owner acceptance remains PENDING until separately given.**

## Excluded backlog and external decisions

- **E18-04 / #207:** deferred. Recurring agreements need versioned term/schedule and mandatory
  finance-gate applicability; unrelated to showroom feedback.
- **E18-05 / #208:** deferred. Acquisition and retention analytics need cohort and expense-definition
  authority and legitimate paid evidence.
- **E15-06 attachments, threaded replies, email notifications, public testimonials, comment search and
  export:** out of scope for this increment.
- No production collection of real visitor feedback at scale before the E14-09 / #74 qualified privacy
  review. Synthetic fixtures and disposable databases are sufficient for software work.
- Actual recognition, invoice policy, verified settlement, lawful closure and E19-01 participant
  comprehension remain separate gates.

Stop here. Implementation requires a subsequent owner instruction.
