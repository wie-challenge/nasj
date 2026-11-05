# Batches 11–14 backlog reconciliation

29 October 2026 · Africa/Tunis. **READ-ONLY AUDIT / DRY RUN. No GitHub or backlog change applied.**

## Decision

Exactly 22 stories / 111 original criteria were reconciled. All 16 software-completion candidates are
already CLOSED / Done. Five other stories are OPEN / In Progress. #73 is CLOSED / Done despite a final
PARTIAL software assessment and unresolved lawful-closure policy. No state transition or reopening is
proposed. All 22 owner acceptances remain PENDING; zero explicit sign-offs were found.

The minimal GitHub evidence plan is **17 one-comment updates**: one per already-closed software
candidate to attach its missing evidence/acceptance scope, plus one scope-review comment on #73.
No target has an existing completion comment or evidence-document reference, so these are evidence
updates, not duplicate workflow transitions. Five open pending issues need no GitHub mutation.

## Authority and method

Live authenticated `gh` reads cover all 22 issues and all 22 Project #1 items. Project title is
**HirfaCare Backlog**; actual options include Proposed, Ready, In Progress, In Review, Blocked and Done.
Labels, priority, milestone, complete original bodies/comments, declared dependencies, update/closure
timestamps and project values are preserved in [issue-inventory.json](../../../engineering/backlog-closeout/issue-inventory.json). No tests,
source-code audit, deployment, database access or historical re-audit was performed.

The final Batches 8–11 matrix verifies the 11 Batch 11 candidates and leaves E19-01.C5 external. Batch
12's final independent remediation verification and updated matrix supersede its pre-remediation
A12-01/A12-02 failures; they retain four partial financial stories and the blocked privacy review.
Batch 13's independent verification verifies all five software criteria and retains privacy/owner
gates. Batch 14's remediation report/summary supersede the earlier C5 partial result: all five now
verify; B14-IV-02 is fixed, and the two LOW findings remain open.

Evidence keys: **B11** = `../batch8-11-completion/STORY_ACCEPTANCE_MATRIX.md`; **B12** =
`../batch12-remediation/UPDATED_ACCEPTANCE_MATRIX.md` +
`../audits/batch12-remediation-final/FINAL_VERIFICATION.md`; **B13** =
`../BATCH13_INDEPENDENT_VERIFICATION.md`; **B14** = `../BATCH14_REMEDIATION_REPORT.md` + its machine summary.
These documents and every criterion-level assessment are linked in the inventory.

## The 22 stories

All legacy backlog statuses are currently **Proposed**, and all owner acceptances are
**OWNER_ACCEPTANCE_PENDING**. V/P/E counts are original criterion positions classified as verified
software / partial software / externally blocked. Counts inherit retained evidence, not new test
execution. Qualified model/negative-path verification on partial financial stories does not verify
real contribution or positive settlement. The six partial/gated rows include the exact qualifications
and evidence basis in JSON; these are reconciliation mappings, not new independent pass certificates.

| Issue / stable ID / exact live title | Live issue / board | Original; V/P/E | Classification | Proposed legacy backlog status | GitHub action | Evidence / unresolved requirements |
|---|---|---|---|---|---|---|
| [#97](https://github.com/wie-challenge/website/issues/97) · E02-05 · [E02-05] RFQ Revisions and Feasibility Clarifications | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#101](https://github.com/wie-challenge/website/issues/101) · E02-07 · [E02-07] Permission-Scoped Order Discussions | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#121](https://github.com/wie-challenge/website/issues/121) · E06-05 · [E06-05] Material Shortage and Production Exception Cases | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#122](https://github.com/wie-challenge/website/issues/122) · E06-06 · [E06-06] Disruption Rescheduling and Commitment Reapproval | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#110](https://github.com/wie-challenge/website/issues/110) · E04-05 · [E04-05] Revocable Association Membership and Delegation | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#112](https://github.com/wie-challenge/website/issues/112) · E04-07 · [E04-07] Quantity and Deadline Counteroffers | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#113](https://github.com/wie-challenge/website/issues/113) · E04-08 · [E04-08] Pause and Resume New Work Availability | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#114](https://github.com/wie-challenge/website/issues/114) · E04-09 · [E04-09] Delegation-Scoped Aggregate Association Capacity | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#211](https://github.com/wie-challenge/website/issues/211) · E19-03 · [E19-03] Voluntary Private Training and Support Requests | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#181](https://github.com/wie-challenge/website/issues/181) · E14-03 · [E14-03] Complaint and Dispute Case Management | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#184](https://github.com/wie-challenge/website/issues/184) · E14-06 · [E14-06] Consented Localized Participant Notifications | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B11. None in software scope; owner review pending. |
| [#204](https://github.com/wie-challenge/website/issues/204) · E18-01 · [E18-01] Qualified B2B Prospect and Follow-Up Pipeline | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B12. None in software scope; owner review pending. |
| [#205](https://github.com/wie-challenge/website/issues/205) · E18-02 · [E18-02] Pilot Sample Proposals and Win-Loss Learning | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B12. None in software scope; owner review pending. |
| [#77](https://github.com/wie-challenge/website/issues/77) · E16-08 · [E16-08] Backups, Restore Drills and Operational Observability | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B12. None in software scope; owner review pending. |
| [#209](https://github.com/wie-challenge/website/issues/209) · E18-06 · [E18-06] Buyer Satisfaction and Claims Resolution History | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B13. None in software scope; owner review pending. |
| [#192](https://github.com/wie-challenge/website/issues/192) · E15-06 · [E15-06] Persistent Structured Team Feedback | CLOSED / Done | 5; 5/0/0 | VERIFIED_SOFTWARE | Done | UPDATE_EVIDENCE_ONLY | B14. None in software scope; owner review pending. |
| [#92](https://github.com/wie-challenge/website/issues/92) · E19-01 · [E19-01] Accessible Versioned Craft Work Instructions | OPEN / In Progress | 5; 4/0/1 | EXTERNALLY_BLOCKED | In Progress | KEEP_PENDING | B11. C5 real consenting-participant comprehension. |
| [#206](https://github.com/wie-challenge/website/issues/206) · E18-03 · [E18-03] Actual Contribution and Working-Capital Review | OPEN / In Progress | 5; 3/2/0 | PARTIAL_SOFTWARE | In Progress | KEEP_PENDING | B12. C1–C2 actual recognition/source completeness; estimate-only qualifications on C3–C4. |
| [#146](https://github.com/wie-challenge/website/issues/146) · E10-11 · [E10-11] Reconciled Accounting Transaction Export | OPEN / In Progress | 5; 4/1/0 | PARTIAL_SOFTWARE | In Progress | KEEP_PENDING | B12. C3 invoice-source reconciliation; C1 limited to existing sources. |
| [#148](https://github.com/wie-challenge/website/issues/148) · E10-13 · [E10-13] Contract-Based Payment Timeliness Metrics | OPEN / In Progress | 5; 3/2/0 | PARTIAL_SOFTWARE | In Progress | KEEP_PENDING | B12. C3–C4 verified-positive settlement service path. |
| [#73](https://github.com/wie-challenge/website/issues/73) · E10-14 · [E10-14] Guarded Financial Order Closure | CLOSED / Done | 5; 3/1/1 | PARTIAL_SOFTWARE | Proposed (HOLD) | EXISTING_STATE_REQUIRES_REVIEW | B12. C4 lawful exceptions/policy; C5 positive closure path incomplete. |
| [#74](https://github.com/wie-challenge/website/issues/74) · E14-09 · [E14-09] Dataset Retention, Purpose Limits and Incident Ownership | OPEN / In Progress | 6; 1/2/3 | EXTERNALLY_BLOCKED | In Progress | KEEP_PENDING | B12. C1/C3/C4 qualified review/owners; C2/C5 duration/removal partial. |

## Exact proposed backlog changes

The structured source is **`/home/ashenix/Projects/wie-challenge/docs/HirfaCare_FINAL_GitHub_Issues.csv`**;
its Body column and the corresponding blocks in
**`/home/ashenix/Projects/wie-challenge/docs/HirfaCare_FINAL_Detailed_Backlog.md`** are the detailed
specification. The GitHub index is a historical import map, not current acceptance authority. The
CSV source role is stated by the detailed backlog, import README and import script. Some old links
and script aliases still say `nasj_...`; actual files are `HirfaCare_...`. Do not invoke that importer.

After separate approval, append three CSV columns: **Software Verification**, **Owner Acceptance**,
**External Gate**. Mirror those fields after Status in each target Markdown block and CSV Body.
`backlogProposal` in JSON gives each exact row ID/data-row number, Markdown heading/line, old/new
Status, new field values and exact metadata-anchor replacement. Preserve every original criterion,
dependency, priority, estimate and other column. This is 22 logical row updates (not GitHub writes).

For 16 complete candidates, propose Proposed → Done as **workflow alignment only**, alongside
VERIFIED_SOFTWARE and OWNER_ACCEPTANCE_PENDING. For five open gates, propose Proposed → In Progress,
with their partial/external software classifications and unsatisfied gates. For #73, retain Proposed
locally pending the owner’s scope decision; record its actual CLOSED/Done state separately and do not
promote its software/external assessment to Done. Thus 21 legacy status changes are proposed and one
is deliberately withheld. The added dimensions prevent workflow Done from becoming acceptance.

The CSV's existing hash/import-state guard would detect an approved source change; any rebaseline or
regeneration requires a separate reviewed procedure. Do not bypass the guard or regenerate GitHub
issues as part of this audit. No original backlog file was modified.

## Discrepancies and application readiness

- All 22 local statuses and issue-body Status lines still say Proposed; live workflow is 17 Done /
  5 In Progress. All 111 GitHub acceptance checkboxes remain unchecked. This is stale planning
  metadata, not proof that software verification or owner acceptance did or did not occur.
- All live comments are empty and issue bodies link no completion evidence. The 17 proposed comments
  attach the missing software/scope record without checking owner-acceptance boxes. CLOSED/Done does
  not supply missing sign-off.
- #73's closed state is real and predates the final partial assessment. Retain it until the owner
  explicitly chooses software-only scope plus follow-up, or a separately authorized state correction.
- #192 was closed before the P2 discovery/remediation. The P2 is now fixed; the remaining LOW findings
  are not that defect. Its final remediation report/evidence are still local uncommitted work, so no
  nonexistent commit permalink is proposed. Publish or otherwise supply an approved durable evidence
  reference before its evidence comment is applied.
- The import index's blanket “all open/proposed” statement and old `nasj Backlog` title are historical;
  live Project name is HirfaCare Backlog. Body-declared dependencies are captured, but native dependency
  edges and sign-off on upstream stories outside these 22 were not independently certified.

[GitHub status proposal](github-status-proposal.md) contains the exact 17 proposed comments, preconditions
and zero transition plan. [Remaining gates](remaining-gates.md) contains the six unresolved stories and
two Batch 14 LOW follow-ups. The plan is ready for owner review, not execution: fresh concurrency and
duplicate checks, explicit approval and reviewable #192 evidence are required. No owner approval is
inferred here. No GitHub/backlog mutation, tests, source/migration changes or Batch 15 work occurred.

## Workspace preservation

HEAD remains f0b3d756dce0ea4ec3bde0addcb92fcff7d54844. Initial status correctly includes the prior
uncommitted remediation/verification work; the earlier independent audit's clean initial tree was
true for that earlier point in time, not for this run. The inventory records before/after status and
a digest of all pre-existing nonignored files, excluding only these four new deliverables. All prior
work and both authoritative backlog files are preserved.
