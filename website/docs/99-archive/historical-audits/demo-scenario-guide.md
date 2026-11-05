# Isolated showroom scenario guide

Use the website repository; the sibling AI and IoT repositories are optional and are never imported by website runtime. Prerequisites: Node 24, pnpm 11.3, Docker/Compose with the default context. Run `pnpm install --frozen-lockfile`. Never put real records in the showroom.

## Start an isolated local showroom

The existing `pnpm demo:setup` command provisions the dedicated local `nasj_demo` database and deploys migrations there. This writes a persistent local demo database: run it only after its owner authorizes that setup/migration. Batch 6 automated checks do NOT run this command or migrate existing development/staging/production databases. Review `.local/demo.env` privately and `MIGRATION_READINESS.md` first.

After separately authorized setup, use `pnpm demo:api` and `pnpm demo:web` in two terminals. Open http://127.0.0.1:3200/demo. The server requires DEMO_MODE=true, a loopback-only nasj_demo database and loopback public origin. Normal production configuration cannot enable visitor switching. Development MFA relaxation applies only to the isolated demonstration; production retains mandatory MFA.

Start Demo creates a visitor-owned generation with six real Better Auth accounts and three fictional organizations. Passwords are server-derived and never returned to the visitor. The HttpOnly visitor cookie controls only this visitor's scenario. No shared credential or session-token copy is required. Choose Persona signs into that scenario's actual account using Better Auth. Commercial API writes still require their ordinary authenticated CSRF proof and permissions.

## Six original personas and role mapping

Buyer uses BUYER_REPRESENTATIVE with explicit quotation approval. Artisan is a profile owner and can decide/report only their own work. Coordinator uses ASSOCIATION_COORDINATOR with current assignments and approved management. Production uses NASJ_OPERATOR with explicit material and finance request grants. QA is a distinct account using NASJ_OPERATOR plus QUALITY_INSPECTOR; it retains the existing operator role's production/logistics authority, so this is not strict production-versus-QA separation. Finance uses FINANCE_MANAGER and explicit scoped review grants; independent approval remains required.

The user prompt also requested a platform governance perspective. Global administrator functions are not offered through anonymous switching: they can inspect global identities and would violate visitor isolation. Existing governance administrators use their separately authorized normal account and review workspaces. No seventh global business role or unscoped visitor administrator is created. This limitation remains explicit in #82 coverage.

## Known starting state and walkthrough

Seed version 1 starts at one synthetic RFQ with an issued 150.000 TND quotation for ten cotton runners, approved synthetic feasibility/cost/sample assumptions, BOM and inspection criterion. It has no accepted order, offer, commitment, produced/approved/prepared/shipped/delivered units, payable, inventory lot, settlement or published QR. Seeded commercial preparation is labeled; it is not evidence that the visitor created or measured those inputs. Buyer acceptance is a real API transaction and creates the order. For an earlier procurement stage, the buyer can create a new RFQ through the normal workspace; all records in this scenario's owned organizations are included in its totals and archive scope.

1. Buyer: open the scenario request, inspect specification/quotation, confirm and accept the exact version.
2. Production: open Production, inspect feasibility/costing, assess eligibility and prepare/issue an offer to the linked artisan. Use the scenario's displayed production period and expiry. The accountless participant can receive a separately reported decision, but it remains pending and creates no commitment.
3. Artisan: inspect the offer, accept voluntarily, then wait for operator release. A refusal remains valid and does not punish future eligibility.
4. Production: release accepted work only under explicit synthetic material/funding attestations. If inventory custody is used, incomplete/disputed/pending physical verification blocks progress; no demonstration control overrides it.
5. Artisan: start, save cumulative progress and submit reported units.
6. QA: inspect submitted pieces and reconcile approved/rejected/pending. Prepare only approved units.
7. Production: schedule pickup with the coordinator account ID visible in normal authorized participant/custody workspaces. Coordinator records collection; Production records hub receipt and synthetic dispatch, then delivery report. Buyer confirms received/accepted/missing/damaged quantities.
8. Production: draft, review and publish privacy-safe traceability; open the real public QR page. Small cohorts suppress producer-share percentages.
9. Finance/Production: recognize buyer-accepted payables with the dedicated grant, request payout, independently approve, and demonstrate existing synthetic settlement separately. Verified paid stays zero and closure blockers remain visible.
10. Return to /demo to inspect real record totals and stage. Reset with confirmation to create a fresh generation. No old ledger is deleted.

Stage guidance and totals derive from current database records; use Refresh demo status after actions performed in the same workspace. Safe links lead to permitted workspaces, not a bypass endpoint. Switching discards old scenario sessions, so other tabs must refresh to the current persona.

## Testing and diagnosis

`pnpm test:e2e:demo` builds a separate demo frontend against a newly created disposable nasj_demo PostgreSQL container and actual API. `pnpm test:e2e` executes ordinary regressions and then the separate demo suite sequentially. `pnpm --filter @nasj/api test:demo` checks control proof, six accounts, isolation, concurrency, replay and interrupted reset. No persistent database is required. Use the Batch 6 evidence logs for outcomes, not this guide as a passing-test claim.

403 DEMO_CSRF_REJECTED: reopen /demo and refresh its proof; never disable CSRF. 409 stale generation: resume current status instead of reusing archived command keys. A disabled account or revoked membership remains denied; selecting its persona does not restore grants. Seed inconsistency rolls back rather than claiming success. Unavailable demo entry in normal mode is expected. Do not log credentials or connection URLs while diagnosing failures.

## Batch 7 presentation and financial exploration

`/presentation` is the ten-scene interactive pitch. Use previous/next, arrow keys or space while focus is outside an interactive control. Scene navigation retains keyboard focus; fullscreen uses the browser's native exit/Escape behavior. Notes are opt-in and hidden when entering fullscreen. Resume stores only a local scene number; it does not restore a persona or grant access. Reduced-motion preferences are respected. Scene 7 links to the real isolated showroom; scene 9 embeds the standalone model. Presentation is an explanation of implemented software and explicit hypotheses, not field evidence.

`/simulator` works without a demo account. It compares baseline, optimistic, conservative and custom assumptions, including effort minutes and hourly/unit compensation. Results use exact millimes and disclose variable/fixed costs, rejection, contingency, estimated break-even and producer-share assumptions. Full artisan compensation is preserved on modeled rejected pieces. Changes remain only in component memory and never update a quote, order, payable or payment. Reset to baseline resets this model only, not the showroom. Zero denominators and invalid inputs are explicit; negative contribution is shown as a loss. No scenario result establishes actual income or profit.

The showroom now shows shared scenario/order references and stage guidance in the banner and scenario view, refreshing while visible and on return to the tab. An order reference appears only after buyer acceptance. Use the current persona's authorized workspace links; a link never grants missing scope. Switching still revokes previous persona sessions, and reset still archives only the visitor's generation.

Competition source and artifacts are tracked in `docs/competition/ELIGIBILITY_AND_TRACK_REGISTER.md`, `PHASE1_SUBMISSION_CHECKLIST.md` and `ARTIFACT_VALIDATION.md`. The organizer-linked brief was retrieved during Batch 7, superseding the earlier skipped source lookup. Team membership/roster collection was skipped at the user's request, so eligibility and final sign-off remain blocked. Local report/video preparation does not authorize uploads. See `BATCH7_IMPLEMENTATION.md` and `BATCH7_ACCEPTANCE_MATRIX.md` for independent status and final executed evidence.
