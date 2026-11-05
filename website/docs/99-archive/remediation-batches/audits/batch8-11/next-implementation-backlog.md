# Next Implementation Backlog — Prioritised Work Packages

Date: 28 October 2026. Derived from the Batches 8–11 audit. Issue numbers are those verified in
`GITHUB_ISSUE_AUDIT.md`; none are invented. No package below was implemented during this audit.

---

## P0 — Blocking correctness

### WP-01 · Prove the migrations against PostgreSQL

- **Backlog ID:** cross-cutting (unblocks 20 tables)
- **GitHub issue:** none — infrastructure
- **Problem:** the three migrations have never executed. Their correctness is unknown.
- **Current:** static review only; `BEGIN`/`COMMIT` present, no destructive statements, 20 tables total.
- **Required changes:** none to code unless execution fails. If it fails, fix forward with a new additive
  migration — never edit a historical one.
- **Affected:** `apps/api/prisma/migrations/202610280{1,2,3}0000_*`
- **Migration:** verification only
- **Authorization:** needs a disposable database; must not use dev/showroom/staging/prod
- **Acceptance:** `prisma migrate deploy` succeeds on top of `20261027090000_demo_scenarios`; all 20 tables and
  their unique/FK constraints exist; verified by `pg_tables` query.
- **Tests:** the runbook in `DATABASE_MIGRATION_AUDIT.md` §6
- **Dependencies:** Docker socket access or an external `DATABASE_URL`
- **Risks:** may surface a real DDL failure
- **Complexity:** S (if it passes) / M (if it needs a fix)

### WP-02 · Connect accepted counteroffers to authoritative offer terms

- **Backlog ID:** E04-07 · **GitHub issue:** #112
- **Problem:** `acceptCounter` records `ARTISAN_ACCEPTED` but never writes terms to the offer. Agreement is
  recorded without force — no new issued terms, no capacity reservation, no commitment.
- **Current:** `Counteroffer` row status change only; verified no `commercialOffer.update` in that path.
- **Required changes:** in one transaction — create a new offer version from accepted quantity/deadline,
  recompute compensation from the existing unit rate, snapshot `termsSha256`, set the new version `OFFERED`,
  supersede the old version, and let the existing acceptance path reserve capacity. Reject if the artisan's
  capacity no longer covers the accepted quantity.
- **Affected services:** `CollaborationService.acceptCounter`, `ProductionOfferService`
- **Affected models:** `Counteroffer`, `CommercialOffer`, `CapacityDeclaration`
- **Migration:** probably none; add `supersededById` to `CommercialOffer` if a version chain is introduced
- **Authorization:** only the offer's own artisan may accept
- **Acceptance:** after acceptance exactly one committed version exists; capacity reconciles; the original
  offer remains traceable; declining reserves nothing.
- **Tests:** unit (terms construction) + integration (capacity reconciliation) + browser journey
- **Dependencies:** WP-01
- **Risks:** double-reservation if the old version stays `OFFERED`
- **Complexity:** M

### WP-03 · Unify the product-specification chain (catalogue → release)

- **Backlog ID:** E20-01 · **GitHub issue:** #91
- **Problem:** two competing truths. `BatchRelease` binds `ProcurementRevision`+`ProcurementSample`; the new
  `ProductSpecificationRevision`/`BuyerSampleApproval` gate nothing. The story forbids this.
- **Current:** verified zero references to the catalogue models from `apps/api/src/modules/procurement/`.
- **Required changes:** choose **one** authority — recommended: make `ProductSpecificationRevision` the design
  authority and have `ProcurementRevision` *reference* it (add `productSpecificationRevisionId`), so release
  can assert the approved catalogue revision without a second gate. Do not add a parallel gate.
- **Affected services:** `ProductionExecutionService.release`, `ProductCatalogService`
- **Affected models:** `ProcurementRevision`, `ProductSpecificationRevision`, `BatchRelease`
- **Migration:** yes — additive column + FK
- **Authorization:** design org owns the revision; release stays operator-only
- **Acceptance:** a batch cannot release unless the referenced catalogue revision is `APPROVED`; a superseded
  revision blocks release; existing orders keep their original revision.
- **Tests:** integration (stale/superseded rejection) + regression on existing release scenarios
- **Dependencies:** WP-01
- **Risks:** touching the release gate can regress Batch 6/7 flows — run the full existing integration suite
- **Complexity:** L

### WP-04 · Sample payment obligation

- **Backlog ID:** E20-02 · **GitHub issue:** #98
- **Problem:** no payable is created for a paid sample, so the story's own verification ("agreed payable remains
  even when bulk is not awarded") cannot pass.
- **Current:** verified zero `payable` references in `catalog.service.ts`.
- **Required changes:** on sample approval-or-rejection after work, create an `ArtisanPayable` under the agreed
  sample terms, labelled synthetic, without creating a second ledger.
- **Affected services:** `ProductCatalogService`, `FinanceService`
- **Affected models:** `ArtisanPayable`, `ProductSampleRequest`
- **Migration:** add `sampleRequestId` nullable FK on `ArtisanPayable` (additive)
- **Authorization:** finance permission to recognise; never auto-pay
- **Acceptance:** rejected paid sample leaves a recognised obligation and no bulk production approval.
- **Tests:** integration + financial invariant test
- **Complexity:** M

---

## P1 — Incomplete business workflow

### WP-05 · Numeric ranking weights and score components

- **Backlog ID:** E05-02 (+E11-01) · **Issues:** #115, #149
- **Problem:** criteria require "normalized inputs, weights and score components"; implementation returns tiers
  with no weights or scores.
- **Required:** add a versioned weight configuration and a deterministic score per candidate, exposed in the
  API and UI, **while keeping hard eligibility as an absolute gate**. Persist weights in
  `RecommendationPolicy.inputs` and echo them in `RecommendationSnapshot`.
- **Migration:** none (JSON columns exist)
- **Acceptance:** a reviewer can recompute the displayed score from displayed inputs and weights; ties break
  deterministically.
- **Complexity:** M

### WP-06 · Material cost, affected quantity/date, and material-readiness inputs

- **Backlog IDs:** E20-02, E06-05, E05-03, E11-03 · **Issues:** #98, #121, #48, #151
- **Problem:** four separate gaps that all concern material reality: sample material cost is text not TND;
  exceptions lack affected quantity/date; allocation does not validate material assumptions; simulation ignores
  material readiness.
- **Required:** add `materialCostMillimes` to sample terms; add `affectedQuantity`/`affectedDate` to
  `ProductionException`; feed `MaterialReadiness` into both allocation validation and the simulator as an
  explicit input with an unknown state.
- **Migration:** yes — three additive columns
- **Complexity:** M

### WP-07 · Forecaster snapshot + observed production hours

- **Backlog IDs:** E11-05, E13-04 · **Issues:** #153, #176
- **Problem:** no forecast is preserved at decision time; no production observed-hours store exists. Both
  stories are structurally blocked.
- **Required:** `ForecastSnapshot` (batch, rule version, forecasted completion, assumptions, created at
  decision time) and `ProductionTimeRecord` (batch, consented observed minutes, unit context, reporting
  window, evidence class). Never infer hours from wearables.
- **Migration:** yes — two tables
- **Acceptance:** error metrics compare a preserved snapshot to a genuine completion; missing hours render
  `UNAVAILABLE`.
- **Complexity:** M

### WP-08 · Alert deduplication and acknowledgement; configurable cohort threshold

- **Backlog IDs:** E06-07, E13-05 · **Issues:** #123, #177
- **Problem:** no alert dedup/ack/resolution/owner; cohort threshold hard-coded at 5.
- **Required:** `AlertRecord` keyed on `(batchId, ruleVersion, reason-set hash)` for dedup; ack/resolve states
  with owner; move threshold to reviewed configuration (JSON policy row).
- **Migration:** yes — one table or a policy row
- **Complexity:** M

### WP-09 · Localised notification templates and delivery retry

- **Backlog ID:** E14-06 · **Issue:** #184
- **Problem:** English only; no failed/retry state; EMAIL opt-in without provider writes **no** record at all.
- **Required:** template catalogue keyed by `(category, locale)`; write a `UNDELIVERABLE` delivery row even
  when no provider is configured, so operators can see it; retry with idempotency key; critical-communication
  fallback to in-app.
- **Complexity:** M

### WP-10 · Illustrated and printable work instructions

- **Backlog ID:** E19-01 · **Issue:** #92
- **Problem:** no illustrated renderer, no printable fallback, no comprehension validation.
- **Required:** render approved revision steps with captioned images, a print stylesheet, the artisan's chosen
  language, and an amendment highlight. Label unreviewed translations as unreviewed.
- **Complexity:** M

### WP-11 · Support-case attachments, escalation, and requester withdrawal

- **Backlog IDs:** E14-03, E19-03 · **Issues:** #181, #211
- **Problem:** no attachments, no escalated state, no privacy scope, no requester withdrawal/correction.
- **Required:** reuse the existing attachment pattern (`sha256`, mime allow-list, byte cap) from
  `ProcurementAttachment`; add `ESCALATED` state; add `privacyScope`; allow reporter withdrawal.
- **Complexity:** M

### WP-12 · Showroom extension for Batches 8–11

- **Backlog ID:** cross-cutting
- **Problem:** zero new models are seeded; the showroom cannot demonstrate any new feature.
- **Required:** see `SHOWROOM_INTEGRATION_AUDIT.md` §5 — seed one policy, one snapshot, one allocation plan,
  one approved revision, one sample at `UNDER_REVIEW`, one exception, one discussion, one ticket; extend
  `initialTotals`; bump `DEMO_SEED_VERSION`; add a demo browser spec.
- **Authorization:** must not run `pnpm demo:setup` without explicit owner approval
- **Acceptance:** reset produces a new generation with all new rows scoped to it and reconciliation still
  matches.
- **Complexity:** M

### WP-13 · Integration and browser test suite for Batches 8–11

- **Problem:** zero integration scenarios and zero browser specs for the new modules. This is why 26 stories
  are partial and 0 verified.
- **Required:** scenario files covering the brief's 50 scenarios, plus browser specs for the five new routes,
  plus the 18 negative security tests.
- **Dependencies:** WP-01
- **Complexity:** L — but it is the single highest-value item because it converts unverified work into
  evidence.

---

## P2 — Product completeness

### WP-14 · Auditor-scoped override review UI
E11-06 (#154): purpose-limited access, findings/owner/corrective-decision record. **S**

### WP-15 · Producer share on the impact dashboard
E13-01 (#174): aggregate with disclosed formula and denominator on `/intelligence`. **S**

### WP-16 · Effort range and pricing approval hand-off
E11-02 (#150): min/max effort, explicit approval path to issued terms. **S**

### WP-17 · Discussion sanitisation and delivery status
E02-07 (#101): content sanitisation; delivery/error state. **S**

### WP-18 · Availability pause effective date
E04-08 (#113): future-dated pause; explain amendment need for accepted work. **S**

### WP-19 · Fair-distribution paid-participation metric
E05-06 (#117): distinguish paid participation; selectable review period. **S**

---

## Recommended execution order

1. **WP-01** — nothing else can be trusted until migrations run.
2. **WP-13** (start) — stand up the harness so every subsequent fix lands with evidence.
3. **WP-02** — the counteroffer defect records consent without force; correctness first.
4. **WP-03** — the dual specification authority is the deepest architectural risk.
5. **WP-04, WP-05, WP-06** — complete the three P1 correctness gaps in catalog/planning.
6. **WP-07, WP-08, WP-09, WP-10, WP-11** — remaining workflow completion.
7. **WP-12** — seed the showroom once the workflows are correct, not before.
8. **WP-14 … WP-19** — completeness polish.

## Why this order

WP-01 and WP-13 are prerequisites for *any* acceptance claim — without them every other fix is unverifiable.
WP-02 and WP-03 are ordered above feature completion because both concern **agreement integrity**: one records
a consent that has no force, the other lets production release against a specification the product owner never
approved. Those are correctness defects, not missing features. Interface polish (P2) is last because none of it
affects whether the platform's commitments are real.
