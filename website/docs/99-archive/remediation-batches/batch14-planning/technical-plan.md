# Batch 14 technical plan

28 October 2026 · Africa/Tunis. **Design only: E15-06 / #192.** No product code, contract, schema or
migration is included. Scope and estimate: [SCOPE_AUDIT.md](scope-audit.md). Task order:
[IMPLEMENTATION_BACKLOG.md](implementation-backlog.md).

## Architecture and authority

Extend the existing demo module and its existing admin review pattern. Do not create a CRM, ticketing
platform, feedback microservice or analytics pipeline.

- **DemoVisitor + nasj_demo_visitor cookie** identify the anonymous participant. The cookie is HttpOnly,
  sameSite=lax, path /, 24-hour expiry, and only its SHA-256 hash is stored as tokenHash. A visitor is
  created lazily by GET /api/v1/demo/session.
- **DemoService.control(req, mutating)** is the existing proof of visitor ownership: cookie lookup,
  expiry check, origin equality, and HMAC X-Demo-CSRF bound to the visitor token compared with
  timingSafeEqual. Reuse it unchanged for the write path. It is deliberately independent of Better Auth
  sessions so an anonymous visitor can submit without an account.
- **DemoScenario** is the isolation and provenance unit: visitorId, generation, status
  (ACTIVE/ARCHIVED), rfqId, organizationIds. A reset archives the old scenario and creates generation
  N+1 for the same visitor. Scenarios are never deleted.
- **assertDemoSession** (in demo-access.ts, invoked by AuthGuard on every authenticated route) remains
  the boundary for synthetic persona sessions. It keeps a stale or foreign showroom session from acting
  as a commercial identity.
- **@AdminOnly() + PolicyService.requireAdmin** (role ADMIN, active verified account, MFA gate) is the
  only moderation authority. No new business role, no default role change, no demo persona.
- **RateBucket** via SecurityService remains the single rate-limit datastore.
- **AuditEvent** (append-only trigger) records moderation actions. Feedback bodies are not copied into
  audit payloads.

### Why a dedicated aggregate is required

BuyerOrderFeedback is receipt-bound to a confirmed BuyerDeliveryConfirmation on a commercial order and
authorized through buyer-organization membership plus buyer.delivery.confirm. A showroom visitor has no
organization, no receipt and no delivery. SupportTicket and SupportCase both require an authenticated
User reporter inside a support scope, and using them would invent a claim from an informal opinion.
None of the three can carry "this anonymous visitor thought screen X of synthetic scenario Y was
confusing" with correct authorization. Two small tables are the minimum typed distinction.

## Proposed additive schema

Proposed names, not existing models.

### DemoFeedback

| Field | Type | Rule |
|---|---|---|
| id | TEXT PK | cuid |
| scenarioId | TEXT FK to DemoScenario | ON DELETE RESTRICT; the persistence anchor |
| visitorId | TEXT FK to DemoVisitor | ON DELETE RESTRICT; who submitted, server-derived |
| generation | INTEGER | copied from the scenario at creation; CHECK > 0 |
| sourceClass | TEXT | VISITOR_SUBMITTED or SYNTHETIC_SEEDED; CHECK; default VISITOR_SUBMITTED |
| screenKey | TEXT | validated against a closed allow-list enum; CHECK |
| category | TEXT | USABILITY, CONTENT, DEFECT or IDEA; CHECK |
| comment | TEXT | default ''; CHECK length <= 2000 |
| status | TEXT | NEW, TRIAGED, ACTIONED or DISMISSED; CHECK |
| dedupeKey | TEXT | nullable; CHECK length <= 128 |
| createdAt | TIMESTAMP(3) | default CURRENT_TIMESTAMP; immutable |

Indexes: (scenarioId, createdAt, id), (status, createdAt), (visitorId, createdAt).
Uniqueness: unique (scenarioId, visitorId, dedupeKey) where dedupeKey is non-null, enforced with a
partial unique index so a NULL key never blocks unrelated submissions.

status is deliberately stored on the aggregate (C2 requires it) while every transition is also
appended to the event table (C5).

### DemoFeedbackEvent

| Field | Type | Rule |
|---|---|---|
| id | TEXT PK | cuid |
| feedbackId | TEXT FK to DemoFeedback | ON DELETE RESTRICT |
| actorId | TEXT FK to User | the real moderator; never a demo persona |
| kind | TEXT | SUBMITTED, STATUS_CHANGED or NOTE |
| fromStatus | TEXT NULL | previous status for a transition |
| toStatus | TEXT NULL | equals the new aggregate status when kind = STATUS_CHANGED |
| note | TEXT | default ''; CHECK length <= 1000 |
| createdAt | TIMESTAMP(3) | default CURRENT_TIMESTAMP |

Indexes: (feedbackId, createdAt, id), (actorId, createdAt). Append-only trigger on UPDATE and DELETE,
following the existing buyer_feedback_append_only precedent.

### Database guarantees

- Additive migration only, next valid timestamped directory after the existing 37.
- Restrictive FKs on every relation; no cascade deletion of moderation history.
- CHECK constraints for sourceClass, screenKey, category, status, generation, comment and note length,
  and fromStatus <> toStatus on a status event.
- Append-only trigger on DemoFeedbackEvent.
- A guard trigger on DemoFeedback permitting only status to change after insert, so identity, scenario,
  visitor, generation, provenance, screen and comment are immutable. A moderator changes a state, never
  the submitted words.
- The status change and its event are written in one transaction, so a transition can never exist
  without attributable history.

## Visitor isolation architecture

**Ownership unit: the DemoScenario.** Not the visitor, not the cookie, not the generation counter in
isolation.

Rationale: a visitor may hold several archived generations. Keying feedback to the visitor would let a
new generation reach an old one through the same visitor scope; keying to scenarioId makes "which
demonstration was assessed" unambiguous and makes the reset behaviour fall out of the schema rather
than out of special-case code.

### Read scope

| Reader | Scope |
|---|---|
| Visitor | Only feedback where visitorId matches the visitor resolved from the cookie, and only rows on that visitor's own scenarios. Their own submissions only. |
| Team moderator | All feedback for any scenario, through a real ADMIN identity. Includes archived generations. |
| Any other actor | 404. Artisan, coordinator, buyer, synthetic support persona, unrelated signed-in user. |

The visitor list is deliberately narrow: a visitor sees their own submissions (useful for the "your
feedback was recorded" confirmation and for avoiding duplicate re-entry), and never another visitor's.
It must not become a browse surface.

## Reset and persistence strategy

Existing reset, unchanged: DELETE the six synthetic users' sessions, set those users DISABLED, mark the
old scenario ARCHIVED with archivedAt, insert the demo.scenario.reset audit, create generation N+1,
reconcile the seed.

**Feedback is preserved automatically** because the FK is ON DELETE RESTRICT and reset never deletes a
DemoScenario, only changes its status.

Therefore no change to DemoService.reset is required for data safety. The one required change is
read-side: the moderator inbox must filter on scenario rather than on "active scenario" so archived
generations remain reviewable, and the visitor list must include archived scenarios owned by that same
visitor so their own past submissions stay visible to them and only to them.

### Explicit non-goals

- Do not add a cascade delete for cleanliness. It would destroy the evidence the story requires.
- Do not expose archived feedback to other visitors, even within the same showroom deployment.
- Do not add a restore-deleted-feedback path; the data is simply never deleted.

### Expiry

DemoVisitor.expiresAt (24h) governs the cookie, not the feedback. A visitor returning after 24 hours
receives a new DemoVisitor row and cannot read the old feedback. That is correct: the prior submission
remains for the team and the new visitor identity is fresh. This must be stated in the UI and covered by
a test. No attempt is made to re-link an expired cookie to old submissions, because doing so would
require retaining a linkable identifier beyond its purpose.

### Seeded versus submitted

sourceClass distinguishes SYNTHETIC_SEEDED (fixture data inserted directly, never through the public
API) from VISITOR_SUBMITTED (only reachable through the CSRF-protected capture route). The capture route
cannot set sourceClass; any attempt is a strict-schema 400. Every DTO and UI label carries the class so a
reader cannot mistake seeded rows for real reactions or the reverse.

### Duplicate and spam control

Layered, cheapest first:

1. **Dedicated rate bucket.** Add a feedback policy name to SecurityService's PolicyName union and
   ratePolicy map, with env-configurable max/window defaulting conservatively, keyed by hashed IP as
   today. Demo routes currently fall through to the generic api bucket; this write path deserves its own.
2. **Per-visitor-per-scenario cap.** Reject when that visitor already has a configured number of
   feedback rows for one scenario, so a single visitor cannot flood a scenario even within the IP budget.
3. **Optional dedupeKey.** A client-generated key derived from (screenKey, category) lets a double-click
   or retry collapse into one row. Reuse the uniqueness idea from DemoCommand rather than inventing a
   mechanism.
4. **Idempotency-Key replay.** Same-key replay returns the original result; changed payload under the
   same key conflicts. Reuse validateIdempotencyKey and the DemoCommand-style receipt, scoped to the
   visitor.

## Moderator authorization

- Controller-level @AdminOnly() and PolicyService.requireAdmin(actor, tx) inside the transaction.
- ADMIN is a real account attribute, reachable only by normal sign-in. DEMO_LIMITATIONS already states
  that global administrator access is not available through visitor switching, and the showroom signs in
  only the six fixed personas.
- The reviewer's User row is the actorId on every event. A synthetic persona user is never permitted
  because it is not ADMIN; the guard and the service both check, so a future role change cannot silently
  widen this.
- Moderator reads return the comment and history. They exclude anything about the visitor's browser, IP
  or other scenarios. No email or contact capture exists at all.

## API contracts

All six routes are new. Reuse ZodValidationPipe, resourceIdSchema, the demo X-Demo-CSRF proof,
Idempotency-Key and the documented error shape.

| Route | Audience | Purpose |
|---|---|---|
| POST /api/v1/demo/feedback | visitor (cookie + X-Demo-CSRF) | Submit one structured assessment |
| GET /api/v1/demo/feedback | visitor (cookie) | Bounded list of the visitor's own submissions |
| GET /api/v1/admin/demo-feedback | ADMIN | Paged, filterable team inbox |
| GET /api/v1/admin/demo-feedback/:id | ADMIN | Detail plus moderation history |
| PATCH /api/v1/admin/demo-feedback/:id | ADMIN | Status transition with optional note |
| GET /api/v1/admin/demo-feedback/summary | ADMIN | Counts by status and category, no free text |

### Request schemas (strict)

```
demoFeedbackCreateSchema = {
  scenarioId: id,
  screenKey: enum(demoScreenKeys),
  category: enum(['USABILITY','CONTENT','DEFECT','IDEA']),
  comment: string.trim().max(2000).default(''),
  dedupeKey?: string.trim().max(128),
}  // .strict() -- no visitorId, sourceClass, status, generation or createdAt accepted

demoFeedbackDecisionSchema = {
  expectedStatus: enum(demoFeedbackStatuses),
  status: enum(demoFeedbackStatuses),
  note: string.trim().max(1000).default(''),
}  // .strict()
```

### Enumerations

- demoScreenKeys: the closed set of assessable screens -- the showroom overview, the business-stage
  progress, one key per presentationScenes id, and the persona workspaces. A closed list is what makes
  "relevant screen/story" (C2) meaningful and prevents arbitrary free-text locators.
- demoFeedbackStatuses: NEW to TRIAGED to ACTIONED or DISMISSED; TRIAGED back to NEW allowed for
  re-queue; ACTIONED and DISMISSED terminal. A small pure transition helper lives in contracts and is
  unit-tested.

### Error contract

| Situation | Result |
|---|---|
| Unknown scenario, or a scenario not owned by this visitor | 404 |
| Known scenario, visitor not permitted (expired cookie, failed proof) | 403 DEMO_VISITOR_REQUIRED / DEMO_CSRF_REJECTED |
| Invalid payload (unknown category, bad screen, oversized comment, forged field) | 400 with field errors |
| Duplicate aggregate or per-scenario cap reached | 409 |
| Stale expectedStatus | 409 STALE_STATUS |
| Invalid transition | 409 INVALID_TRANSITION |
| Rate limited | 429 with Retry-After from the existing middleware |
| Non-admin reviewer, or unknown id to a non-admin | 403, or 404 to avoid enumeration |

## UI data flow

### Visitor -- demo-showroom.tsx

A "Share feedback" disclosure in the existing showroom, below the stage progress:

1. Category select, screen/story select populated from the same closed demoScreenKeys list, optional
   comment textarea with maxLength 2000 and a live character count.
2. Submit posts { scenarioId, screenKey, category, comment } with the existing demoRequest helper
   extended with a feedback operation, the X-Demo-CSRF proof and a retained idempotency key.
3. On success show a confirmation naming provenance honestly: "Recorded as feedback about this synthetic
   demonstration. It is not customer satisfaction or published evidence."
4. On failure keep the draft text and the key, show the message and offer retry, distinguishing
   "demo service unavailable, retry" from "this submission is invalid".
5. Below the form, a short "your recent feedback for this scenario" list from the visitor list route, so
   a visitor can see their own submission persisted after a reload.

Do not reuse the existing feedback state variable for this; rename or scope it so the action-status
string and real submissions are never confused in code or tests.

### Moderator -- /admin/demo-feedback

Follow the existing admin page pattern (/admin/participant-concerns):

- Table of scenario generation, screen, category, comment excerpt, status, submitted time.
- Status and category filters plus page/pageSize.
- Detail panel with the full comment, provenance label and the ordered event history showing actor name,
  kind, transition and note.
- Status control requiring a note for ACTIONED and DISMISSED, posting expectedStatus so a stale tab
  cannot overwrite a colleague.
- Summary counts at the top; no free-text search over comments in the first increment.

Navigation entry added beside the existing Participant concerns item, gated the same way.

## Concurrency and idempotency

- Wrap each write in DemoService.transaction's existing lock order (724631902 then 724631903) or
  iamTransaction for the moderator routes; never both nested.
- Visitor capture: check the rate bucket, then the per-scenario cap, then the idempotency receipt, then
  insert. The receipt row and the feedback row commit together.
- Moderator transition: a guarded update on (id, expectedStatus), or read-then-check inside the lock, so
  two reviewers cannot both win from the same prior state; the loser receives 409 STALE_STATUS and
  reloads.
- A successful-key replay returns the original result after re-checking current authority, so a revoked
  or expired visitor proof cannot replay a stored response.
- No external network call inside any business transaction.

## Abuse prevention summary

| Threat | Control |
|---|---|
| Anonymous spam | Per-IP feedback bucket plus per-visitor-per-scenario cap |
| Request flooding | Existing SecurityService middleware with Retry-After |
| Forged visitor identity | Only the HttpOnly cookie is trusted; the body cannot name a visitor |
| Cross-visitor access | Ownership resolved server-side from cookie to visitor to own scenarios |
| Cross-scenario access | Every read and write filters on the resolved visitor's scenarios |
| Reset-generation leakage | FK to DemoScenario; archived scenarios remain, but the visitor list is own-visitor-only |
| Unauthorized moderation | @AdminOnly plus requireAdmin plus MFA gate; demo personas are never ADMIN |
| Privilege escalation via persona | The synthetic SUPPORT persona can reach /collaboration, but feedback moderation is ADMIN-only and therefore unreachable |
| Stored XSS | Strict Zod, plain-text render, no HTML, comment length cap; no upload in this story |
| Duplicate submissions | dedupeKey partial unique index plus idempotency receipt |
| Idempotency abuse | Key validated, scoped to visitor and operation, payload hash compared |
| CSRF bypass | Reuse HMAC X-Demo-CSRF plus origin equality plus timingSafeEqual |
| Sensitive free text | Documented do-not-enter-personal-data hint, bounded length, private storage, no email, moderation-only visibility |
| Excessive retention | No duration invented; new purpose entry keeps PENDING_QUALIFIED_POLICY_REVIEW |

## Privacy handling

- New RETENTION_INVENTORY class, e.g. DEMO_VISITOR_FEEDBACK: purpose "improve the demonstration from
  volunteer visitor reactions", access roles "Visitor for own submissions" and "Qualified team
  reviewer", trigger "visitor feedback review or scenario archival", retentionDuration null,
  reviewStatus PENDING_QUALIFIED_POLICY_REVIEW, preservation reason stating that archived scenario
  evidence supports regression and fairness review.
- Do not silently reuse DEMO_SYNTHETIC, whose trigger text ("Visitor reset or expiry") implies deletion
  that this story deliberately does not perform.
- The reviewer sees the comment; the visitor sees only their own. Neither sees IP addresses. An
  anonymous visitor cannot be linked to an authenticated subject export by design; document that
  explicitly rather than faking a link.
- No consent is invented. The capture form states plainly that this is feedback about a synthetic
  demonstration and is not published.
- Real-user collection at scale remains gated on E14-09 / #74 qualified review.

## Test strategy

- **Units (contracts):** strict-schema rejection of forged visitorId, sourceClass, generation, createdAt
  and status; category and screenKey membership; comment bounds; the status-transition helper;
  provenance labelling helper.
- **HTTP/PostgreSQL (extend apps/api/test/demo.scenarios.ts):** valid submission; invalid category;
  oversized comment; invalid screen key; forged visitor; forged scenario; scenario owned by another
  visitor; duplicate; per-scenario cap; rate limit 429 with Retry-After; CSRF failure; cross-visitor
  read; unauthorized moderator including plain user, artisan and the synthetic support persona;
  moderation transition; moderation history preservation; reset without data loss; reset without
  cross-generation disclosure; seeded-versus-submitted provenance; visitor expiry creating a fresh
  identity that cannot read the prior rows.
- **Concurrency:** parallel submissions from one visitor (cap holds); same-key replay returns one row;
  changed payload same key conflicts; simultaneous moderator transitions yield one success and one
  STALE_STATUS; append-only history intact.
- **Browser (tests/demo-e2e):** submit with validation errors; failed request and retry preserving the
  draft; confirmation; mobile and desktop with axe and overflow; moderator review and transition; reset
  then confirm archived feedback is still reviewable by the team and invisible to another visitor.
- **Regression:** Batch 13 buyer-order feedback isolation, Batch 12 closure/funding, existing persona
  isolation, governance restrictions, and the anti-promotion rule (no synthetic row enters verified
  customer evidence).

## Migration and restore strategy

One additive migration creating the two empty tables, indexes, CHECKs, restrictive FKs and triggers. No
historical data is inferred from existing demo records. Verify on disposable PostgreSQL: normal deploy,
populated upgrade preserving every pre-existing row hash, constraint and trigger rejection cases,
transaction rollback, and pg_dump/pg_restore reproducing populated feedback plus its history. Rollback is
application rollback with additive data retained; no destructive down migration.

## Deferred

- **#192 -- demo feedback:** this plan.
- **#207 -- recurring agreements:** unrelated; needs versioned term/schedule and mandatory finance-gate
  applicability.
- **#208 -- acquisition/retention analytics:** unrelated; needs cohort definitions and legitimate paid
  evidence.
- **Out of scope here:** attachments or screenshots in feedback, threaded replies, email notifications,
  public testimonials, free-text search over comments, and any automatic promotion into customer
  evidence.

## External gates

Owner acceptance remains PENDING. Nothing here authorizes a deployment, a persistent migration, real
participant recruitment, or publication of any visitor comment. Qualified privacy review under E14-09 /
#74 remains required before real feedback is collected at scale, and E19-01 participant comprehension
remains open.

Batch 14 implementation has not started. This plan authorizes no deployment or policy-dependent
workflow.
