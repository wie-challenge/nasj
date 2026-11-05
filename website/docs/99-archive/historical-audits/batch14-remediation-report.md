# Batch 14 focused remediation — E15-06 / #192 — B14-IV-02

29 October 2026 · Africa/Tunis. **Owner acceptance: PENDING.** Software evidence is synthetic.

## Result and scope

B14-IV-02's client retry workflow is repaired. The independent counterexample first reproduced on the
original source at both widths; the same commit-loss/edit sequence now recovers the original record,
preserves the edits and requires an explicit new submission to save them. The server's conflict,
ownership, CSRF, rate, cap, provenance and moderation guarantees were not changed.

**All five original E15-06 software criteria are VERIFIED on current source, including C5.** Batch 14
is ready for owner acceptance review with the two disclosed LOW hardening findings. This is a software
recommendation, not owner acceptance, deployment authorization or privacy approval.

This remediation covers only B14-IV-02 and the associated evidence correction. B14-IV-01 and
B14-IV-03 remain LOW future hardening items. No schema, trigger, rate-policy or production API change
was made. Batch 15 and backlog state changes remain outside this work.

## Starting state and preservation

HEAD was and remains `f0b3d756dce0ea4ec3bde0addcb92fcff7d54844`, the committed Batch 14 implementation.
Its implementation was already committed; it was not assumed to be uncommitted. Initial Git status
contained only the previous independent verification report and its evidence directory as untracked
work. The exact full status and hashes of all initial tracked/untracked files are in
`evidence/batch14-remediation/baseline.json`. The historical independent report and every file in its
evidence directory remain byte-identical. The original Batch 14 execution logs and planning documents
are also preserved. Changes in original summary metadata are explicit corrections, not new executions.

The only product file changed is `apps/web/src/components/demo-feedback-panel.tsx`. Test changes add
`tests/demo-e2e/feedback-recovery.spec.ts`, adapt the existing failed-request journey in `showroom.spec.ts`,
and add a disposable-fixture visitor-expiry control and rate-test option in `tests/e2e/setup.ts` /
`apps/api/test/support.ts`. This control is a nonce-protected loopback test server, available only for
synthetic demo fixtures; it is not registered in the application API and handles scenario ids rather
than raw visitor cookies.

No staging, commit, push, stash, reset, clean, deployment, GitHub mutation or persistent database
migration was performed. All SQL and expiry injections used newly created disposable PostgreSQL
17.7-alpine containers with local SMTP capture. There is no new sensitive browser storage purpose:
pending payloads, keys, drafts and accepted results live only in React component memory.

## Root cause

The old component retained only an idempotency key. On every attempt it rebuilt the payload from the
current editable category, screen and comment. After the first operation committed but its response
was lost, edits caused the client to send a different payload under that same key. The server correctly
returned 409 `IDEMPOTENCY_CONFLICT` repeatedly. The original draft-preservation test simulated a failure
before persistence and did not expose this committed-operation ambiguity.

## Exact client change

- At `demo-feedback-panel.tsx:59–65`, pending operation state contains a readonly key and readonly
  payload, separate from the editable form, last accepted result and preserved-edits indicator.
- At `:86–99`, a new operation freezes a scalar payload snapshot and creates a new random key. Every
  uncertain retry reuses that pending snapshot and key, regardless of later edits.
- At `:100–111`, success displays the actual API-accepted feedback. It clears the pending operation and
  clears the comment only if screen, category and comment still match the submitted snapshot. Later
  edits remain intact and are not sent automatically.
- At `:112–116`, a definitive HTTP 400 validation rejection releases the unsuccessful operation so a
  corrected draft can start a fresh one. Network failures, 5xx, rate limits and authority failures keep
  the pending original operation and the draft.
- At `:178–201`, the form labels its pending action **Retry original feedback**, explains that edits
  stay in the form, and after reconciliation offers **Send edited feedback as new submission**. That
  explicit action creates a fresh key. At `:210–218`, **Accepted feedback** shows the original accepted
  content, distinguishing it from the editable draft.

The accepted feedback is plain React text with the existing provenance notice. Neither raw visitor
tokens nor comment drafts are written to localStorage/sessionStorage, URLs, logs or other persistent
browser storage. Existing scenario-keyed component remounting remains intact. Reload is unnecessary for
reconciliation, though it still discards memory-only state by design.

## Focused reproductions and regression cases

The original independent test was copied into the remediation evidence directory with only its output
paths redirected, preserving all earlier evidence. Its two “lost committed response followed by edited
retry conflicts” cases passed on the baseline source by **confirming the defect**, not by confirming
correct behavior (`baseline-reproducer.log`, `baseline-browser.json`).

The new permanent regressions implement the same real commit/response-loss mechanism and assert the
corrected outcome, at 390×900 and 1280×900. `route.fetch()` sends the original POST to the real API and
requires 201 before `route.abort('failed')` drops the browser response. This is not a fabricated 201 or
mocked persistence result.

1. **A — Committed, unchanged draft:** recovery POST returns the exact original feedback id. Payload
   and key are identical, the original accepted content is visible, and the API list has exactly one
   row.
2. **B — Committed, edited draft / independent P2 sequence:** edit comment, category and screen before
   retry. The recovery still returns the original content under the original key; all three edits are
   preserved and the list still has one row. Only the explicit new-submission action sends those edits,
   with a fresh key, resulting in exactly two intentional submissions and no duplicate original.
3. **C — Never committed:** abort the outgoing request before forwarding it; the list has zero rows.
   Keyboard retry sends the original payload/key to the real API and yields exactly one accepted row.
4. **D — Authority expired:** after a committed response is dropped, expire the visitor row in the
   disposable database. Recovery returns 403, no accepted-result region is displayed, and the local
   draft survives. An unrelated context and a renewed visitor identity see zero old feedback rows.
5. **E — Existing validation/error handling:** the real API rejects an invalid category with 400 and
   stores no row. The draft remains; its correction starts a new key and succeeds once. A/C also cover
   ordinary network failures, while the original showroom journey continues to cover a forced 503.
6. **Cap boundary:** prepopulate nine rows; lose the tenth accepted response. Replay recovers that
   original despite the cap, without adding a row. Explicit submission of the preserved eleventh draft
   is denied with 409 FEEDBACK_LIMIT; the draft remains and the count stays ten.

All twelve permanent cases passed in the focused run. Each checks axe on main and document-width
horizontal overflow; case B checks both reconciled and final states. The extra default-policy browser
run uses an allowance of 8 and the unchanged 300-second window. Following one panel read and one
committed/lost response, six reads consume the remaining allowance. Recovery at both widths returns
429 with positive Retry-After, preserves the edited draft and identical original payload/key, and
shows no false success. Both rate-limited states are axe-clean with no horizontal overflow. This
intentionally preserves the GET/write coupling in B14-IV-03.

The original expected-conflict reproducer remains unchanged in the independent audit directory as
historical evidence. The corrective tests replace its expected-conflict postcondition with accepted
original-result and explicit-edited-submission assertions; an unchanged old bug-expecting test is not
reported as a current passing behavior test.

## Verification and source freshness

- Original-source independent P2 reproducer: **2 defect confirmations**, one per width, before the
  change (`baseline-reproducer.log`). These are historical bug confirmations, not current successes.
- Focused recovery regression: **12 passed**, zero failed/skipped/flaky (`focused-browser.json`). The
  independent edited-draft sequence is corrected at both widths: accepted original id/content,
  preserved edits, fresh key only on explicit new submission, exactly two intended rows.
- Actual-policy rate browser check: **1 passed**, checking both widths (`rate-browser.json`).
- Focused axe: **14 checkpoints**, plus **2 rate checkpoints**, zero violations; no overflow.
- API unit tests: **147 passed**; web unit tests: **25 passed**, zero failed/skipped (`units.log`).
- Full integration: **206 passed**, including **9 showroom isolation** and **6 Batch 14 migration**
  scenarios (`integration.log`). Those subsets are not additional scenario totals.
- Full browser regression: **54 application + 17 showroom tests passed**, zero failed, exit 0
  (`e2e-all.log`, `application-browser.json`, `showroom-browser.json`). The showroom total is the
  original 5 plus the 12 new remediation regressions. The 2 original new Batch 14 journeys are part
  of the original 5. The earlier 6 independent browser probes remain historical separate evidence.
- Independent HTTP/SQL corroboration: **13 groups passed**, retaining expected LOW counterexamples
  (`adversarial-results.json`). No server guard was weakened.
- Lint: **427 files**, no findings. Typecheck, production build, offline Prisma validation and
  `git diff --check`: **PASS**, exit 0. Logs are retained for each command.

`tested-source-hashes.json` binds the current product/test/config/migration source to these runs;
`preservation.json` compares it again at completion, lists every authorized change and verifies the
historical independent artifacts, prior logs, planning documents, all 38 migrations, HEAD and Git index.
`commands.json` records commands and exit codes. Reproduction commands, suite overlap and the test
expiry/rate-fixture scope are described in the evidence README.

Original API unit totals remain 147 and web totals 25; no mirrored implementation unit tests were
invented. Browser assertions exercise actual HTTP persistence, ambiguity recovery and authority loss.
The 12 focused cases are included in the current full showroom suite, so they are not added again as
unique tests. The independent 13-group HTTP/SQL rerun is separate executable corroboration and includes
expected reproduction of both retained LOW findings, not their remediation.

## Five original software acceptance criteria

1. **C1 — Shared database, input validation and abuse controls required. — VERIFIED_SOFTWARE_CRITERIA.**
   Strict validation, actual PostgreSQL writes, default-rate enforcement and cap/dedupe/concurrency
   checks pass in the current integration, adversarial and browser runs.
2. **C2 — Capture permitted participant, relevant screen/story, category, comment and status. —
   VERIFIED_SOFTWARE_CRITERIA.** Server-derived visitor/scenario/provenance and closed structured
   fields remain intact; snapshot and edited-draft cases verify the exact original versus new content.
3. **C3 — Persist feedback in shared storage with validation and abuse/rate limits. —
   VERIFIED_SOFTWARE_CRITERIA.** Real commit-loss retries preserve one aggregate; reset/reload/restore,
   cap and default rate checks hold. Native SQL history correspondence remains the disclosed LOW gap.
4. **C4 — Restrict viewing/moderation to intended team scope. — VERIFIED_SOFTWARE_CRITERIA.**
   Expired and renewed visitors cannot recover old data; unrelated visitors and all six personas,
   including genuine SUPPORT scope, remain denied; ADMIN revocation and moderation checks pass.
5. **C5 — Display submission errors and preserve attributable moderation history. —
   VERIFIED_SOFTWARE_CRITERIA.** A–E pass at both widths, including real-commit/lost-response recovery,
   retained edits and explicit fresh-key submission. Validation, keyboard/axe/overflow, the existing
   moderation journey and transactional append-only history regressions pass.

The previous independent report remains a historical C5 PARTIALLY_VERIFIED decision. This report and
the acceptance matrix record the subsequent remediation and re-verification; no earlier finding or
execution log was erased. Owner acceptance remains PENDING for all five criteria.

## Remaining findings, evidence corrections and external gates

- **B14-IV-02 (P2):** repaired and verified by real committed-response-loss recovery at both widths.
- **B14-IV-01 (LOW):** native SQL can desynchronize header status/history; unchanged and reproduced by
  the focused HTTP/SQL evidence. Application status/event/audit transactions remain atomic.
- **B14-IV-03 (LOW):** feedback GET and POST share the submission allowance; unchanged and reproduced
  by both the default-policy browser case and HTTP/SQL evidence. No limiter redesign was performed.
- **B14-IV-04 (INFO):** corrected `newBrowserJourneys` from 4 to 2 in the original machine summary with
  an explicit correction record. The four-test historical file run and five-test historical full
  showroom execution remain historical results. Current counts distinguish the 12 added remediation
  regressions and the earlier six separate independent browser probes. The incorrect
  “non-terminal-to-terminal rejection” wording now states **terminal-to-nonterminal reopening
  rejection**, consistent with the SQL and actual test.

Qualified E14-09 / #74 privacy review remains PENDING; retention duration remains null and purge stays
disabled. No real collection, participant recruitment, publication, testimonial or marketing approval
was enabled. E19-01 comprehension and all pre-existing operational/financial/contractual gates remain
external. Software verification does not substitute for those approvals. No backlog state changed and
Batch 15 was not started.
