# Story Acceptance Audit — 33 Stories, Batches 8–11

Date: 28 October 2026. Criteria quoted from the GitHub issue bodies in
`docs/engineering/evidence/batch7-20261027/github-issues.json`.

## Classification key

- `VERIFIED_SOFTWARE_CRITERIA` — every criterion demonstrated by executable evidence in this session.
- `IMPLEMENTED_UNVERIFIED` — code satisfies the criteria on inspection, but no DB/browser proof exists.
- `PARTIALLY_IMPLEMENTED` — at least one stated criterion is unmet or absent.
- `BLOCKED` — cannot proceed without external evidence or infrastructure.
- `NOT_IMPLEMENTED` — no code.

**No story reaches `VERIFIED_SOFTWARE_CRITERIA`**: integration and browser suites could not run
(see `INTEGRATION_TEST_REPORT.md`). Unit evidence alone does not satisfy multi-criterion workflow stories.

---

## Batch 8 — Intelligent planning

### E05-02 · #115 · Explainable Candidate Ranking and Weights

**Criteria (5):** show criteria, **normalized inputs, weights and score components**; version configuration
and snapshot inputs; deterministic ties + missing-data disclosure; keep recommendation separate from manager
selection and artisan acceptance; no health attributes.

**Implemented:** tiered ranking (`RECOMMENDED`/`REVIEW`/`EXCLUDED`), per-candidate explanation, missing-data
codes, deterministic tie-break by capacity then profile id, `RecommendationPolicy` version persisted,
`RecommendationSnapshot` on plan creation.

**Missing:** **no numeric weights, normalized inputs or score components.** The story title itself is
"…Ranking **and Weights**" and criterion 2 explicitly requires weights and scores. The implementation
deliberately uses ordered tiers and returns no score value.

**Evidence:** `apps/api/test/unit/planning.test.ts` — 2 ranking tests pass. DB: none. Browser: none.

**Disposition:** `PARTIALLY_IMPLEMENTED` — weights/scores absent.

### E05-03 · #48 · Multi-Group Batch Planning and Quantity Reconciliation

**Criteria:** positive integer quantities + remainder shown; total reconciles without excess; validate
capacity periods, **material assumptions** and units; draft plans don't bind workers or start production.

**Implemented:** all seven invariants in `validateAllocation`; unallocated remainder returned; unit-type
blocker; draft state creates no reservation; period compatibility comes from the eligibility assessment.

**Missing:** material assumptions are **not** validated at allocation time.

**Evidence:** 3 unit tests pass. DB/browser: none.

**Disposition:** `PARTIALLY_IMPLEMENTED` — material-assumption validation absent.

### E05-04 · #50 · Manager Offer Creation from Allocation Plans

**Criteria:** versioned offers for explicit individuals (not silent group binding); snapshot quantity,
compensation, deadline, specification, materials, payment terms; keep `OFFERED` until authorized artisan
decision; retry safe without duplicates; expiry exposed.

**Implemented:** delegates to the existing `ProductionOfferService.createOffer`; offers are per-artisan, carry
a `termsSha256` snapshot, stay `PREPARED`→`OFFERED`, and require artisan acceptance. Idempotency via
`replaySafe`. Accountless acceptance remains blocked.

**Missing:** end-to-end duplicate-suppression and expiry behaviour unproven without a database.

**Disposition:** `IMPLEMENTED_UNVERIFIED`.

### E05-05 · #116 · Declined and Expired Offer Reallocation

**Criteria:** return declined/expired quantity with history; release **tentative capacity only**; recompute
candidates and feasibility; link replacement reasons without penalising the original artisan.

**Implemented:** `reallocate` derives state from authoritative offers, releases once via
`releasableQuantity`, never releases accepted work, and returns replacement candidates.

**Missing:** "release-once" is guaranteed by the pure function plus an item-state guard, **not** by a unique
constraint or lock proven under concurrency. Replacement offers require a separate manual step.

**Disposition:** `IMPLEMENTED_UNVERIFIED` — concurrency behaviour unproven.

### E05-07 · #118 · Audited Human Override of Recommendations

**Criteria:** require authorized manager **and reason**; record original ranking, selected candidate, actor,
time and plan version; keep hard capacity/qualification/consent guards active; scope override history to
permitted auditors.

**Implemented:** all four fields recorded; reason minimum length 10; hard guards (ineligible, unknown
capacity, capacity exceeded) refuse before write; audit event written.

**Missing:** override history is visible to any operator with planning access; there is no distinct
auditor-scoped view. Criterion 5 is weakly met.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E11-01 · #149 · Recommendation Explanations from Recorded Evidence

**Criteria:** explain craft match, availability, capacity, operational scoring in readable language;
**reference the same input snapshot and weights** as the displayed ranking; disclose missing evidence;
exclude sensors/health/wearables.

**Implemented:** explanations come from the persisted eligibility assessment, so narration matches the
recorded inputs. Health/wearable absent (verified by grep — all matches are comments).

**Missing:** "weights" again — there are none to reference.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E11-02 · #150 · Editable Pricing Suggestions and Assumption Disclosure

**Criteria:** suggest only with identified source or labelled illustrative assumption; full calculation,
effort range and missing-data limitations; allow finance edits and recompute dependents; **require authorized
approval before any suggestion becomes issued quote terms**.

**Implemented:** exact millime components, limitations, `missing` list, advisory flag, no write path to any
quote. Effort is a single value, not a range.

**Missing:** effort **range** (min/max) not offered; no explicit approval-to-quote transition (correctly
refused, but no supported hand-off path).

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E11-03 · #151 · Deterministic Delivery Capacity Scenario Comparison

**Criteria:** compare quantity, start date, weekly capacity and **material-readiness** scenarios; state
calendar, buffer and time-per-unit assumptions; show earliest completion, shortfall, infeasible constraints;
keep exploration separate from committed work.

**Implemented:** multi-scenario comparison, per-line weeks, earliest completion, unallocated, feasibility,
explicit assumptions; nothing is persisted as a commitment (a `ScheduleScenario` record is a log, not a
commitment).

**Missing:** material-readiness is not an input to the simulation.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

---

## Batch 9 — Product catalog

### E20-01 · #91 · Immutable Product Specification and Manufacturing Standard

**Criteria:** **every order/batch references an immutable approved spec version**; define measurements,
tolerances, materials/BOM, instructions, quality criteria; version draft/review/approved with owner and
approval evidence; **bind order/batch to exact approved version and prevent silent edits**; route changed
specs through renewed sample/contract approval.

**Implemented:** specification, revisions, materials, tolerances, instructions, quality criteria, captioned
images, approval evidence, immutability, supersession.

**Missing (critical):** the order/batch release gate is **not connected**. Verified: `grep` for
`BuyerSampleApproval|productSampleRequest` in `apps/api/src/modules/procurement/*.ts` returns **zero
matches**. `BatchRelease` binds `ProcurementRevision` + `ProcurementSample`, a separate chain. Two competing
specification truths exist, which the story explicitly forbids.

**Disposition:** `PARTIALLY_IMPLEMENTED` — the central criterion is unmet.

### E20-02 · #98 · Paid Sample Request, Production and Evaluation

**Criteria:** define scope, artisan owner, deadline, **labor/material responsibility and compensation**
before work; obtain explicit sample-offer acceptance and track **actual hours/materials**; evaluate with
evidence and decision; **create sample payment obligation under agreed terms even when bulk is not awarded**.

**Implemented:** scope, owner, planned deadline, material responsibility, compensation with unpaid-by-default
block, recorded minutes with evidence class, inspection decision.

**Missing:** (1) **material cost is not a TND amount**; (2) **no sample payment obligation** — verified:
`grep payable apps/api/src/modules/catalog/catalog.service.ts` returns **nothing**. Criterion 5 is unmet, and
the story's verification scenario ("verify its agreed payable remains") cannot pass.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E20-03 · #99 · Buyer Sample Sign-Off and Approval Lineage

**Criteria:** present exact sample/spec version and evaluation evidence; capture authorized buyer
approval/rejection, time, comments; preserve immutable lineage, renew sign-off for relevant changes; **use
approved sample criteria in downstream batch inspection**.

**Implemented:** lineage record with buyer org, actor, revision, evidence, amendment chain; rejection of
cross-org and stale revisions.

**Missing:** criterion 5 — downstream batch inspection still reads `ProcurementSample`, not the catalogue
approval.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E02-06 · #100 · Buyer Sample Review and Preproduction Approval · **CLOSED / Done**

**Criteria:** approval records version, evidence, signatory; show sample evidence and criteria; capture
authorized decision/signatory/date/comments; support rejection with next state; renew approval on material
change.

**Implemented:** the **pre-existing** `ProcurementSample` + `ProcurementSampleDecision` + `BatchRelease` path
satisfies version, evidence and signatory, and does gate release. The new `BuyerSampleApproval` duplicates
the concept.

**Missing:** two overlapping approval mechanisms is a correctness risk, and the new one gates nothing.

**Disposition:** `PARTIALLY_IMPLEMENTED` despite CLOSED status — **flag for owner review**.

---

## Batch 10 — Intelligence

### E11-04 · #152 · Delay-Risk Indicators

**Criteria:** use recorded progress, deadline, **exceptions and data staleness** with versioned thresholds;
explain triggering facts, distinguish unknown from low risk; show evaluation time and intervention owner;
validate against recorded examples.

**Implemented:** four states, versioned policy, reasons, unknowns, evaluation timestamp. Health excluded.

**Missing:** **data staleness** is not modelled; **intervention owner** not surfaced; live-data validation
unproven.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E11-05 · #153 · Forecast Versus Observed Completion

**Criteria:** **preserve the forecast at decision time with model/rule version and assumptions**; pair only
with genuine completion records; define cohort, absolute error, cancelled handling; report sample count.

**Implemented:** comparison only when both instants exist; `null` metrics for an empty set; observation count.

**Missing:** **no forecast snapshot storage** — verified: `grep Forecast schema.prisma` returns nothing. The
forecast is read from the release/expiry record, so the *original* forecast is not preserved at decision
time. Criterion 2 is unmet.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E11-06 · #154 · Privacy-Scoped Ranking and Override Audits

**Criteria:** retain feature/config version, eligibility decisions, overrides with purpose-limited access;
compare exposure over defined populations/periods; suppress small groups; record findings, review owner and
corrective decisions.

**Implemented:** policy version, snapshot/override counts, per-plan override history, cohort suppression.

**Missing:** no **auditor-scoped** access (any analytics reader sees it); no findings/owner/corrective-decision
record; minimal comparison UI.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E13-01 · #174 · Demonstration Impact Dashboard

**Criteria:** mark synthetic numbers; **producer share displayed only as aggregate with disclosed formula and
denominator**; identify every synthetic KPI; show period, units, denominators; avoid presenting demo counts
as real; empty/unknown states.

**Implemented:** synthetic labels, limitation lists, denominators, unknown states.

**Missing:** **producer share is absent** — verified: `grep producerShare intelligence.ts
intelligence-workspace.tsx` returns nothing. The existing `/simulator` route shows producer share, but the
story requires it on the impact dashboard. Criterion 2 unmet on the dashboard itself.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E13-02 · #173 · Defined Metrics

**Criteria:** define numerator, denominator, source events, period/timezone; separate produced/approved/
shipped/received/accepted; distinguish planned/simulated from verified settlement and outstanding;
avoid divide-by-zero or misleading zero.

**Implemented:** all five rates with `{numerator, denominator, value}`; `null` on zero denominator; five
separate compensation figures; timezone stated.

**Missing:** none material.

**Disposition:** `IMPLEMENTED_UNVERIFIED`.

### E13-04 · #176 · Effective Earnings and Observed Hours

**Criteria:** separate agreed/earned/paid; **use consented observed hours with task/unit context and
reporting window**; mark missing/zero-invalid hours unknown; restrict individual earnings, publish safe
aggregates.

**Implemented:** three-way separation, `UNAVAILABLE` on missing/zero, no wearable inference.

**Missing:** **no observed-hours store wired to production** — the only `actualRecordedMinutes` field is on
sample requests, not on production batches. No reporting window on earnings.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E13-05 · #177 · Association Outcome Aggregates

**Criteria:** restrict to authorized relationships/purpose; **configured reviewed minimum group size**;
suppress sparse groups/cells; limit filter combinations that reveal individual compensation; disclose period,
population, sources, unavailable metrics.

**Implemented:** cohort 5 suppression, role check, organization scoping, period in the response.

**Missing:** threshold is a **constant**, not configurable/reviewed; filter-combination limiting not enforced.

**Disposition:** `IMPLEMENTED_UNVERIFIED` (threshold hard-coded is a minor gap).

### E05-06 · #117 · Fair Offer Distribution Review

**Criteria:** define period, eligible population, metrics; distinguish offered/accepted/**paid**; suppress
small groups; support human review without automatic exclusion.

**Implemented:** offered/accepted/declined/expired with suppression and review note.

**Missing:** "paid participation" is not distinguished; review period not selectable.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E06-07 · #123 · Overdue and At-Risk Alerts

**Criteria:** version rules on deadlines, progress, **open exceptions**; distinguish overdue/at-risk/stale
unknown; **deduplicate alerts**; expose triggering facts and owner; support acknowledgement/resolution.

**Implemented:** versioned rules, three states, triggering facts.

**Missing:** **no alert deduplication**, no acknowledgement/resolution state, no owner, open exceptions are
read only as a readiness flag rather than as alert input.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

---

## Batch 11 — Collaboration

### E02-05 · #97 · RFQ Revisions · **CLOSED / Done**

Pre-existing `ProcurementRevision` chain satisfies author/date/reason/predecessor, preserves versions, and
routes accepted-contract changes to amendments. **Disposition:** `IMPLEMENTED_UNVERIFIED` (pre-existing,
not re-tested this session).

### E02-07 · #101 · Order Discussions · **CLOSED / Done**

**Implemented:** `OrderDiscussion`/`DiscussionMessage` scoped to participants, `internalOnly` filtering,
author + timestamp.

**Missing:** content sanitisation and delivery/error status are not implemented in the new path (the
pre-existing procurement thread had restricted posting).

**Disposition:** `PARTIALLY_IMPLEMENTED` — sanitisation criterion unmet.

### E06-05 · #121 · Production Exception Cases

**Criteria:** link to the artisan's batch; record affected quantity/date, requested help, optional evidence
**without health disclosure**; notify responsible coordinator, show states; attribute resolution without
silently altering contract or pay.

**Implemented:** batch link, category, severity, evidence reference, states, resolution, original preserved.

**Missing:** affected **quantity and date** fields absent; coordinator notification only fires for the
reporter (self), not the responsible coordinator.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E06-06 · #122 · Disruption Rescheduling

**Criteria:** impact on buyer deadlines, capacity, materials, transport; preserve original/proposed + reason;
**require affected-party approvals**; retain unresolved risk and communicate declined changes.

**Implemented:** previous/proposed/reason/impact, buyer approval required, not applied until approved.

**Missing:** impact covers dates and flags only — **no capacity, material or transport impact**; only the
buyer approves, not all affected parties; **a platform administrator can approve in the buyer's place**
(`!buyerAuthority && !access.platform`), which substitutes governance authority for contractual consent.

**Disposition:** `PARTIALLY_IMPLEMENTED` — with a P1 security finding.

### E04-05 · #110 · Revocable Delegation

Pre-existing `OnboardingAuthorization`/`DelegationGrant` provide scoped, attributed, revocable delegation.
No acceptance authority is inferred from registration assistance. **Disposition:** `IMPLEMENTED_UNVERIFIED`
(pre-existing).

### E04-07 · #112 · Counteroffers

**Criteria:** propose before acceptance; **show resulting pay, effort and material implications**; require
manager review and **new issued terms** before artisan acceptance; **do not reserve extra capacity** merely
on counteroffer.

**Implemented:** proposal, manager review, explicit artisan acceptance, `createsAgreement` gating. No capacity
reserved on proposal.

**Missing (critical):** **accepted terms are never written back to the offer.** Verified: `acceptCounter`
updates only the `Counteroffer` row; `commercialOffer.update` appears solely inside `decideSchedule`. There is
no path from `ARTISAN_ACCEPTED` to new issued offer terms, so criterion 3 and the verification scenario
("verify only the newly accepted version becomes committed") cannot pass.

**Evidence:** `collaboration.service.ts` lines ~470–500.

**Disposition:** `PARTIALLY_IMPLEMENTED` — P0 defect.

### E04-08 · #113 · Pause and Resume

**Criteria:** artisan-controlled pause/resume **with effective date**; exclude from new offers; retain
statements and support access; explain that accepted commitments need negotiated amendment.

**Implemented:** pause/resume, `availabilityStatus` blocks eligibility, commitments and pay preserved.

**Missing:** no **effective date** (pause is immediate only); no explanatory copy about amendment.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E04-09 · #114 · Delegation-Scoped Aggregate Capacity

**Criteria:** aggregate only members permitting sharing; show declared/committed/free by craft/period with
compatible units; exclude revoked relationships, avoid double-counting; hide individual finances, precise
locations, monitoring data.

**Implemented:** pre-existing capacity projection and directory provide scoped, unit-aware aggregates.

**Missing:** no delegation-scoped aggregate endpoint was added in Batch 11; relies entirely on pre-existing
surfaces. Not re-verified.

**Disposition:** `IMPLEMENTED_UNVERIFIED` (pre-existing; Batch 11 claim not substantiated).

### E19-01 · #92 · Accessible Work Instructions

**Criteria:** illustrations, captions, measurements, materials; selected accessible language; **printable/
offline fallback**; bind to batch's immutable version, highlight amendments; **validate comprehension with
consenting participants**.

**Implemented:** versioned instructions (pre-existing), `preferredLanguage` field, captioned image references.

**Missing:** **no illustrated renderer, no printable fallback, no comprehension validation**. Batch 11 added
nothing here.

**Disposition:** `PARTIALLY_IMPLEMENTED` — largely unmet.

### E19-03 · #211 · Voluntary Support Requests

**Criteria:** request without mandatory justification; restrict details to authorized support staff; assign
response owner and status, permit withdrawal/correction; exclude from matching penalties or public profiles.

**Implemented:** `SUPPORT_REQUEST` category, reporter-scoped visibility, owner and status, and support
requests are **never read by any ranking function** (verified by grep).

**Missing:** withdrawal/correction by the requester not implemented.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E14-03 · #181 · Complaint and Dispute Cases

**Criteria:** capture category, related resource, requester, evidence, privacy scope; states incl.
**escalated**; owner and response deadline; accessible status, authorized responses/**attachments**; preserve
original facts, link remedy to independent domain actions.

**Implemented:** category, related resource, description, evidence reference, owner, due date, lifecycle,
event history.

**Missing:** **no attachments** (reference string only); **no escalated state**; privacy scope not modelled;
remedy linkage absent.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

### E14-06 · #184 · Consented Localized Notifications

**Criteria:** opt-in channel + **localized content**; sensitive details behind authenticated links; track
queued/sent/**failed** with safe retry without duplicates; honour preference changes, fallback for critical
communication.

**Implemented:** opt-in preferences per category, in-app delivery with honest status, undeliverable state when
no provider.

**Missing:** **no localisation** (English only); no failed-with-retry, no deduplication, no critical-communication
fallback; sensitive-detail redaction unspecified.

**Disposition:** `PARTIALLY_IMPLEMENTED`.

---

## Tally

| Disposition | Count | Stories |
|---|---|---|
| VERIFIED_SOFTWARE_CRITERIA | **0** | — |
| IMPLEMENTED_UNVERIFIED | **7** | E05-04, E05-05, E13-02, E13-05, E02-05, E04-05, E04-09 |
| PARTIALLY_IMPLEMENTED | **26** | all others |
| BLOCKED | 0 | — |
| NOT_IMPLEMENTED | 0 | — |
| **Unique stories** | **33** | — |

Exact split: **7 + 26 = 33**, verified by parsing this document programmatically.

This differs from the prior matrix (22/7). That figure was arithmetically wrong: the matrix has **34 rows for
33 unique stories** (E02-05 appears twice) and its status column actually contains **27 + 7**. Both the
headline count and every optimistic status were re-derived here from the real criteria.
