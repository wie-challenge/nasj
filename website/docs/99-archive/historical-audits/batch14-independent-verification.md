# Batch 14 independent verification — E15-06 / GitHub #192

29 October 2026 · Africa/Tunis. Audited repository: `website/`, commit
`f0b3d756dce0ea4ec3bde0addcb92fcff7d54844`. **Owner acceptance: PENDING.**

## Decision

**Qualified verification: C1–C4 verified at software level; C5 partially verified.** Visitor and
administrator security boundaries hold in the exercised cases. One P2 recovery defect prevents an
unconditional acceptance recommendation. Two LOW residual issues and one INFO evidence correction are
recorded below. No P0 or P1 finding was established.

Resolve B14-IV-02 and independently recheck the affected browser journeys before recommending Batch 14
for owner acceptance. The owner may review this report now; this audit does not mark the story accepted.
Batch 11–14 reconciliation may proceed as a read-only inventory/planning exercise, carrying this qualified
result and all external gates. It must not describe Batch 14 as fully verified or accepted. No backlog
states were changed and Batch 15 was not started.

## Authority, scope and preservation

Read the four Batch 14 implementation/acceptance/verification/progress documents, all three
`batch14-planning/` documents, the captured original #192 issue and machine-readable summary, retained
logs, and the preceding Batch 13 independent verification. Targeted inspection covered shared feedback
contracts, demo identity/control/service/controller, administrator guard/policy/service, rate limiter,
retention inventory, Prisma models and migration 38, both feedback components and API helpers, and
relevant unit/integration/browser/migration tests. This was not a repeat project-wide audit.

The initial tracked/untracked Git working tree was clean. Product code, migrations, planning documents,
prior evidence and Git index remain unchanged. New files are limited to this report and
`evidence/batch14-verification/`. No staging, commit, push, stash, reset, clean, deployment, GitHub write,
or connection to a persistent database was performed. PostgreSQL work used the repository's
`disposableDatabase()` helper: PostgreSQL 17.7-alpine containers with random names/passwords, loopback
ports, and explicit removal in `finally`. SMTP was local capture only. All feedback was synthetic.

## Evidence freshness and authoritative totals

The implementation-era logs contain the advertised passing totals, but do not bind execution to a
source-hash manifest. A clean commit containing logs and source is useful provenance, not proof of their
execution order. Therefore the audit captured 459 source/config/test/migration hashes before testing
and reran the full integration, unit and browser regressions, plus static checks. Final source hashes
are compared with that baseline in `final-preservation.json`.

- API units: **147 passed**, zero failed/skipped; web units: **25 passed**, zero failed/skipped
  (`units.log`).
- Full integration: **206 scenarios passed**, exit 0 (`integration.log`), including **9 showroom
  isolation**, **4 E15-06 HTTP/security** and **6 Batch 14 migration/upgrade/restore** scenarios.
- Separate showroom isolation rerun: **9 passed**, exit 0 (`showroom-isolation.log`).
- Complete repository browser regression: **54 application + 5 showroom tests passed**, exit 0
  (`e2e-all.log`). There are **2 new original E15-06 browser tests**, not four.
- Independent adversarial groups: **13 assertion groups passed**, including explicit reproduction of
  the two LOW findings (`adversarial.log` / `adversarial-results.json`).
- Independent browsers: **6 passed**, zero skipped/unexpected: four functional/accessibility cases and
  two successful reproductions of the P2 defect, at 390×900 and 1280×900 (`independent-browser.json`).
  All four independent axe checkpoints reported zero violations; no horizontal overflow.
- Lint: **426 files**, no findings; typecheck, production build, offline Prisma validation and
  `git diff --check`: **PASS**. Logs retained for each; all commands returned exit 0.

The nine showroom isolation scenarios and six Batch 14 migration scenarios are subsets of the 206
integration scenarios; do not add them to 206 as unique coverage. The separate nine-scenario showroom
rerun is additional execution of existing scenarios. Independent adversarial and browser probes are
additional tests, not additional original acceptance criteria. A probe reporting PASS for an expected
defect means that the counterexample reproduced; it does not certify correct product behavior.

Retained evidence includes `baseline.json`, `historical-migrations.json`, `adversarial.ts`,
`adversarial-results.json`, `adversarial.log`, `independent.spec.ts`,
`independent.playwright.config.ts`, browser JSON/screenshots, complete rerun logs, `summary.json`, and
`final-preservation.json`. Reproduction commands are in `README.md` beside the evidence.

An initial probe incorrectly expected duplicate dedupe keys to yield 500. The actual API correctly
returns 409 `STATE_CONFLICT` through the common exception filter. The assumption was corrected;
`adversarial-initial.log` preserves the failed assertion. A concurrent Prisma client generation briefly
prevented another probe process from importing `PrismaClient`; it was rerun after generation completed
(`adversarial-generation-race.log`). Neither harness failure is counted as a product failure or a pass.

## Findings

### B14-IV-02 — P2: edited retry after a lost committed response cannot recover

**Location:** `apps/web/src/components/demo-feedback-panel.tsx:77–95`, especially payload construction
at 82–84 and key reset only on success at 86; conflict guidance at 30–31. Supporting server behavior:
`apps/api/src/modules/demo/demo.service.ts:502–507` correctly rejects changed payloads under one key.

**Reproduction:** Run the independent browser tests named “lost committed response followed by edited
retry conflicts”, at 390px and 1280px. Intercept POST feedback, forward it to the real API with
`route.fetch()` and assert 201, then drop its response with `route.abort('failed')`. The server has
committed the original comment. The browser preserves the draft and key and reports unavailability.
Edit the comment and submit twice more.

**Expected:** Recover the original accepted operation using its original payload/key, expose the
accepted result, and provide an explicit way to submit the edited assessment as a new operation.
Recovery must preserve the edited draft and avoid duplicate original records.

**Actual:** Both retries send the edited payload with the original key and return 409
`IDEMPOTENCY_CONFLICT`. The message asks the visitor to “Review it and try again”, but that action
repeats the same conflict. Exactly one original row remains; the edited draft is not saved. A reload
clears the key but also discards that draft. Restoring the exact original payload can recover manually,
but the UI does not retain or offer it.

**Impact:** Recoverable submission failures can trap a visitor's edited feedback in repeated errors.
There is no cross-visitor leak or duplicate insertion; server idempotency is working correctly. This is
a C5 failure/retry UX defect missed by the existing pre-write 503 simulation.

**Remediation:** Retain an immutable pending request payload alongside its key. Reconcile that operation
before issuing a new key; preserve subsequent edits separately and offer an explicit new-submission
action after reconciliation. Add a real-commit/lost-response regression at both widths.

### B14-IV-01 — LOW: database does not enforce aggregate/history correspondence

**Location:** `apps/api/prisma/migrations/20261028170000_demo_feedback/migration.sql:53` and `68–86`.
The application transaction is at `apps/api/src/modules/demo/demo-feedback.admin.ts:127–166`.

**Reproduction:** The native SQL probe creates feedback normally, then commits
`UPDATE "DemoFeedback" SET status='ACTIONED' WHERE id=$1` without a moderation event. It also inserts
a `STATUS_CHANGED` event with a real existing User id but `fromStatus='NOT_A_STATUS'` and
`toStatus='INVENTED'`. Both writes succeed. See the named check in `adversarial.ts` and its JSON result.

**Expected:** If history correspondence is intended as a database invariant, every committed status
change must match an attributable legal transition, and event statuses must be valid and agree with
the aggregate/preceding history.

**Actual:** The content guard protects submitted fields and terminal states, but permits NEW directly
to ACTIONED without history. The event CHECK requires only distinct non-null strings; it does not
validate the status vocabulary or chain. Append-only protection preserves even a fabricated event.

**Impact:** A future writer or manual operation with ordinary application-table SQL privileges could
create misleading review history. This is defence in depth: no inspected public API permits these
writes. The current moderation service writes status, event and audit in one transaction, rejects
illegal transitions, and passed injected-failure rollback and concurrent decision checks. No remotely
reachable history bypass was established.

**Remediation:** Consider forward, deferred constraint triggers validating status/history agreement and
the legal transition chain, plus event status vocabulary CHECKs. Keep service transaction checks and
add direct SQL counterexamples. Do not rewrite migration 38 after release.

### B14-IV-03 — LOW: feedback reads exhaust the submission rate allowance

**Location:** `apps/api/src/security/policies.ts:27–29`; method-independent dispatch at
`apps/api/src/security/security.service.ts:52–59`; automatic form read at
`apps/web/src/components/demo-feedback-panel.tsx:58–68`.

**Reproduction:** With unchanged defaults (8 requests/300 seconds), establish a scenario, make eight
GET `/api/v1/demo/feedback` requests, then make the first valid POST. The POST returns 429 with
`Retry-After`. The independent probe uses a fresh limiter secret to avoid prior traffic.

**Expected:** The dedicated submission budget should count feedback writes; authorized list reads
should retain appropriate independent/general API limiting.

**Actual:** Policy selection matches only the path, so GET and POST share the feedback allowance.
Loading/reloading the feedback panel spends it. The budget is per IP, so visitors sharing an IP also
share those read costs.

**Impact:** Legitimate reading can temporarily block submissions. This tightens limiting rather than
bypassing it; reset and fresh visitor identities still cannot clear the IP bucket.

**Remediation:** Select the feedback policy for write methods, route reads to the general or a dedicated
read policy, and retain default-limit tests covering the complete browser read/write sequence.

### B14-IV-04 — INFO: original machine-readable browser count overstates new journeys

**Location:** `docs/engineering/evidence/batch14/verification-summary.json:42`.
`tests/demo-e2e/showroom.spec.ts:395` and `:489` define the two new E15-06 tests.

**Reproduction:** Compare `newBrowserJourneys: 4` with `browser-demo.log` and the test declarations.
That four-test file run includes two pre-existing tests; the full showroom suite contains five.

**Expected / actual:** Two new E15-06 tests versus four declared in the metadata. The 54 application /
5 full showroom totals are supported by the retained logs and independent rerun. The verification
report itself correctly calls the new journeys two, but also incorrectly says “non-terminal-to-terminal
rejection” at `BATCH14_VERIFICATION.md:89`; actual SQL allows closure and rejects reopening a terminal
status.

**Impact / remediation:** Evidence classification/documentation error, no product exploit. Correct
future summaries to distinguish new tests, whole-file runs and full-suite totals, use the precise
terminal-state claim, and bind future logs to source hashes. This audit preserves the original files.

## A — Visitor isolation

- Forged 43-character visitor token: 403; unknown and foreign scenario IDs: indistinguishable 404.
  Wrong-origin requests and another visitor's HMAC proof: 403, with feedback/history counts unchanged.
  Missing proof and forged schema fields are rejected by rerun repository tests.
- A stolen idempotency key without its visitor authority returns 404 against the original scenario.
  Same-key concurrent requests produce one row and the same id. Changed payload conflicts with 409.
- After visitor expiry, original-key replay returns 403. Fetching a new session creates a new identity;
  it reads zero old rows and replay against the old scenario returns 404. A key alone is not authority.
- Reset archives the original scenario; new writes to it return 409. The still-valid original visitor
  may read their own archived submission and replay their original accepted operation. This is
  intentional continued authority, not a cross-generation write or disclosure. Other visitors see zero
  rows; an expired/renewed visitor identity also sees zero.
- Raw visitor tokens are confined to the HttpOnly cookie. Stored tokenHash equals SHA-256(raw), length
  64; session, feedback and command projections contain no raw token. Source inspection confirms the
  logger redacts cookies/tokens and moderation audit does not copy the comment body.

## B — ADMIN moderation

All six authenticated showroom personas receive 403 on list, detail and mutation; the stronger test
adds a genuine SUPPORT membership role, verifies `/collaboration` succeeds, and still denies all
moderation routes without a status/history change. A separately verified real ADMIN can list, inspect
and moderate. Revoking its ADMIN role while retaining the session immediately makes all three routes
return 403; status/event counts remain unchanged. Guard authorization is reinforced by fresh
`requireAdmin` inside `iamTransaction`; the existing MFA gate remains in place.

Two simultaneous decisions with `expectedStatus=NEW` produce one 200 and one 409, with one appended
moderation event. An injected event-insert failure returns 500 and leaves the header NEW, the single
SUBMITTED event intact, and zero moderation AuditEvents. This verifies the actual application
transaction, beyond a manually rolled-back SQL example.

## C — Database and migration

Migration 38 creates two tables and adds a nullable feedbackId receipt column. Its only removal is the
old `DemoCommand_operation_check`, recreated atomically inside BEGIN/COMMIT with the exact historical
`start/switch/reset` vocabulary plus `feedback`. No historical business table/data is dropped or
rewritten. All 37 earlier SQL files match pre-Batch-14 commit `76b3911` byte for byte, with SHA-256
pairs retained in `historical-migrations.json`.

The six migration scenarios were rerun within the full integration suite: populated upgrade preserves
132 baseline tables; native ownership/generation and vocabulary checks reject misuse; restrictive keys,
content immutability, terminal closure and append-only events hold; failed writes roll back; dump/restore
preserves feedback and events and retains append-only protection. B14-IV-01 limits the stronger claim
that the database independently guarantees complete status/history correspondence.

Nullable actorId is correct for anonymous SUBMITTED events. CHECKs forbid a submitted actor and require
an existing User actor for moderation kinds. The API derives that actor from the authenticated reviewer;
it never accepts one in the visitor request. Nullable attribution is not a defect.

## D — Abuse and concurrency

The dedicated bucket really returns 429 and positive Retry-After. Independent execution used the
unchanged defaults 8/300, successfully wrote eight records across a reset, and rejected the ninth with
no extra row. The repository's separate limit-2 test also passes. Overrides of 500 are explicit in the
integration/browser harnesses, not production defaults. The feedback cap is 10 per visitor/scenario:
with nine existing rows, four concurrent fresh submissions yield 201/409/409/409 and exactly ten rows
and ten submission events. Four concurrent same-key submissions return one aggregate. HTTP dedupe-key
conflict is a safe 409, with no partial writes.

Reset intentionally starts a new per-scenario cap, but cannot reset the per-IP bucket. Anonymous
identity rotation likewise cannot bypass that bucket from one IP. This does not claim resistance to a
distributed botnet. B14-IV-03 explains why ordinary reads currently spend that same allowance.

## E — Persistence, provenance and browser behavior

Feedback retains its original scenario, visitor and generation across archival. The original visitor
can read its own archived rows through the scoped API; unrelated and renewed identities cannot. The
independent browser moderator checks archive first and then review and transition the archived item.
Capture always derives VISITOR_SUBMITTED server-side; strict input cannot supply provenance. DTO/UI
labels distinguish seeded data and explicitly deny real-participant/product-result proof.

The six independent browser cases passed at 390×900 and 1280×900. Keyboard-only submit reaches the
button from the textarea; an injected validation error preserves the draft and allows correction with
safe key reuse; normal retry succeeds. The moderator cases archive first, then sign in a real ADMIN,
review the archived comment and anonymous submission, and append a TRIAGED decision attributed to the
real reviewer. Axe (WCAG 2 A/AA, 2.1 AA, 2.2 AA) found zero violations across the four visitor/admin
checkpoints; document-width assertions found no overflow. Screenshots are retained at both widths.
The committed-response-loss cases reproduce B14-IV-02 at both widths. The repository's complete
54+5 browser regression also passes. These results establish tested browser behavior, not exhaustive
assistive-technology compatibility.

## F — Cross-batch and external gates

Batch 13 feedback service and its existing isolation scenarios remain unchanged; the complete
regression reruns those scenarios. The Batch 13 migration snapshot test change only excludes tables
that did not exist on its baseline. SupportTicket and SupportCase product code/models and existing
financial/contractual authority were not changed by Batch 14. Feedback services have no calls into
finance, procurement acceptance, support mutation or contractual state.

An independent before/after snapshot across submission, duplicate rejection, concurrent replay and
moderation compares thirteen relevant tables byte for byte. A synthetic fixture supplies one populated
CommercialOrder, ProcurementAcceptance and ArtisanPayable; those rows remain identical. Other sampled
tables remain empty, so their snapshot proves no creation, not populated-row immutability. Existing
full integration/browser regressions supply additional populated cross-batch coverage; this limitation
is not concealed.

The retention entry keeps null duration, PENDING_QUALIFIED_POLICY_REVIEW and disabled purge. DEMO_MODE
is false by default; environment validation forbids showroom mode in production and requires a loopback
`nasj_demo` database and local app URL. Ordinary-mode feedback mutations are denied. No production
collection switch, privacy approval, publication, recruitment, testimonial use or automatic external
message was enabled by this audit. The qualified E14-09 / #74 privacy gate remains pending. E19-01
participant comprehension and the pre-existing financial, contractual and operational gates remain
external; passing software tests does not satisfy them. Live GitHub gate states were not re-certified.

## Five original acceptance criteria

1. **C1 — “Shared database, input validation and abuse controls required.” — VERIFIED_SOFTWARE.**
   PostgreSQL persistence, strict schema rejection, default 429, cap and duplicate/concurrency checks
   hold. B14-IV-03 is a LOW over-throttling issue.
2. **C2 — “Capture permitted participant, relevant screen/story, category, comment and status.” —
   VERIFIED_SOFTWARE.** Cookie-derived permitted visitor, closed screen/category vocabulary, bounded
   comment, server-derived generation/provenance and stored status are independently corroborated.
3. **C3 — “Persist feedback in shared storage with validation and abuse/rate limits.” — VERIFIED_SOFTWARE.**
   Reload/reset/restore persistence, restrictive anchors, per-scenario caps and the actual default IP
   bucket hold. Application transactions are consistent; native history correspondence has the LOW
   limitation in B14-IV-01.
4. **C4 — “Restrict viewing/moderation to intended team scope.” — VERIFIED_SOFTWARE.** Own-visitor reads,
   ADMIN-only review including archived generations, all-persona/SUPPORT denial and immediate role
   revocation were verified. No unauthorized status change/history entry was observed.
5. **C5 — “Display submission errors and preserve attributable moderation history.” — PARTIALLY_VERIFIED.**
   Error display, ordinary retry, draft preservation and attributed append-only application history
   hold. Lost-commit-response followed by an edited retry lacks a usable recovery path (B14-IV-02).

**Owner acceptance remains PENDING for all five criteria.** Stop after independent verification.
