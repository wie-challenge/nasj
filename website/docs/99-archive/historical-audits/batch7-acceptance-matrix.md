# Batch 7 — Independent acceptance matrix

27–28 October 2026. Evidence source: read-only live `evidence/batch7-20261027/github-issues.json`, final backlog v2.0 and organizer-linked specification identified in `official-source.json`. Remote issue state is not owner acceptance. Final automated/artifact outcomes are authoritative only when recorded in `BATCH7_IMPLEMENTATION.md` I and the artifact-validation record; unresolved owner/research checks below are not passes. No GitHub issue was modified.

## E15-02 — Shared simulated order, #188

Remote: CLOSED / Done. Dependencies #82/#33/#37/#45/#54 CLOSED / Done. #82 remains E01-01 and is not used as the mapping for this story.

- **Order state consistent across dashboards:** implemented through one visitor-owned scenario/RFQ/order and ordinary database-backed domain APIs. No independent per-role order mocks. Expanded real HTTP/browser scenarios require the same ID and changed state across roles; final browser outcome recorded in the implementation report.
- **One isolated ID across buyer, artisan, coordinator, QA and finance:** six existing personas include production. UI shows shared scenario/order references; pre-acceptance explicitly has no order. Assertions cover the six-persona sequence; final browser outcome recorded in the implementation report.
- **Allowed changes persist through switch/refresh:** existing transactions remain authoritative; visible/focus/route refresh and revision guards update the shared projection. Switching invalidates prior persona sessions. Browser continuity/reset and stale-generation coverage are exercised by the final real-API showroom suite.
- **Same quantity, acceptance and status invariants:** existing scoped production/quality/logistics/finance contracts are reused. Revoked scope, other visitor and ordinary-mode denial remain required negative checks; integration and showroom capture checks pass; final full-suite outcome is recorded in the implementation report.
- **Synthetic identities, amounts and downstream metrics:** shared provenance and role-restricted totals retained. Financial privacy, voluntary acceptance, accountless pending reports and verified-paid zero are preserved; final regression evidence is recorded in the implementation report.

Assessment: **Original software criterion verified; ready for owner acceptance**. Remote closure does not establish real orders, physical stock or bank settlement.

## E15-03 — Full-screen presentation, #189

Remote: OPEN / In Progress. Dependency #187 CLOSED / Done.

- **Keyboard navigation, notes, reduced motion and resume:** implemented in ten-scene `/presentation`; browser assertions cover those controls, all four presentation browser cases pass in the final run.
- **Ordered steps, next/previous and focus:** arrows/space/buttons/direct navigation/progress, bounded endpoints, heading focus and interactive-control key exclusions implemented.
- **Separate presenter notes:** hidden by default and when entering fullscreen; explicit notes toggle. Objective, narration, timing, action, source and limitations exist for every scene. No notes state persists to a later audience session.
- **Reduced motion and exit/resume:** CSS respects reduced motion; native fullscreen supports safe Escape/exit. Only a bounded non-sensitive scene number persists; blocked storage does not block presentation.
- **Readable charts and labels:** scene 9 embeds real calculated model results, not decorative financial outputs. Mobile layout, visible evidence labels and scene/demo links are covered by browser tests; all four presentation browser cases pass.

Assessment: **Original software criterion verified; ready for owner acceptance**. No accessibility certification or production/competition readiness is inferred.

## E15-05 — Financial scenario comparison, #191

Remote: OPEN / Proposed. Dependencies #36 CLOSED / Done and #105 OPEN / Proposed. The independent synthetic model does not approve the upstream actual earnings policy.

- **Changing parameters gives valid totals:** pure exact millime calculation and field-bound validation implemented. Six financial unit tests PASS within the 25-test web suite; both simulator browser cases pass.
- **Quantity, labor effort/rate, materials, transport and disclosed assumptions:** all configurable; compensation supports direct unit agreement or rate × minutes / 60. QA/packaging are per produced piece, transport/overhead per order, percentages explicitly bounded. Baseline/optimistic/conservative/custom visible.
- **Revenue, costs, contribution and effective pay consistent:** unit tests cover exact baseline, changed effort, hourly rounding, conservative loss, zero inputs and rejection preservation. Break-even is an explicitly pre-rounding continuous planning threshold. Undefined ratios are distinct from signed losses.
- **Missing/invalid inputs:** bounded canonical decimal/whole-number parsing; custom results withheld on missing/invalid input. Zero revenue/effort and extreme producer ratios have explicit behavior. Tests PASS; both simulator browser cases pass.
- **Separate from accepted quotes/orders and synthetic:** the engine imports only pure helpers, accepts no business IDs and makes no API calls; component state is ephemeral. Browser requests assertion requires zero API mutations on input changes. Producer-share policy denominator/rounding is reused with explicit hypothetical cohort and public ceiling disclosure; no verified income or wage deduction is claimed.

Assessment: **Original software criterion verified; ready for owner acceptance**. Upstream measured policy remains open; this assessment concerns the disclosed synthetic model.

## E17-01 — Eligibility and primary track, #198

Remote: CLOSED / Done. Dependency #81 OPEN / Proposed.

- **Membership/3–4 roster:** official requirement VERIFIED from the organizer-linked PDF; actual roster/memberships **NEEDS_EVIDENCE**. The user skipped collection. No membership evidence was invented.
- **Primary Track 2, optional Track 3:** documented consistently with source/backlog. Single primary track; separate unverified safety concept. Named owner track sign-off **NEEDS_OWNER_CONFIRMATION**.
- **Owner/status for ambiguity:** register records competition-lead responsibility (name not supplied), unresolved cutoff timezone/portal, participant-category questions and unlisted format/IP details. Named owner decisions remain pending.
- **Source/version retained:** organizer URL, retrieval date, PDF hash, extracted text and reviewed page evidence retained. Requirement discovery supersedes the Batch 6 skipped lookup, not the missing team evidence.

Assessment: **Partially implemented; blocked by eligibility evidence and owner sign-off.** Does not satisfy every original criterion despite remote closure.

## E17-02 — Technical report, #199

Remote: CLOSED / Done. Dependencies #22/#25/#23 OPEN / Proposed; #193 CLOSED / Done.

- **Required headings, abstract 150–250 words, 3–6 keywords, citations and six-page ceiling:** editable report updated; `output/pdf/PHASE1_TECHNICAL_REPORT.pdf` rendered as six pages. Final content, word-count, keyword and visual results are recorded in `../competition/ARTIFACT_VALIDATION.md`; six pages, 204 abstract words and five keywords verified; all PDF pages visually inspected.
- **Architecture, feasibility, evidence, innovation and limitations:** report describes actual implemented software, modeled economics and missing research. No fictional interviews, measured time studies, AI benchmark or hardware validation substitutes for missing evidence.
- **Exported readability/anonymity before owner sign-off:** all PDF pages were visually reviewed and source/metadata inspected; independent review remains pending. The official brief explicitly requires anonymous video; report anonymity is conservatively reviewed without inventing an additional organizer rule.

Assessment: **Technically checked six-page review candidate; independent review and owner acceptance pending.** Missing research is disclosed; its dependency status is not changed.

## E17-03 — Anonymous three-minute progress video, #200

Remote: CLOSED / Done. Dependencies #187/#193 CLOSED / Done.

- **Problem, solution, actual progress and limitations:** storyboard and real application capture support the review artifact. Fictional identities and synthetic records only.
- **Approximately three minutes and minimal editing:** `output/video/PHASE1_PROGRESS_REVIEW.mp4` is a rendered 180.046-second 1280 × 720 H.264/AAC review candidate with local narration and burned captions. Official tolerance beyond “three-minute” is not specified and remains an owner/organizer check.
- **Footage, narration, filename, screens and metadata anonymity:** engineering samples/metadata inspected in `ARTIFACT_VALIDATION.md`; final independent anonymity audit remains required; synthetic narration and any identity-removal/caption limitations must be disclosed.
- **Rendered playback/audio/labels:** full decode and seven scene samples inspected; full human playback/listening remains pending. A rendered review cut is not an owner-approved final submission.

Assessment: **Rendered review candidate; independent full playback, anonymity and owner sign-off pending.** Does not satisfy full completion until actual evidence is recorded.

## E17-06 — Submission compliance checklist, #203

Remote: CLOSED / Done. Dependencies #198/#199/#200 CLOSED / Done remotely; #202 OPEN / Proposed.

- **Phase-specific artifacts, formats, deadlines and owners:** checklist/register updated from official sources. Phase 1 5 November and Phase 2 10 December 2026 verified; exact portal/cutoff timezone and named owners pending.
- **Access, anonymity, membership, citation/plagiarism review:** source and artifact audit can be recorded, but actual membership, independent originality/AI-use review, required repository access and owner approval remain open. Agent assistance is disclosed.
- **Final versions, timestamps and blockers:** artifact validation/manifest must record final file hashes and actual reviews; unresolved items remain explicit rather than checked off.
- **Actual submission receipt:** **not performed**, not authorized by this implementation request. Receipt/reference is unavailable. Phase 2 #202 deliverables are excluded from this batch and remain open.

Assessment: **Checklist implemented; final compliance blocked.** A prepared package is not verified eligibility, accepted submission or Phase 2 completion.

## Exclusions and regression boundaries

E15-01 truthful concept, E15-04 scoped reset, E15-07 provenance, E16-03 journey testing, E16-04 instructions and E16-09 tenant isolation remain regression obligations. Final results belong in the implementation report. No new persistent migration, deployment, physical verification, bank reconciliation, verified payout, accountless acceptance, IoT certification, AI training, persistent coworker feedback or Phase 2 evidence pack is claimed.
