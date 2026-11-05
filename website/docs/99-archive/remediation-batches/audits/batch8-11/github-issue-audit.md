# GitHub Issue Audit — Batches 8–11

Date: 28 October 2026, Africa/Tunis. Repository: `website/`, branch
`feat/nasj-showroom-competition-package`.

## 1. Access status — LIVE ACCESS BLOCKED

| Check | Result |
|---|---|
| `gh auth status` | **FAILED** — both accounts (`ASHEN-IX` active, `anonym-03`) hold invalid tokens |
| `gh repo view --json nameWithOwner,url` | **FAILED** — `Post "https://api.github.com/graphql": user denied` |
| Sandbox network policy | `api.github.com:443` — **denied** by the session's outbound filter |

Live GitHub state could therefore **not** be retrieved. No issue was mapped by guesswork and no issue was
reopened, closed, relabelled or reassigned.

## 2. Evidence source actually used

A read-only snapshot captured during Batch 7 is present at
`docs/engineering/evidence/batch7-20261027/github-issues.json` — **500,994 bytes, 213 issues**, each with
`number`, `title`, `state`, `url`, `body` and `projectItems`. It is genuine GitHub data, but it is a
**snapshot dated 27 October 2026**, not current state.

Fields present: `body`, `number`, `projectItems`, `state`, `title`, `url`.
Fields **absent**: `closedAt` (so closure timing cannot be reported), labels, assignees, comments.

Snapshot totals: **213 issues — 132 OPEN, 81 CLOSED**.

Current-versus-historical differences **cannot be determined**. Any state below may have changed since
27 October.

## 3. Verified mapping for the 33 target stories

All 33 resolved to exactly one issue each; no duplicates, no gaps.

| BACKLOG_ID | ISSUE | TITLE | GITHUB_STATE (snapshot) | BOARD | CLOSED_AT | DEPENDENCIES |
|---|---|---|---|---|---|---|
| E05-02 | #115 | Explainable Candidate Ranking and Weights | OPEN | Proposed | unknown | #47 |
| E05-03 | #48 | Multi-Group Batch Planning and Quantity Reconciliation | OPEN | Proposed | unknown | US-017, US-019 |
| E05-04 | #50 | Manager Offer Creation from Allocation Plans | OPEN | Proposed | unknown | E05-03, E04-02 |
| E05-05 | #116 | Declined and Expired Offer Reallocation | OPEN | Proposed | unknown | #45 (E04-03), #50 (E05-04) |
| E05-07 | #118 | Audited Human Override of Recommendations | OPEN | Proposed | unknown | US-017 |
| E11-01 | #149 | Recommendation Explanations from Recorded Evidence | OPEN | Proposed | unknown | E05-02 |
| E11-02 | #150 | Editable Pricing Suggestions and Assumption Disclosure | OPEN | Proposed | unknown | — |
| E11-03 | #151 | Deterministic Delivery Capacity Scenario Comparison | OPEN | Proposed | unknown | — |
| E20-01 | #91 | Immutable Product Specification and Manufacturing Standard | OPEN | Proposed | unknown | #24 (E00-03) |
| E20-02 | #98 | Paid Sample Request, Production and Evaluation | OPEN | Proposed | unknown | #91, #25 (E00-04) |
| E20-03 | #99 | Buyer Sample Sign-Off and Approval Lineage | OPEN | Proposed | unknown | — |
| E02-06 | #100 | Buyer Sample Review and Preproduction Approval | **CLOSED** | **Done** | unknown | — |
| E11-04 | #152 | Explainable Production Delay Risk Indicators | OPEN | Proposed | unknown | — |
| E11-05 | #153 | Forecast Versus Observed Completion Evaluation | OPEN | Proposed | unknown | — |
| E11-06 | #154 | Privacy-Scoped Ranking and Override Audits | OPEN | Proposed | unknown | E05-06, E05-07 |
| E13-01 | #174 | Clearly Labeled Demonstration Impact Dashboard | OPEN | Proposed | unknown | E13-02, E13-07 |
| E13-02 | #173 | Defined Payment, Fulfillment and Cost Metrics | OPEN | Proposed | unknown | — |
| E13-04 | #176 | Effective Earnings and Observed Hours Reporting | OPEN | Proposed | unknown | — |
| E13-05 | #177 | Privacy-Safe Association Outcome Aggregates | OPEN | Proposed | unknown | — |
| E05-06 | #117 | Fair Offer Distribution Review | OPEN | Proposed | unknown | — |
| E06-07 | #123 | Explainable Overdue and At-Risk Batch Alerts | OPEN | Proposed | unknown | — |
| E02-05 | #97 | RFQ Revisions and Feasibility Clarifications | **CLOSED** | **Done** | unknown | — |
| E02-07 | #101 | Permission-Scoped Order Discussions | **CLOSED** | **Done** | unknown | — |
| E06-05 | #121 | Material Shortage and Production Exception Cases | OPEN | Proposed | unknown | — |
| E06-06 | #122 | Disruption Rescheduling and Commitment Reapproval | OPEN | Proposed | unknown | E06-05, E03-09 |
| E04-05 | #110 | Revocable Association Membership and Delegation | OPEN | Proposed | unknown | — |
| E04-07 | #112 | Quantity and Deadline Counteroffers | OPEN | Proposed | unknown | E04-02 |
| E04-08 | #113 | Pause and Resume New Work Availability | OPEN | Proposed | unknown | — |
| E04-09 | #114 | Delegation-Scoped Aggregate Association Capacity | OPEN | Proposed | unknown | — |
| E19-01 | #92 | Accessible Versioned Craft Work Instructions | OPEN | Proposed | unknown | — |
| E19-03 | #211 | Voluntary Private Training and Support Requests | OPEN | Proposed | unknown | — |
| E14-03 | #181 | Complaint and Dispute Case Management | OPEN | Proposed | unknown | — |
| E14-06 | #184 | Consented Localized Participant Notifications | OPEN | Proposed | unknown | #84 (E01-03), #181 (E14-03) |

Snapshot counts for the target set: **30 OPEN, 3 CLOSED**.

## 4. Previously closed issues requiring owner review

These three target issues are **CLOSED / Done on the board**, yet the corresponding software criteria are not
fully met by the current tree. Closure is a historical fact, not evidence of acceptance.

| Issue | Story | Why review is warranted |
|---|---|---|
| #100 | E02-06 Buyer sample approval | Closed as Done, but the platform has **two** sample-approval paths: the pre-existing order-level `ProcurementSampleDecision` (which gates release) and the new `BuyerSampleApproval` (which gates nothing). Neither single path demonstrably satisfies all five criteria, and there is no browser or integration evidence in this tree for the new path. |
| #97 | E02-05 RFQ revisions | Closed as Done; the pre-existing `ProcurementRevision` chain does satisfy the versioning criteria. **No action needed** — recorded to show closure is not uniformly suspect. |
| #101 | E02-07 Order discussions | Closed as Done; pre-existing `ProcurementMessage` restricted posting, but the criterion "separate internal notes from buyer discussion" is satisfied by the `internal` flag. Criteria broadly met. **Low risk.** |

Only **#100** genuinely warrants owner review of the three.

## 5. Historical baseline verification

The prior reports recorded 52 CLOSED issues including nine named ones. All nine are present in the snapshot:

| Issue | Story | Snapshot state | Board |
|---|---|---|---|
| #30 | E16-11 | CLOSED | Done |
| #82 | E01-01 | CLOSED | Done |
| #187 | E15-01 | CLOSED | Done |
| #188 | E15-02 | CLOSED | Done |
| #193 | E15-07 | CLOSED | Done |
| #198 | E17-01 | CLOSED | Done |
| #199 | E17-02 | CLOSED | Done |
| #200 | E17-03 | CLOSED | Done |
| #203 | E17-06 | CLOSED | Done |

Note the historical figure of *52* closed cannot be reconciled against this snapshot's **81** closed overall —
they measure different populations (the earlier figure presumably covered a subset). The discrepancy is
recorded, not resolved.

## 6. Unresolved mappings

None for the 33 target stories. All resolved unambiguously.

Residual risk: the snapshot predates the Batch 8–11 implementation, so any issue closed *after* 27 October
would not appear. Re-run `gh issue list --repo wie-challenge/website --state all --limit 500
--json number,title,state,closedAt,url,body` once credentials are valid.

## 7. Remote actions

**None.** No issue was created, closed, reopened, relabelled, reassigned or commented on. Board state was
read from the snapshot only.
