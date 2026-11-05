# Batch 13 technical plan

28 October 2026 · Africa/Tunis. **Design only: E18-06 / #209.** No product code or migration is included in this audit. Scope and estimate are in [SCOPE_AUDIT.md](scope-audit.md) and [IMPLEMENTATION_BACKLOG.md](implementation-backlog.md).

## Architecture and authority

Extend the existing collaboration module; do not introduce a customer-success microservice, CRM, ledger or claims platform.

- **CommercialOrder → RFQ → organizations** supplies immutable order identity and tenant relationships.
- **Shipment → BuyerDeliveryConfirmation** supplies actual recorded buyer receipt and its provenance. Eligibility uses received > 0, not CommercialOrder.delivered (accepted-piece projection), order status, QA alone or accepted quotation.
- **CollaborationService** owns structured feedback and append-only follow-up/correction history. New helpers narrow authorization to buyers and explicitly scoped support operators.
- **SupportTicket / SupportTicketEvent** remain the E14-03 order-related claim authority. Feedback links to cases; case lifecycle and financial remedies remain separate.
- **Existing foundation/security** supplies active-session checks, organization grants, audit attribution, idempotency, shared database rate limiting and fixed transaction locks.
- **FinanceService** remains the closure authority. ProcurementService.accept remains the funding/quote authority. No feedback endpoint writes to either authority's state.

There are already two support concepts in the repository: legacy **SupportCase** at /support/cases (GovernanceService, subject/description/user scope), and order-aware **SupportTicket** at /collaboration (relatedType/relatedId, detailed event/attachment lifecycle). Reuse the latter for #209. Do not create a third case system, mirror cases between them or point a SupportTicket link at a SupportCase ID. Leave the legacy workflow intact.

### Why new feedback records are necessary

OrderDiscussion stores conversation text; SupportTicket stores a claim/assistance request. Neither supplies a receipt-bound satisfaction assessment with rating/category, buyer-owned corrections and independently assigned follow-up. Encoding these in free text or opening a ticket for every rating would invent claims from informal feedback. Two small records inside the existing collaboration domain are the minimum typed distinction.

## Proposed additive schema

Names below are proposed, not existing Prisma models.

**BuyerOrderFeedback**: id; orderId FK CommercialOrder; reporterId FK User; receiptConfirmationId FK BuyerDeliveryConfirmation; sourceClass (DEMO_USER_SUBMITTED, OPERATIONAL_USER_SUBMITTED, SYNTHETIC_SEEDED); scenarioId nullable FK DemoScenario; createdAt; currentVersion (starts at 1). Unique (orderId, reporterId). Order, reporter, receipt, source and creation time are immutable. Buyer/operator organizations are derived through order.rfq, never accepted from input or duplicated as a second customer identity. Derive source/scenario server-side; seed-only classification is unavailable through public inputs. User-submitted does not independently prove a real human or an actual purchase.

**BuyerOrderFeedbackRevision**: id; feedbackId FK; version; actorId FK User; createdAt; kind (SUBMITTED, BUYER_CORRECTION, FOLLOW_UP, CASE_LINK); category (OVERALL, QUALITY, DELIVERY, COMMUNICATION); rating nullable integer 1–5; comment plain text up to 2,000 characters; followUpStatus (OPEN, FOLLOW_UP, RESOLVED); followUpOwnerId nullable FK User; followUpNote up to 2,000; linkedTicketId nullable FK SupportTicket; reason (required for later revisions). Each row is a complete typed snapshot, not a JSON patch. Initial status OPEN, owner/case null; timestamps and actor come from the server.

- Unique (feedbackId, version), positive versions, checks for category/rating/status; FOLLOW_UP requires an owner and RESOLVED requires a reason.
- Restrictive FKs; append-only UPDATE/DELETE rejection on revisions; header trigger rejects identity/receipt changes. No cascading erasure.
- Header/currentVersion changes, inserted revision, replay receipt and minimized audit event commit together. Do not use updatedAt as contractual event time.
- Check receipt.shipment.orderId == header.orderId and received > 0 inside the same IAM transaction before creation. Receipt records remain immutable. Never trust a client-supplied receipt/order pairing.
- Linked ticket must have relatedType ORDER, relatedId equal to feedback.orderId, organizationId equal to order.rfq.operatorOrganizationId, and be visible to the linking actor. Cross-organization/cross-order links fail before insertion. FK alone is insufficient for this polymorphic existing ticket model.
- Index header (orderId, createdAt, id), header (reporterId, createdAt), and revision (feedbackId, version). Follow-up views use latest versions; no analytical or financial projection table is required.

At most one primary case link per assessment. Its case status is read from SupportTicket, not copied into feedback status. Additional claims remain visible through the existing ticket workflow under its own authorization. A later case-link correction appends a reasoned revision and preserves the old FK in history.

## API and shared contracts

Extend existing collaboration controller/service and packages/contracts/src/collaboration.ts; retain existing ZodValidationPipe, Actor, resourceId validation and Idempotency-Key convention.

| Proposed route | Purpose / input |
|---|---|
| GET /api/v1/collaboration/order-feedback | Bounded current assessments, optional orderId filter, page/pageSize; exact buyer/support row scope; with an authorized order filter, include minimized eligibleReceipts metadata |
| GET /api/v1/collaboration/order-feedback/:id/history | Separately authorized, paginated revisions; do not return unrestricted case notes |
| POST /api/v1/collaboration/orders/:id/feedback | receiptConfirmationId, category, optional rating/comment |
| POST /api/v1/collaboration/order-feedback/:id/corrections | expectedVersion, category/rating/comment, reason; buyer author only |
| POST /api/v1/collaboration/order-feedback/:id/follow-up | expectedVersion, status, optional ownerId, note/reason; scoped support only |
| POST /api/v1/collaboration/order-feedback/:id/case-link | expectedVersion, existing ticketId, reason; scoped support and independent ticket access |

All six routes are new. Claims continue through the existing POST /api/v1/collaboration/tickets and existing ticket update/correction/attachment routes. A “Create claim” action uses that explicit flow, preserving the actual reporter, then an authorized support actor links the returned ticket. Two steps are honest: if linking fails, the real case remains and linking can be retried. Do not call a transaction-wrapping service from inside another IAM transaction.

Use strict input objects. Unknown entity/scope → 404; known resource without mutation authority → 403; invalid payload → 400; absent receipt eligibility, duplicate aggregate, stale version, changed-payload replay or invalid state transition → 409; rate limit → 429 with Retry-After. Own previous assessment remains readable through the scoped API; duplicate creation is a correction action, not silently replaced content.

Pagination defaults to 20, maximum 50, stable createdAt/id ordering; history orders by version. List DTOs exclude email, telephone, beneficiary data, worker financial detail and arbitrary audit payloads. History distinguishes buyer comments from internal follow-up notes.

## Authorization and disclosure rules

No new business role is necessary. Reuse existing grants on active approved memberships, but evaluate them against the specific order and organization, not the union of every role on the actor.

- **Buyer submission/correction:** active BUYER_BUSINESS membership in this order's buyer organization, buyer.delivery.confirm grant and current active session. Corrections additionally require reporterId == actor.id. Another buyer cannot rewrite an assessment.
- **Buyer reading:** own reporterId plus current buyer.rfq.read in the same buyer organization. Other employees do not automatically see private assessments or the reporter's formal case.
- **Operator review/follow-up:** active INTERNAL membership in this order's operator organization with support.case.manage, plus unrevoked OperatorAssignment for this buyer. Read and manage share this narrow scope. Plain production, finance, sales or organization membership is insufficient.
- **Assignment:** choose only an active same-operator support manager with a current buyer assignment. Existing admin assignment provisioning requires an operational identity; use an explicitly support-authorized NASJ_OPERATOR (or equivalent existing multi-role membership), not an assumed ability to assign a bare SUPPORT account. Do not change default role grants or add new privileges to make the selector work.
- **Formal case:** enforce existing ticketAccess separately; record a case link only when both feedback and ticket are authorized. Render the linked case's status/details only to ticket-authorized actors. A feedback projection is never an authorization shortcut. Buyer-facing history omits internal follow-up notes and inaccessible case identifiers.
- **Artisans/coordinators/outsiders:** deny feedback reads/writes even if collaboration.access currently permits their order discussions. No broad platform-role bypass is introduced; governance access needs its existing explicit audited authority.
- **Showroom:** authenticated persona sessions still require the existing visitor cookie, active scenario/generation and assertDemoSession boundary. Access to one visitor's synthetic buyer/support roles never yields another visitor's feedback or real customer assessments.

All corrections/history respect immediate revocation. Audit stores action, actor, organization, feedback/version/source IDs and reason classification, not private comment bodies in logs.

No public feedback API, testimonial publishing, public traceability inclusion, marketing permission or automatic external message is included. A future publication feature needs specific permission under its own backlog authority.

## Data flow and state behavior

1. Buyer confirms receipt via the existing logistics authority. A report of delivery without confirmation is insufficient for satisfaction eligibility.
2. RFQ detail already supplies orderId. The filtered feedback read returns eligibleReceipts (confirmationId, shipmentId, received, provenance), derived directly from existing buyer confirmations on this order. Exclude receipt notes and other actors' details. Do not require a LogisticsService mutation or duplicate shipment authority; current shipment summaries omit confirmation IDs, so this small read projection is necessary.
3. Creation rechecks membership, receipt lineage and uniqueness under IAM transaction, appends version 1, audits and persists its idempotency receipt.
4. A buyer correction copies the latest support fields and replaces only buyer-owned assessment fields in version N+1.
5. A support follow-up copies buyer-owned fields unchanged, validates the assigned owner and appends a revision. OPEN → FOLLOW_UP/RESOLVED; FOLLOW_UP → OPEN/RESOLVED; RESOLVED → FOLLOW_UP requires a reason. Owner/note changes within a status remain versioned.
6. Support may explicitly link a matching formal ticket. Read its live claim status only through existing case visibility. A resolved feedback follow-up cannot close a case; a resolved case cannot imply financial settlement or auto-close the order.
7. Histories retain original content and distinguish submitted/corrected statements from support action and formal remedies.

Partial/damaged receipts remain eligible when received > 0, including accepted = 0. Total nonreceipt uses claims immediately; do not make the satisfaction eligibility rule prevent opening a legitimate missing-delivery case.

## Frontend changes

- /procurement/:id: extend components/procurement.tsx, beside existing LogisticsOrder, with a small reusable buyer-feedback panel. Use confirmed receipt rather than delivered/accepted totals. No new customer dashboard or navigation category is needed.
- /collaboration: extend components/collaboration-workspace.tsx with support feedback/follow-up views; reuse TicketSection and existing claim actions. **Do not wire this to /support/cases**, which uses the different legacy SupportCase model.
- Show category, optional rating/comment, server date, author-safe correction history and allowed follow-up status. Do not display private support notes to buyers.
- Forms preserve draft input/idempotency key through failures, disable duplicate pending submission, reload on version conflicts without losing unsent text, and offer accessible labels/status/errors.
- Mobile/desktop browser coverage uses real API sessions, plus axe and keyboard checks. Render plain React text; no rich HTML or new upload handler. A claim's attachments stay in the existing inspected/re-encoded support attachment flow.

User-submitted feedback on synthetic scenarios is opinion about a demonstration; it is distinct from SYNTHETIC_SEEDED feedback. Retain the header's server-derived source/scenario fields in DTOs/audit. No label proves a real purchase, verified product satisfaction, revenue or payment. An operational submission on a synthetic order must still disclose that order's synthetic provenance.

## Transactions, migration and verification

Reuse iamTransaction's locks **724631902 → 724631903**. Every helper accepts the supplied Prisma transaction; no nested transaction, SMTP/provider call or reversed lock acquisition. Recheck current authority before replay lookup. For a new command, check expectedVersion inside the replay-safe callback before inserting a revision; a successful-key replay must still return its original result after later revisions, while revoked authority is denied. Existing SecurityService/RateBucket covers external API requests; add a feedback-write actor/resource bucket using the same authority if existing global limits are too broad. Do not add a second limiter datastore.

Create one new migration only during authorized implementation. It creates empty additive tables and protective constraints; no historical feedback is inferred from discussions, receipts or claims. Regenerate Prisma/contracts, verify normal migration and populated upgrade in disposable PostgreSQL, and extend restore comparison to populated feedback/version rows. Rollback is application rollback with the additive data retained; no destructive down migration or persistent reset.

Required new scenarios and their fixtures are listed in [backlog task 5](implementation-backlog.md). Extend apps/api/test/collaboration.scenarios.ts and execution.scenarios.ts for real receipt/claim reuse; tests/e2e/collaboration.spec.ts and existing buyer logistics journeys for the UI. Integrate native constraints into existing migration/restore harnesses. Preserve A12-01/A12-02/A12-03 negative checks, exact TND arithmetic and existing anti-fabrication SQL. No suite was rerun during planning.

Extend the existing subject privacy export/correction projection and support-purpose inventory to account for the new records, filtering each revision by the requesting subject and excluding internal notes/others' data. Keep preservation reasons explicit; do not invent a retention duration, purge schedule or legal approval. This is part of feedback privacy integration, not a redesign of governance.

## Deferred architecture and risks

- **#192:** if later selected, prefer a separate DemoFeedback record scoped to visitor/scenario generation and explicitly trusted team moderators; SupportTicket requires an authenticated User and commercial/support scope. Reuse demo CSRF/reset and RateBucket, not generated visitor operator roles as global moderators. Archive context across reset; never reveal other visitors' records. Real-person opinion about synthetic data is distinct from seeded feedback.
- **#207:** versioned recurring intent/term/schedule and release lineage must call the existing reorder-draft authority. Revalidate price, available capacity, material evidence and the approved specification/sample mapping for every order. Existing sourceProductId references ApprovedProductVersion, not ProductSpecificationRevision. Carry immutable recurring applicability into acceptance so an unlinked repeat RFQ cannot avoid mandatory finance review. Reuse production offers for fresh individual artisan acceptance; pausing a forecast cannot cancel old obligations. No auto-acceptance, reservation, payable or bank claim.
- **#208:** derive from scoped prospect/proposal histories and the single finance source. Define lead-entry/qualification events, latest proposal outcome per group, first/repeat paid orders and mature cohort denominators over half-open Africa/Tunis periods. Distinguish synthetic, recorded-unverified and actual evidence; same customer is the existing Organization ID. Require explicit expense purpose/period/source attribution before any CAC; generic OTHER cost is insufficient. Empty eligible denominator is unavailable, not zero conversion. Preserve minimum-cohort suppression and resist narrow-filter differencing. Actual paid/retention outputs remain gated.
- **Residual risks:** sensitive free text, role unions across organizations, buyer impersonation, stale owners, case visibility leaks and lost concurrent corrections. Mitigations are narrow per-resource checks, plain bounded text, immutable actor/history, expectedVersion, independently scoped case projection and negative HTTP tests.
- **External gates:** actual recognition, invoice policy, verified settlement, lawful closure, retention/legal review and E19-01 participant comprehension remain open. All owner acceptance remains PENDING. Qualified privacy approval is required before real feedback collection; synthetic software implementation does not provide it.

Batch 13 implementation has not started. This plan authorizes no deployment or policy-dependent workflow.

