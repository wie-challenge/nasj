# Batch 6 — Showroom, evidence governance and release review

Date: 27 October 2026, Africa/Tunis. Repository: `website/`. This work extends the existing staged and unstaged implementation; prior work and the user's index were preserved. No remote GitHub mutation, persistent migration, production deployment, live transfer, real stock verification or competition submission occurred.

## A. Target story coverage

Original titles, descriptions, criteria, dependencies and project state were retrieved with authenticated read-only GitHub CLI and saved in `evidence/batch6-20261027/github-issues.json`. The exact acceptance criteria, rather than rewritten substitutes, are retained in [BATCH6_ACCEPTANCE_MATRIX.md](batch6-acceptance-matrix.md). Current results below are software implementation assessments; none implies new owner acceptance.

### #82 / E01-01 — Isolated Role-Based Demo Entry

Observed CLOSED / Done. Direct prerequisite #30 is CLOSED. Original criteria require synthetic buyer, artisan, coordinator, production, QA and finance personas, persistent isolated identity, fictional account labels and no access to production accounts. The issue's title differs from the prompt's shorthand “Multi-Persona Demo.”

Implemented: six distinct fictional Better Auth identities per visitor generation; normal provider sign-in, actual role workspaces, persistent scenario banner, same-scenario navigation, server-derived private credentials, active visitor/session binding and production-disabled entry. Every account remains subject to organization roles, grants, assignments and current membership. Selecting a persona does not repair revoked access. The browser test uses all six accounts in the actual commercial workflow.

Remaining: owner acceptance and a reviewed hosted demonstration configuration. The requested extra global governance administrator is deliberately unavailable through visitor switching because existing administrator registry functions are global. Normal separate administrator sign-in remains available for separately authorized governance review. QA has a distinct identity but uses the existing NASJ_OPERATOR plus QUALITY_INSPECTOR mapping; it retains standard operator production/logistics capabilities. Strict QA/production separation is not claimed.

Evidence: demo HTTP isolation/switch tests, connected showroom browser journey, original role/tenant/MFA regressions. Status: **IMPLEMENTED_UNVERIFIED** within the six original persona criteria; additional visitor governance access remains blocked by isolation requirements.

### #190 / E15-04 — Deterministic Isolated Demo Reset

Observed OPEN / Ready. Direct prerequisite #30 CLOSED. Original criteria require a versioned seed, clearing scenario/transient/simulated state, independent local safety reset, no real/cross-visitor effects and repeatable loading/success/error behavior.

Implemented: visitor-facing confirmation, generation-scoped CSRF/idempotency, atomic archive/recreate, initial-total reconciliation, old-session revocation, disabled old synthetic identities, public QR revocation, immutable history preservation and reset audit. Replayed concurrent identical commands create one generation. Stale requests conflict. An intentionally interrupted activation rolls back both archive and seed. Other visitor/scenario and unrelated sentinel user remain unchanged. Initial values restore one issued RFQ/quote and zero operational/financial records; this is a documented initial seed rather than a deleted financial ledger.

Remaining: automatic local safety companion reset is outside the website, which cannot access that local state. Existing simulator `deleteLocalData()`/new-process guidance is separate; no monitoring history is uploaded. Hosted retention/quotas and owner acceptance remain pending. Status: **PARTIALLY_IMPLEMENTED** against the entire original reset criterion, with the independent safe business reset implemented and tested.

### #193 / E15-07 — Consistent Proposed, Synthetic and Verified Evidence Labels

Observed OPEN / Ready. Direct prerequisite #30 CLOSED. Original criteria cover four classifications, evidence references, dashboard/QR/payment/impact labels, prevention of unsupported verification and export/screenshot/presentation integrity.

Implemented: shared provenance contract and canonical labels; server publication rejects MEASURED/VERIFIED without an approved policy (none exists), even when reviewer and policy fields are fabricated. Synthetic/proposed data cannot carry forged measurement timestamps. Allowlisted privacy-safe sources and limitations appear on landing, public methodology, presentation, directory, commercial examples, logistics/producer-share, payment simulations and compensation. QR and report JSON/CSV retain material provenance. Export labels are recomputed rather than trusting caller captions. Print styles preserve notices.

Remaining: no approved measurement/verification authority or field results, so those publication paths intentionally remain unavailable. No nonexistent impact dashboard is asserted complete. A comprehensive owner review of every future/exported artifact and external screenshot remains required. Status: **IMPLEMENTED_UNVERIFIED** for the existing implemented surfaces and negative authority boundary.

### #187 / E15-01 — Evidence-Labeled HirfaCare Concept Landing Page

Observed CLOSED / Done. Direct prerequisite #30 CLOSED. Original criteria require labeled claims, buyer/artisan explanation, focused embroidery hypothesis, primary supply-chain versus optional safety track, discovery evidence and responsive scenario/presentation navigation.

Implemented: existing visual language retained; hypothesis versus synthetic software shown explicitly, Tunisian context and managed workflow explained, voluntary participation and coordinator scope clear, optional local safety separate, and working /demo, /evidence and /presentation pathways. Normal environments show an unavailable-demo explanation without enabling persona switching. Responsive/reduced-motion/keyboard/public-print checks exercise the information surfaces.

Remaining: actual discovery interviews, time-study and partner/impact evidence do not exist in the inspected project. The evidence page records that absence rather than fabricating source links or endorsements. Status: **PARTIALLY_IMPLEMENTED** against the field/discovery evidence requirement; CLOSED is the observed remote state, not a new acceptance claim.

### #199 / E17-02 — Phase 1 Technical Report and Evidence References

Observed OPEN / Proposed. Direct gates #22, #25 and #23 are OPEN / Proposed; #193 is OPEN / Ready. Discovery/time-study approvals remain outstanding. Original criteria call for organizer headings, ≤6 pages, 150–250-word abstract, 3–6 keywords, citations, limitations and reviewed PDF/anonymity.

Implemented: editable `docs/competition/PHASE1_TECHNICAL_REPORT.md`, traceable project references and G1–G8 missing-evidence register, source validator and submission checklist. Abstract is 204 words with five keywords. It distinguishes implemented software, synthetic outcomes, proposed research and missing evidence. Separate deterministic AI/safety repositories are described as optional, not integrated trained models or certified devices.

Remaining: official brief retrieval was explicitly skipped at the owner's request; exact headings/layout/anonymity/deadline therefore remain unverified. No PDF was fabricated or claimed page-validated. Owner-approved research, final template/layout/export/readability/anonymity and sign-off remain pending. Status: **PARTIALLY_IMPLEMENTED**, report source ready for content review, not submission-ready.

### #200 / E17-03 — Anonymous Three-Minute Phase 1 Progress Video

Observed OPEN / Proposed. Gates #187 observed CLOSED, #193 OPEN. Original criteria require approximately three minutes, anonymous content, minimal editing, actual progress, final rendered playback/audio/identity review.

Implemented: seven scenes totaling a planned 180 seconds; complete narration; recording sequence tied to real software; evidence labels; editing, metadata, anonymity, playback and owner-review checklists. Source timing arithmetic is validated.

Remaining: no footage/render, actual duration, audio/caption quality or final identity-cue audit exists. Organizer tolerance/anonymity are unverified after the requested source-retrieval skip. No video upload or submission was performed. Status: **PARTIALLY_IMPLEMENTED**, preparation package in Draft status.

## B. Shared demo

Seed version 1 creates fictional buyer/internal/association organizations, six accounts, linked and accountless artisan examples, matching capacity period, synthetic feasibility/cost/sample, one ten-piece cotton-runner RFQ and issued 150.000 TND quotation. There is initially no accepted order, offer, batch, inventory, shipment, payable, simulation or published QR. Preparation assumptions are seeded and labeled; the visitor does not pretend to have measured them.

Buyer acceptance creates the order through the existing API. Production assesses eligibility and issues an offer; the linked artisan accepts via their own session. Production releases the synthetic batch; artisan reports/submits; QA inspects and prepares approved units; coordinator records collection; operator records hub custody/dispatch/delivery; buyer confirms. Operator publishes approved QR content, recognizes payables and requests payout; a distinct finance reviewer approves; the existing simulated settlement remains separate from verified paid. The connected browser scenario completes this route and then resets with another visitor still active. Accountless reported acceptance remains pending, produces no batch and cannot be verified through an unsupported path.

DemoVisitor identifies a random 24-hour control secret by hash. DemoScenario stores version/generation, seed, owned organizations and RFQ. DemoIdentity binds only that generation's fixed fictional persona to its User. DemoCommand stores scoped idempotency evidence. Reset archives instead of deleting and revokes old QR publications without erasing prior stories/events. Totals and business stage are derived from actual database records, including offered capacity reservations separately from accepted commitments. Presenter refresh and safe workspace links keep the scenario visible while retaining normal service authorization.

The visitor controls only synthetic scenario data; six selectable perspectives do not imply six isolated real people or live consent. Global administration is not part of visitor switching. The full guide and reset lifecycle are in [DEMO_SCENARIO_GUIDE.md](demo-scenario-guide.md) and [DEMO_RESET_RUNBOOK.md](demo-reset-runbook.md).

## C. Evidence governance

`EvidenceMetadata` supports claim identity/type, classification, source/reference, optional scenario and timestamps/reviewer/policy, limitations and canonical display label. No approved measured or verified authority is configured. Server builders and publication validation fail closed instead of trusting UI labels. Domain states remain separate: SYNTHETIC never becomes PAID_VERIFIED or physically verified stock, and a PROPOSED research outcome is not an implemented benefit.

Public sources are allowlisted methodology anchors rather than raw personal evidence. UI notices remain in screenshots and print/presentation mode. JSON/CSV report exports and QR records retain provenance and limitations. There are no income-uplift, medical prevention, partner endorsement or field deployment claims. The complete policy is [EVIDENCE_PROVENANCE_POLICY.md](evidence-provenance-policy.md).

## D. Security

Demo mutations require the visitor cookie, exact Origin, X-Demo-CSRF and Idempotency-Key. Commercial mutations continue using normal session CSRF. Better Auth signs its own sessions; no token is fabricated. The server alone derives generated credentials and stores provider password hashes. API guard and authentication gateway reject marked showroom accounts without matching visitor ownership or outside demo mode. Reset/sign-in races recheck active generation and session epoch; stale provider sessions are removed. Account lifecycle, suspended memberships, revoked grants and assignments remain effective before business writes/replay.

The normal environment cannot enable showroom entry; demo configuration requires a non-production runtime, loopback nasj_demo DB and loopback public origin. Existing auth cookie namespaces remain separate. Public control status is no-store. Unrelated users and sessions are outside reset ownership. Tests cover stolen provider cookies without visitor proof, cross-visitor RFQ IDs, administrator denial, stale/reset replay, cross-owner reset, current membership suspension and accountless blocker. Existing global MFA/tenant/finance/custody regressions remain relevant independently of demo tests.

No worker health or wearable data is seeded or exposed through commerce. Local safety reset stays local. Retained generations are not automatically purged; hosted operation needs reviewed retention, quota and abuse-management procedures. A local demonstration is not an authorized internet service deployment.

## E. Files changed

Batch 6 additions are distinct from the recorded pre-existing dirty tree.

- Frontend: demo showroom/provider/banner and demo API client; root layout and /demo; landing, /evidence and /presentation; evidence notice; directory/commercial/logistics/trace labels; responsive/print styling; new tests. Web package uses ESM so runtime shared-contract imports work in unit checks.
- Backend: `modules/demo/{demo.service,demo.seed,demo.controller,demo.module,demo-access}`; AuthGuard/auth gateway ownership checks; app module registration; loopback demo environment checks; QR and report provenance metadata.
- Contracts: demo scenario/control/totals and provenance metadata/validation/builders/exports; shared exports. Existing business contracts/states remain authoritative.
- Database: four new demo registry models and additive 090000 migration. Prisma relation metadata matches the new SQL FKs; earlier inventory/finance relation drift is recorded separately.
- Tests/tooling: real HTTP demo tests/runner; connected demo Playwright suite and independent config/setup; normal public-evidence browser checks; restored pre-Batch6 upgrade drill; support for disposable demo/baseline DBs; competition source validator. Seed setup recognizes explicitly registered visitor identities when re-run without treating arbitrary addresses as demo users.
- Documentation: this report, original-criteria/45-story acceptance matrix, scenario/reset/evidence/migration guides, three competition source/checklist files, README/API/tracker notes and raw evidence.

No passwords, private `.env` files, generated databases or screenshots with real people are committed by this implementation. No git staging/commit/reset was performed by the agents during this batch.

## F. Migration and release readiness

Migration 090000 follows the eight preceding additive migrations and adds only scenario ownership/replay tables and constraints. Existing immutable histories remain protected. The pre-Batch6 drill backs up a populated twenty-migration source, verifies encryption/archive integrity, restores it into a second disposable DB, then applies migration 21 using normal migrate deploy. Every prior business-table row hash remains unchanged. The existing encrypted dump/restore scenario also verifies full-schema restoration.

Read-only schema diff identifies existing SQL-enforced inventory/finance foreign keys absent from Prisma relation metadata. The new demo relations are modeled explicitly; the older difference is not silently removed or declared clean. Do not apply the generated diff or use db push. Persistent deployment requires owner review of that metadata and all retained checks/triggers on a restored copy. The exact output and procedures are in [MIGRATION_READINESS.md](migration-readiness.md).

The existing local development migration status was attempted read-only and returned UNAVAILABLE; no production backup was inspected. No development launcher, demo setup, persistent migration or deployment command was run. Synthetic restore success demonstrates review readiness, not that staging or production has been migrated.

## G. Competition deliverables

- PHASE1_TECHNICAL_REPORT.md: **Ready for content review**, editable draft with references and evidence requirements; official format/PDF/anonymity not validated.
- PHASE1_VIDEO_STORYBOARD.md: **Draft**, complete seven-scene narration/timing/recording/editing package; no final video exists.
- PHASE1_SUBMISSION_CHECKLIST.md: **Draft**, missing organizer, eligibility, export and owner gates tracked.
- `pnpm competition:validate`: **Validated source checks only** (204 abstract words, five keywords, planned 180 seconds). It does not validate absent renders or submission.

No final PDF/video or external competition submission is claimed. “Validated source” does not mean “Finalized.” Official brief retrieval was skipped exactly as requested; the recorded backlog date of 5 November 2026 is not represented as newly verified organizer guidance.

## H. Automated tests

Executed from `website/` on 27 October 2026:

- `pnpm lint` — PASS, 343 files, zero findings.
- `pnpm typecheck` — PASS, contracts, API, API test/tool scripts, Next route generation and web. Final web quantity-display typecheck also passes.
- `pnpm --filter @nasj/api test` — PASS, 74 tests; zero failed/skipped.
- `pnpm --filter @nasj/web test` — PASS, 19 tests; zero failed/skipped.
- `pnpm test:integration` — PASS, 114 scenarios using newly created disposable PostgreSQL and captured SMTP. Includes the full existing business/security suite, six-persona/reset/accountless/isolation cases, encrypted restore of 100 tables / 2,260 synthetic rows, and the populated pre-Batch6 normal upgrade drill.
- `pnpm --filter @nasj/api test:demo` — PASS, three real HTTP scenario groups, including concurrent reset replay, interrupted reset rollback, unchanged unrelated user/session and cross-visitor scope, accountless acceptance and suspended-membership enforcement.
- `pnpm --filter @nasj/api exec tsx test/migration-readiness.ts` — PASS, populated twenty-migration backup restored and upgraded normally to twenty-one; all 96 pre-Batch6 table hashes preserved except migration bookkeeping. New demo relation metadata matches SQL; older inventory/finance foreign-key drift is explicitly recorded rather than called clean.
- `pnpm test:e2e` — PASS, 38/38 standard browser tests, then 2/2 showroom tests on a separate isolated demo build; 40 passed in total, zero failed/skipped. Includes public provenance at mobile/desktop widths, print labels, accessibility/keyboard checks, real RFQ-quote-to-settlement-to-reset flow, other-visitor preservation and mobile reduced-motion navigation.
- `pnpm test:e2e:demo` — PASS, focused showroom suite, 2/2. `pnpm exec playwright test tests/e2e/nasj-rebrand.spec.ts` also passed 2/2 after updating the original landing-copy assertion; WCAG-tagged axe checks remain intact.
- `pnpm build` — PASS, contracts, API and optimized Next build.
- `pnpm --filter @nasj/api exec prisma validate` — PASS.
- `pnpm competition:validate` — PASS_SOURCE_CHECKS_ONLY: abstract 204 words, five keywords, planned storyboard 180 seconds; PDF not verified, video not rendered, official format not verified, not submitted.
- `sha256sum -c docs/engineering/evidence/batch6-20261027/initial-migration-hashes.txt` — PASS, all eight earlier additive files unchanged.
- `git diff --check` — PASS.
- `pnpm db:status:local` — UNAVAILABLE / exit 1, ECONNREFUSED. This was a read-only attempt against existing local development configuration; no service was started or migration applied. It is not counted as a passing deployment check.

Raw logs are retained under `evidence/batch6-20261027/`. Initial browser regressions expected the former marketing headline; the final tests check the new truthful copy and retain accessibility/account-menu assertions. Other initial moving-implementation failures included seed JSON key ordering, mobile badge overflow, an overly exact acceptance-text selector and the web unit ESM loader. Final passing runs follow those fixes. The deliberate activation-failure trigger test expects a safe 500 and verifies rollback rather than counting an interrupted reset as success.

No failed/skipped checks are counted as passing. Tests use newly created disposable databases, fictional identities and actual APIs. Initial development runs exposed JSON-order reconciliation, mobile badge overflow, test confirmation/locator issues and an ESM unit-loader mismatch; each was corrected before final evidence. The deliberate interruption test produces a safe 500 and asserts rollback; that is an expected negative outcome, not a passing reset response.

## I. Previous backlog acceptance review

[BATCH6_ACCEPTANCE_MATRIX.md](batch6-acceptance-matrix.md) records all 45 prior stories across capacity/directory, commercial decisions, offers, execution/quality, logistics/traceability and inventory/finance. Each entry preserves original criteria, observed GitHub state, dependency states, implementation/test references, known blockers, owner status NOT_RECORDED and proposed disposition. No owner-accepted status is inferred.

Documented synthetic software slices are ready for owner review where original criteria permit that scope. Inventory verification, live bank settlement, entitlement/tax/legal policy and accountless verification remain partial or blocked. Earlier CLOSED issues remain observed CLOSED; their working-tree extensions still require appropriate acceptance. Supporting #194 seeded regressions, #195 setup documentation and #79 tenant/object isolation are evaluated without remote status changes or new completion claims. A full clean external checkout rehearsal remains separate from this installed-workspace run.

## J. Next development readiness

**Phase 1 presentation:** software supports a repeatable synthetic presentation subject to final test outcomes, presenter rehearsal and truthful limitations. Submission is blocked by official-format/anonymity confirmation, owner-reviewed research gaps and final report/video renders.

**Competition prototype phase:** a connected demonstrable website is available for acceptance review. Remaining product policies, local hardware implementation/physical testing and any approved AI integration must be evaluated separately. Deterministic software rules are not trained-model accuracy or field validation.

**Persistent staging:** additive compatibility and backup/restore have disposable evidence. Deployment is not authorized or performed. Schema metadata reconciliation, environment-specific security/recovery, owner acceptance and the concrete target migration review remain gates.

**Controlled real-world pilot:** not ready on this evidence. Independent stock and bank evidence, compensation/cancellation procedures, tax/invoice/legal/privacy approval, operational training and deployment validation are still required. A successful showroom, reset or synthetic payment cannot satisfy those gates.
