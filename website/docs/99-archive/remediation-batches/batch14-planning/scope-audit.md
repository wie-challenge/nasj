# Batch 14 scope audit

28 October 2026 · Africa/Tunis. **Recommendation: E15-06 / #192 only, revised planning estimate 8
points.** Planning only: no product code, migration, database, test or GitHub state was changed by
this audit.

## Authority and method

The live issue was retrieved read-only with authenticated `gh issue view 192`: **OPEN**, project
HirfaCare Backlog field **Proposed**, milestone **Controlled Pilot**, labels `story`, `P1`,
`release:C`, `epic:E15`, `frontend`, `design`. Source **Story Points 5 — provisional**. The issue body
still reads `Status: Proposed`. No issue or board mutation occurred.

Read only direct inputs: [Batch 13 scope audit](../batch13-planning/scope-audit.md) and
[technical plan](../batch13-planning/technical-plan.md) for the deferral rationale and the reuse
notes already recorded there, [Batch 13 implementation](../../historical-audits/batch13-implementation.md) and
[independent verification](../../historical-audits/batch13-independent-verification.md) for the current baseline, plus
[apps/web/AGENTS.md](../../../../apps/web/AGENTS.md) (the only repository instruction file; no root
`AGENTS.md` exists). Source inspection covered `apps/api/src/modules/demo/` (service, seed, access,
controller, module), `apps/api/src/modules/registry/participant-concerns.controller.ts` and
`registry.service.ts` concern methods, `apps/api/src/modules/foundation/policy.service.ts`,
`apps/api/src/security/policies.ts`, `apps/api/src/common/csrf.ts`,
`packages/contracts/src/demo.ts`, the `DemoVisitor`/`DemoScenario`/`DemoIdentity`/`DemoCommand`,
`ParticipantConcern`, `CommandOutcome` and `AuditEvent` models, `apps/web/src/components/demo-showroom.tsx`,
`apps/web/src/lib/demo-api.ts`, `apps/web/src/lib/presentation-scenes.ts`, the retention inventory and
the demo test harnesses. No test was executed; existing green evidence is cited, not re-run.

## Original acceptance criteria (verbatim, in order)

| # | Criterion |
|---|---|
| C1 | Shared database, input validation and abuse controls required. |
| C2 | Capture permitted participant, relevant screen/story, category, comment and status. |
| C3 | Persist feedback in shared storage with validation and abuse/rate limits. |
| C4 | Restrict viewing/moderation to intended team scope. |
| C5 | Display submission errors and preserve attributable moderation history. |

Issue user story: *“As a coworker, I want to leave persistent structured feedback, so I can
collaborate asynchronously.”* Technical note: *“Use a scoped feedback API/table; support async review
without automatically emailing or messaging external recipients.”* Verification note: *“Submit
valid/invalid feedback, reload from a second authorized session and test unauthorized access and
repeated submissions.”*

Dependencies E01-10 / [#38](https://github.com/wie-challenge/website/issues/38) and E16-05 /
[#78](https://github.com/wie-challenge/website/issues/78) are **CLOSED**; the identity, session,
organization and access-control infrastructure the Batch 13 audit already relied on is present.

## Classification check: still NOT_IMPLEMENTED

The Batch 13 audit classified E15-06 as NOT_IMPLEMENTED and specifically recorded that
`DemoShowroom`'s `feedback` variable is action-status text, not submitted feedback. **That remains
accurate.** Verified now:

- `apps/web/src/components/demo-showroom.tsx` holds `const [feedback, setFeedback] = useState('')`;
  it is written only with fixed strings on start/switch/reset success
  (`'Your isolated synthetic scenario is ready…'`, `'Demo reset completed…'`) and rendered as a
  `<p role="status" className="notice success">`. It is transient component state, never submitted,
  never stored, and has no category, screen, story or status field.
- No `DemoFeedback`, `feedback`-shaped table or demo feedback endpoint exists. The only Prisma models
  containing “feedback” are `BuyerOrderFeedback`/`BuyerOrderFeedbackRevision` (Batch 13, commercial
  order delivery) and `NotificationPreference`-adjacent fields. `rg` over `apps/api/src` and
  `apps/web/src` finds no demo-feedback code path.
- `DemoService` exposes exactly four operations: `session`, `start`, `switch`, `reset`
  (`demo.controller.ts`). There is no capture, inbox, moderation or status surface.

Shareable-security infrastructure exists, but **infrastructure is not the feature**. C1–C5 remain
unmet.

## Reusable modules

| Capability | Reuse | Notes |
|---|---|---|
| Visitor identity | `DemoVisitor` + `nasj_demo_visitor` HttpOnly cookie, sha256 `tokenHash`, 24h expiry | Server-side identity; the raw token never enters storage |
| Visitor → persona proof | `DemoService.control(req, mutating)` with HMAC `X-Demo-CSRF` bound to the visitor token and `origin` equality plus `timingSafeEqual` | Reuse verbatim; a demo-specific CSRF proof independent of Better Auth sessions |
| Scenario provenance | `DemoScenario` (`visitorId`, `generation`, `status`, `rfqId`, `organizationIds`, `seedSpec`) | Already the isolation unit; archives rather than deletes |
| Demo session boundary | `assertDemoSession` in `demo-access.ts` via `AuthGuard` | Applied to every authenticated route; prevents a stale/foreign showroom session |
| Idempotency | `DemoCommand` unique `(visitorId, keyHash)` + payload hash; `replaySafe`/`CommandOutcome` for authenticated actors | Two existing patterns; pick per audience, do not invent a third |
| Abuse controls | `RateBucket` via `SecurityService.localLimit`, `policyName` → generic `api` policy today | Demo routes have **no** dedicated bucket |
| Validation | shared `ZodValidationPipe` + strict schemas in `packages/contracts` | Reject unknown keys |
| Moderation authority | `@AdminOnly()` + `PolicyService.requireAdmin` (role `ADMIN`, MFA gate) | Real team identity, never a demo persona |
| Moderation precedent | `ParticipantConcern` + `RegistryService.concern/concerns/reviewConcern` | Closest existing “intake then review” shape |
| Audit | `AuditEvent` unique append-only trigger, outbox | Use for moderation actions only |
| Fixed transaction locks | `DemoService.transaction` (724631902 → 724631903) | Already the demo lock order |
| Privacy inventory | `RETENTION_INVENTORY` `DEMO_SYNTHETIC` class | Extend or add a class; do not invent a duration |

## Missing functionality

1. **No feedback aggregate.** Nothing stores category, screen/story, comment, status, visitor, scenario
   or generation.
2. **No capture API.** No route accepts a visitor submission; the showroom cannot submit anything.
3. **No submission UI.** No “Share Feedback” entry point, category picker, story picker, comment field,
   validation display, retry or confirmation.
4. **No moderation surface.** No inbox, filters, detail view, status transition or review attribution.
5. **No moderation history.** No append-only record of who changed what status, when and why.
6. **No reset/fresh-generation semantics for feedback.** Reset archives a scenario and disables its
   users, but nothing defines what happens to feedback belonging to the archived generation.
7. **No dedicated abuse control** for this write path, and no duplicate-submission rule.
8. **No provenance classification** distinguishing a visitor submission from seeded synthetic data.
9. **No governance coverage.** Demo records are absent from the subject export by design today;
   feedback retention/purpose still needs an explicit entry.
10. **No tests** for any of the above.

## Architectural conflicts and risks

| Conflict | Finding | Resolution |
|---|---|---|
| Where feedback lives | `BuyerOrderFeedback` is receipt-bound to a confirmed commercial delivery and requires `buyer.delivery.confirm` in a buyer organization. A showroom visitor has none of that. | **Do not reuse.** A demo assessment of a synthetic order is not buyer satisfaction. |
| `SupportTicket` / `SupportCase` | Both require an authenticated `User` reporter and a commercial/support scope; `SupportTicket` authorizes through organization membership and `support.case.manage`. | **Do not reuse.** Feedback is not a claim and must not create one. |
| Reset behavior | `reset` deletes sessions, disables the six synthetic users, marks the old scenario `ARCHIVED` and creates generation N+1. It does not delete scenarios. | Feedback keyed to the archived scenario **survives automatically** — provided the FK is `Restrict` and no cascade delete is introduced. This is the smallest safe design. |
| Visitor expiry vs persistence | `DemoVisitor.expiresAt` is 24h from creation and is never extended. Feedback must not disappear with the cookie. | Feedback must NOT be reachable only through the live visitor; a team reviewer reads it through `DemoScenario`, not through the visitor token. |
| Personas | The showroom signs a real Better Auth session for a synthetic `User` with real scoped roles, including `SUPPORT`. | A visitor could reach `/collaboration` as a synthetic support persona. That must never imply demo-feedback moderation. Moderator access is `ADMIN` + real identity only. |
| Batch 13 relation | `BuyerOrderFeedback.scenarioId` already relates to `DemoScenario` (`BuyerFeedbackScenario`). | A new model needs its **own named relation**; check for Prisma relation ambiguity. |
| Retention | `DEMO_SYNTHETIC` says “Visitor reset or expiry”, which would wrongly imply feedback deletion. | Add a distinct class; keep `retentionDuration: null` and `PENDING_QUALIFIED_POLICY_REVIEW`. |

## Dependency decisions

- **#192:** both declared dependencies (#38, #78) are CLOSED and their software is present. No new
  blocking dependency is required.
- **E18-04 / #207** and **E18-05 / #208:** unrelated domains (recurring agreements; acquisition and
  retention analytics). Neither is a technical prerequisite for showroom feedback, and open status
  alone is not a defect. Defer both.

## Value, effort and risk

Source estimate 5 SP is unchanged and remains the GitHub figure. Revised planning complexity is **8
SP**, roughly **4–6 engineering days including verification**, for two small tables, one capture route,
one guest-readable scoped list, two moderation routes and one small UI surface in the existing
showroom plus one admin review page. It excludes any real-user research programme.

| Dimension | Assessment |
|---|---|
| Business / demo value | High and cheap: turns showroom reactions into reviewable, attributable evidence instead of a transient toast |
| Reuse complexity | Medium — every authority exists; the work is wiring plus one additive pair of tables |
| Additive DB impact | Two tables (`DemoFeedback`, `DemoFeedbackEvent`) plus indexes and CHECK constraints; no change to existing tables |
| Security / privacy risk | High if done carelessly: anonymous abuse, free-text XSS, cross-visitor reads, privilege escalation via the support persona, and reset losing evidence |
| Test effort | Medium/high: abuse, isolation, concurrency, reset, browser and axe coverage |

## Compact decision ledger

- **D14-01 — Select E15-06 only.** It is self-contained, reuses the strongest existing isolation
  model, and does not require an unapproved contract, payment or cohort definition.
- **D14-02 — New `DemoFeedback` aggregate, not reuse.** No existing feedback, ticket or case authority
  can represent an unauthenticated visitor's assessment of a synthetic screen with the right
  authorization guarantees.
- **D14-03 — Persist by scenario, review by real identity.** Feedback belongs to `DemoScenario`, so it
  survives reset; review requires a real `ADMIN`, so no demo persona can moderate.
- **D14-04 — Never promote synthetic to real.** A visitor submission is labelled as a demonstration
  opinion; it is never customer satisfaction, verified evidence or publication material.
- **D14-05 — Preserve E14-09.** No retention duration, purge schedule or legal approval is invented;
  qualified review remains pending for real feedback collection.

Proceed to implementation only under a new owner instruction. See
[IMPLEMENTATION_BACKLOG.md](implementation-backlog.md) and [TECHNICAL_PLAN.md](technical-plan.md).

Final preservation check: this audit adds only these three Markdown files. No test, migration,
database access, commit, push, reset, deployment or GitHub write was performed.
