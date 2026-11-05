# Implementation completion — Batches 8–11

28 October 2026 · Africa/Tunis · Repository `website/`.

The audited correctness defects have executable fixes. The native PostgreSQL integration suite now runs,
and the final story verdicts are in [STORY_ACCEPTANCE_MATRIX.md](story-acceptance-matrix.md), with all 165
original criteria and separate owner acceptance. The package's generated evidence summary is authoritative
for final command counts; earlier failed attempts remain in `evidence/` as diagnostic history.

## Correctness changes

- **D-1, counteroffers:** a manager uses `ProductionOfferService` to prepare and issue a linked replacement
  offer. Original terms remain on the replaced record. Neither a proposal nor manager review accepts work.
  The artisan explicitly accepts the replacement's displayed hash through the existing offer acceptance
  endpoint. Counteroffer confirmation checks the resulting authoritative accepted offer and unique batch.
  Delivery deadline is distinct from response expiry. Stale hashes, expiry, excessive capacity, refusal,
  unauthorized actors and concurrent acceptance are tested. Nested transactions taking the same advisory
  locks were removed rather than worked around.
- **D-3, schedule consent:** platform administration cannot replace buyer or artisan consent. Approval
  records are separate, the previous agreement remains effective until both parties approve, and stale
  proposals fail. Impact records disclose capacity-period boundaries, open material problems and unknown
  transport confirmation. A change outside approved capacity fails closed. Coordination, rejection and
  status notices do not silently alter quantity or compensation.
- **D-4, specification authority:** an authorized buyer binds the exact approved catalogue revision and
  sample decision. A new append-only procurement projection preserves the accepted quotation's original
  version and BOM/checklist. Compatibility sample records project the same decision; they are not another
  approval. Issued offers snapshot the approved design and its digest; release, instructions, materials,
  displayed execution checklist and inspection use the pinned projection. Existing legacy orders retain
  their accepted immutable versions. Approved catalogue content and buyer decisions have SQL immutability
  triggers. One design revision may be used by multiple orders.
- **D-5, paid samples:** exact labor/material terms are issued before the assigned artisan accepts their
  hash. Completion recognizes one obligation in the existing `ArtisanPayable` ledger, even before buyer
  approval or bulk award. Rejection does not erase it. The legacy `SamplePayable` table remains historical
  compatibility evidence; application code creates no new entries there. Actual time/material observations
  can be recorded or explicitly left unavailable. Recognition is not payment or verified settlement.

## Remaining implementation

Planning now records versioned weights, normalized components, reproducible scores and explanations.
Drafts remain nonbinding; material unknowns block review. Plan issuance and reallocation use the existing
consent/capacity authority. Reallocation rechecks live capacity/consent, preserves accepted work, records
source offers and reasons, and reports unavailable delivery throughput honestly. Pricing supports effort
ranges and an explicit authorized handoff to the existing versioned costing workflow; quote issuance keeps
its independent approval gate. Purpose-scoped auditors can review recorded rankings/overrides and record
findings, owners and human corrective decisions.

Intelligence preserves forecasts and comparisons, has consented append-only observed-time records with
correction chains, and exposes private earnings with agreed/earned/simulated/verified-paid distinctions.
The artisan interface supports voluntary time reporting, consent, sources and correction history. Full
unit coverage is required before estimating a whole-batch hourly amount. Risk uses the real clock, recorded
progress, open exceptions and staleness. Alerts deduplicate and support acknowledgement/resolution. Monthly
review populations include eligible participants with zero exposure. Cohort thresholds are controlled by a
reviewed policy; financial contributor suppression and whole-month filters prevent sparse disclosure.

Collaboration supports affected quantities/dates, effective-dated pauses, optional-justification private
support, correction/withdrawal, scoped inspected images, escalation, owners/deadlines and remedy references.
The association capacity view requires current explicit sharing/delegation and consent, deduplicates members,
and separates incompatible periods/units. Illustrated instructions use approved language assets, immutable
versions, captions and print fallback. Real participant comprehension is still an external gate.

Notifications retain opt-in language/channel, durable pending/failure states, safe retry and an explicitly
opted-in in-app fallback. External email is disabled by default. The worker checks current consent, claims
rows atomically, does no external I/O in business transactions, and distinguishes SMTP `SENT` from inbox
`DELIVERED`. An uncertain acknowledgement or interrupted `SENDING` state is held for review, not blindly
retried. Tests send only to a disposable local SMTP capture.

The showroom seed is version 3. It starts with a draft design rather than fabricated acceptance. A connected
visitor journey creates plans, sample terms/consent/payable/approval, bound work, production, observation,
inspection, exception/support/discussion/notification records through domain APIs. Extended totals reconcile
on start/reset. Reset archives history, revokes old sessions and leaves other visitors unchanged.

## Verification and boundaries

See [INTEGRATION_TEST_RESULTS.md](integration-test-results.md),
[BROWSER_TEST_RESULTS.md](browser-test-results.md), and
[MIGRATION_EXECUTION_REPORT.md](migration-execution-report.md).
No persistent development/showroom/staging/production database was migrated, no `db push` or `demo:setup`
was used, and no deployment, GitHub mutation, staging, commit, push, stash, reset or clean was performed.
Batch 12 was not started. Passing software checks do not constitute owner acceptance or real-world evidence.
