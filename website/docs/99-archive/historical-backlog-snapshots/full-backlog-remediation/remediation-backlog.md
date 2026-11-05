# Remediation backlog

Checkpoint recorded 2026-10-30T18:11:54.018453+00:00. Owner acceptance **PENDING**. Verdict **PARTIALLY_COMPLETED / AUDIT_COVERAGE_INCOMPLETE**.

Finding states are bounded software scopes. Every original criterion below is retained. No GitHub or canonical backlog mutation is implied.

## FPA-01 — P1: Dedicated AI service cannot import its configured package

Issues [156]; state **VERIFIED_SOFTWARE**.

- Implementation: Choose one package namespace and update source layout/imports/build/ASGI/tests consistently.
- Required verification: Clean package build/install; collect and run tests; start container and exercise service-authenticated health/inference previews.
- Evidence: AI_SERVICE_VERIFICATION.md; evidence/ai-service/verification-summary.json
- Remaining verification: AI Docker image build/start unverified after prior pull timeout; trained/validated ML scope remains unmet; owner acceptance pending.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: ../ai-backend/pyproject.toml:27, ../ai-backend/Dockerfile:18, ../ai-backend/src/hirfacare_ai/main.py:3

Original E11-08 / #156:

- E11-08.C1: Consent, representative labels, baseline benchmark and monitoring required.
- E11-08.C2: Define representative consented training labels and exclude wearable/health inputs.
- E11-08.C3: Use time-aware evaluation or equivalent leakage controls and compare with deterministic baseline.
- E11-08.C4: Report errors, coverage and limitations by craft/context with sufficient samples.
- E11-08.C5: Monitor drift and provide deterministic fallback when evidence/confidence is insufficient.

## FPA-02 — P2: Production accepts non-enforcing Arcjet default

Issues [38, 78, 87]; state **VERIFIED_SOFTWARE**.

- Implementation: Require LIVE for production, or enforce a local rate floor even when external decisions are observational.
- Required verification: Production startup matrix and endpoint-level 429 under accepted defaults; test explicit observational nonproduction configuration.
- Evidence: evidence/checkpoint1.json; evidence/fpa02-http.log
- Remaining verification: Current full regression passed. Genuine Arcjet/deployment behavior and complete original #78/#87 acceptance remain unverified; #38 software criteria reviewed in checkpoint5.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/api/src/config/env.ts:58, apps/api/src/config/env.ts:104, apps/api/src/security/security.service.ts:55, apps/api/src/security/security.service.ts:147

Original E01-10 / #38:

- E01-10.C1: Protected session, revocation and brute-force protections tested; invalid credentials rejected without account enumeration.
- E01-10.C2: Authenticate approved accounts with protected credentials and generic failures.
- E01-10.C3: Document session expiry and enforce secure cookie/token validation.
- E01-10.C4: Rate-limit repeated failures and invalidate the relevant session on logout.
- E01-10.C5: Keep demo identities separate and reject expired/revoked sessions.

Original E16-05 / #78:

- E16-05.C1: Zod validation, rate limits, resource-level RBAC and error contracts.
- E16-05.C2: Validate payload/query schemas and return consistent safe errors.
- E16-05.C3: Enforce session, resource authorization and rate limits on authoritative NestJS endpoints.
- E16-05.C4: Secure any Next.js proxy/server boundary against unauthorized forwarding and CSRF where applicable.
- E16-05.C5: Reject unknown monitoring fields, invalid IDs and unbounded list/upload requests.

Original E01-07 / #87:

- E01-07.C1: Reset tokens expire, sessions revoked after reset as appropriate.
- E01-07.C2: Use neutral recovery responses regardless of account existence.
- E01-07.C3: Issue expiring single-use tokens and rate-limit requests/verification.
- E01-07.C4: Require appropriate identity verification for credential or sensitive-contact changes.
- E01-07.C5: Revoke affected sessions and notify through the approved channel.

## FPA-03 — P2: Synthetic-ready closure assessment conflicts with native CHECK

Issues [73]; state **VERIFIED_SOFTWARE**.

- Implementation: Align persisted status vocabulary with explicitly synthetic assessment semantics using an additive migration; retain all live closure gates.
- Required verification: Full HTTP assess/save/read flow, native statuses, rollback and all liability blockers; no real payment assertions.
- Evidence: evidence/checkpoint2-restore-verified.log; evidence/checkpoint2-browser-verified.json
- Remaining verification: Current full regression, native upgrade and restore pass. Actual legal/settlement/closure authorization remains blocked.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/api/src/modules/finance/finance.service.ts:1355, apps/api/src/modules/finance/finance.service.ts:1492, apps/api/prisma/migrations/20261027080000_financial_controls/migration.sql:113

Original E10-14 / #73:

- E10-14.C1: Closure blocks on unreconciled receivables, undisposed material costs, outstanding payables or open settlement disputes unless explicit authorized exception.
- E10-14.C2: Check buyer receivables, all artisan obligations, settlement disputes and material dispositions.
- E10-14.C3: Block closure when a required balance/evidence remains unresolved.
- E10-14.C4: Require a documented authorized and lawful disposition for any exception without erasing liability history.
- E10-14.C5: Record closure checklist, actor, time and ledger snapshot atomically.

## FPA-04 — P2: Incomplete observed hours produce an available hourly rate

Issues [176]; state **VERIFIED_SOFTWARE**.

- Implementation: Require complete, nonoverlapping, consented time coverage for full compensation, or allocate compensation to precisely matched observed scope.
- Required verification: Null/zero/overlap/partial-unit time cases at service and API; reporting UI unknown-state coverage.
- Evidence: evidence/calculations/result.json; evidence/checkpoint2-http.log
- Remaining verification: Current regression passed; genuine consent lifecycle, production-time withdrawal workflow and complete original reporting/operational acceptance remain unverified.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/api/src/modules/intelligence/intelligence.service.ts:581, apps/api/src/modules/intelligence/intelligence.service.ts:616, packages/contracts/src/intelligence.ts:525

Original E13-04 / #176:

- E13-04.C1: Missing hours marked unknown, never assumed zero.
- E13-04.C2: Separate agreed/earned/paid compensation in earnings reports.
- E13-04.C3: Use consented observed hours with task/unit context and explicit reporting window.
- E13-04.C4: Mark missing/zero-invalid hours as unknown and distinguish estimated from observed effort.
- E13-04.C5: Restrict individual earnings to authorized users and publish only safe aggregates.

## FPA-05 — P2: Passed deadlines remain merely at risk for up to one day

Issues [152]; state **VERIFIED_SOFTWARE**.

- Implementation: Compare timestamps for overdue; round only presentation durations.
- Required verification: Before/equal/after deadline by one millisecond, within 24 hours, approved schedule replacement and Tunis boundary cases.
- Evidence: evidence/calculations/result.json; evidence/checkpoint2-http.log
- Remaining verification: Current full regression passed. Original whole-story/owner and genuine operational outcome acceptance remain separate.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: packages/contracts/src/intelligence.ts:100, packages/contracts/src/intelligence.ts:118

Original E11-04 / #152:

- E11-04.C1: Thresholds tested against recorded progress, no fake ML accuracy.
- E11-04.C2: Use recorded progress, deadline, exceptions and data staleness with versioned thresholds.
- E11-04.C3: Explain triggering facts and distinguish unknown from low risk.
- E11-04.C4: Show time of evaluation and appropriate intervention owner.
- E11-04.C5: Validate rules against recorded examples and avoid unsupported ML accuracy claims.

## FPA-06 — P2: Reallocation never computes replacement delivery feasibility

Issues [116]; state **VERIFIED_SOFTWARE**.

- Implementation: Connect replacements to documented deterministic feasibility inputs and preserve the evaluated snapshot/reason; retain unknown for insufficient input.
- Required verification: Known-feasible, known-infeasible, insufficient inputs, nonempty candidates and accepted-work invariants.
- Evidence: evidence/checkpoint3/fpa06/README.md
- Remaining verification: Current full regression and all five #116 software criteria verified. Owner acceptance and genuine operational approval remain pending.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/api/src/modules/procurement/planning.ts:418, apps/api/src/modules/procurement/planning.ts:913, apps/api/test/planning-intelligence.scenarios.ts:808

Original E05-05 / #116:

- E05-05.C1: Capacity released and replacements tracked with audit trail.
- E05-05.C2: Return declined/expired quantities to replanning with history.
- E05-05.C3: Release corresponding tentative capacity only.
- E05-05.C4: Recompute candidates and delivery feasibility for replacements.
- E05-05.C5: Link replacement reasons without penalizing the original artisan.

## FPA-07 — P2: Buyer-feedback edit after lost response traps retries

Issues [209]; state **VERIFIED_SOFTWARE**.

- Implementation: Retain immutable submitted payload with its key; recover it, refresh authoritative state/version, then allow fresh edited intent.
- Required verification: Both operations at both widths; committed/uncommitted response loss, editing, repeated retry, reload and accessibility announcements.
- Evidence: evidence/checkpoint3/fpa07/result.json
- Remaining verification: Current full regression and all five #209 software criteria verified. Owner acceptance pending; no public testimonials or real collection approval.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/web/src/components/order-feedback.tsx:48, apps/web/src/components/order-feedback.tsx:147, apps/web/src/components/order-feedback.tsx:180

Original E18-06 / #209:

- E18-06.C1: Feedback tied to delivered order and permission-scoped, with dispute status and follow-up owner.
- E18-06.C2: Link feedback to delivered order and authorized buyer participant.
- E18-06.C3: Record rating/category, comments, date, follow-up owner and status.
- E18-06.C4: Keep claims/disputes distinct from informal feedback and link formal cases.
- E18-06.C5: Restrict visibility and prevent publication/testimonials without specific permission.

## FPA-08 — P2: Collaboration creation workflows are disconnected from UI

Issues [112, 121, 122]; state **VERIFIED_SOFTWARE**.

- Implementation: Add scoped creation and preview flows, preserving downstream approval authority and original terms.
- Required verification: Start from empty state without direct API seeding for the action under test; valid, denied, stale and declined-change browser cases.
- Evidence: evidence/checkpoint3/fpa08/
- Remaining verification: Creation defect repaired and full regression passed. #112 tentative-capacity comparison, #121 opted-in coordinator notification delivery, and #122 nonempty unresolved-risk rejection assertion remain criterion verification gaps.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/web/src/components/collaboration-workspace.tsx:102, apps/web/src/components/collaboration-workspace.tsx:177, apps/web/src/components/collaboration-workspace.tsx:254, apps/api/src/modules/collaboration/collaboration.controller.ts:68

Original E04-07 / #112:

- E04-07.C1: No automatic acceptance; manager must approve modified terms.
- E04-07.C2: Propose quantity/deadline changes before acceptance.
- E04-07.C3: Show resulting pay, effort and material implications.
- E04-07.C4: Require manager review and new issued terms before artisan acceptance.
- E04-07.C5: Do not start production or reserve extra capacity merely on counteroffer.

Original E06-05 / #121:

- E06-05.C1: Exception visible to assigned coordinator; resolution logged.
- E06-05.C2: Link shortage/delay reports to the artisan's batch.
- E06-05.C3: Record affected quantity/date, requested help and optional evidence without health disclosure.
- E06-05.C4: Notify responsible coordinator and show open/acknowledged/resolved state.
- E06-05.C5: Attribute resolution without silently altering contract or pay.

Original E06-06 / #122:

- E06-06.C1: Change impact shown and affected parties approve revised commitments.
- E06-06.C2: Show impact on buyer deadlines, capacity, materials and transport.
- E06-06.C3: Preserve original/proposed dates and reason.
- E06-06.C4: Require affected-party approvals before contractual changes.
- E06-06.C5: Retain unresolved risk and communicate declined changes.

## FPA-09 — P2: Preferred-language offer decisions are not implemented

Issues [44]; state **PARTIAL**.

- Implementation: Provide reviewed translations for offer terms and decisions with safe fallback and explicit unavailable-state handling.
- Required verification: French/Arabic preferred-language complete decision and clarification flows, RTL, keyboard and screen-reader checks.
- Evidence: evidence/checkpoint3/fpa09/result.json
- Remaining verification: Software infrastructure/gate and current regression pass. Qualified FR/AR commercial translation review and direct approved-specification commerce projection assertion remain outstanding.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/web/src/components/commerce-workspace.tsx:854, apps/web/src/components/artisan-workspace.tsx:153, tests/e2e/production.spec.ts:97

Original E04-02 / #44:

- E04-02.C1: Offer includes quantity, estimated hours, rate, total agreed pay, deadline, craft specifications, material responsibility, payment conditions and ability to decline without penalty.
- E04-02.C2: Show quantity, effort range, rate, total pay, deadline and specification version.
- E04-02.C3: Include materials, quality/rework rules, payment conditions and expiry.
- E04-02.C4: Provide accept/decline/clarification in supported preferred language.
- E04-02.C5: Make all terms readable before decision and state no penalty for decline or wearable refusal.

## FPA-10 — LOW: Database does not independently bind status header to latest history

Issues [192]; state **NOT_STARTED**.

- Implementation: Consider a deferred invariant or controlled database write function; preserve migration history.
- Required verification: Native mismatch must reject at commit; valid transactional updates and rollback remain supported.
- Evidence: evidence/
- Remaining verification: Deferred native correspondence hardening; see evidence/checkpoint4/low-hardening-decision.md.
- External gate: Owner acceptance PENDING; original qualified legal/privacy/settlement/model-data approvals remain separately required
- Affected sources: apps/api/prisma/migrations/20261028170000_demo_feedback/migration.sql:69, apps/api/src/modules/demo/demo-feedback.admin.ts:125

Original E15-06 / #192:

- E15-06.C1: Shared database, input validation and abuse controls required.
- E15-06.C2: Capture permitted participant, relevant screen/story, category, comment and status.
- E15-06.C3: Persist feedback in shared storage with validation and abuse/rate limits.
- E15-06.C4: Restrict viewing/moderation to intended team scope.
- E15-06.C5: Display submission errors and preserve attributable moderation history.

## B14-GET-POST-RATE-LOW — LOW: Feedback GET shares submission bucket

Issues [192]; state **NOT_STARTED**.

- Implementation: Track separately after P1/P2 and native history hardening; preserve dedicated POST abuse limits
- Required verification: Read/write bucket independence and visitor/IP abuse control
- Remaining verification: Deferred independent GET/POST budgets; dedicated POST 429 remains verified. See evidence/checkpoint4/low-hardening-decision.md.
- External gate: Owner acceptance PENDING
- Affected sources:

## CP5-G01 — P2: Accountless authorization validity period is not represented

Issues [85]; state **NOT_STARTED**.

- Implementation: Design a separately scoped additive validity-period/history change and enforce expiry on accountless assisted operations.
- Required verification: Focused positive, denied, boundary, attribution and preserved-history assertions matching the original criterion.
- Evidence: evidence/checkpoint5/README.md
- Remaining verification: Source/contract gap recorded; implementation deliberately deferred after the bounded five-story verification group.
- External gate: Owner acceptance PENDING; genuine authorization-method, language and privacy review remains required.
- Affected sources: packages/contracts/src/foundation.ts:12, apps/api/prisma/schema.prisma:486, apps/api/prisma/schema.prisma:1114, apps/api/src/modules/registry/registry.service.ts:70, apps/api/src/modules/registry/registry.service.ts:89, apps/api/src/modules/artisans/artisans.service.ts:42, apps/web/src/components/foundation-workspace.tsx:113

Original E01-05 / #85:

- E01-05.C2: Record artisan, helper, allowed actions, consent method and authorization period.

## CP5-G02 — LOW: Contact visibility choice lacks audience explanation

Issues [84]; state **NOT_STARTED**.

- Implementation: Explain actual recipients and sharing consequences without enabling new disclosure, then verify editable corrections and visibility.
- Required verification: Focused positive, denied, boundary, attribution and preserved-history assertions matching the original criterion.
- Evidence: evidence/checkpoint5/README.md
- Remaining verification: Source/contract gap recorded; implementation deliberately deferred after the bounded five-story verification group.
- External gate: Owner acceptance PENDING; genuine authorization-method, language and privacy review remains required.
- Affected sources: packages/contracts/src/artisans.ts:13, apps/api/src/modules/artisans/artisans.service.ts:150, apps/api/src/modules/registry/registry.service.ts:347, apps/web/src/components/artisan-workspace.tsx:113

Original E01-03 / #84:

- E01-03.C3: Explain visibility and allow correction before submission.
