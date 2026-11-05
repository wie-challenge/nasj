# Audit Summary — Batches 8–11

Date: 28 October 2026, Africa/Tunis. Repository `website/`, branch
`feat/nasj-showroom-competition-package`, working tree carrying the uncommitted Batch 8–11 work.

**Overall verdict: the batches are substantial but cannot be accepted. No story is verified, three correctness
defects were found, and the showroom demonstrates none of the new functionality.**

---

## A. GitHub

| Metric | Value |
|---|---|
| Live GitHub access | **BLOCKED** — invalid tokens + `api.github.com` denied by sandbox |
| Evidence used | `evidence/batch7-20261027/github-issues.json` — real snapshot, **213 issues**, dated 27 Oct 2026 |
| Snapshot totals | 132 OPEN · 81 CLOSED |
| Target stories mapped | **33 / 33** (no gaps, no duplicates) |
| Target states | **30 OPEN · 3 CLOSED** (#97, #100, #101) |
| Closed with incomplete criteria | **1** — #100 (E02-06) |
| Previously-closed baseline issues verified present | 9 / 9 |
| Remote actions taken | **none** |

`closedAt` is absent from the snapshot, so closure timing is reported as unknown, not guessed.

## B. Implementation

| Classification | Count |
|---|---|
| Unique backlog stories | **33** |
| VERIFIED_SOFTWARE_CRITERIA | **0** |
| IMPLEMENTED_UNVERIFIED | **7** |
| PARTIALLY_IMPLEMENTED | **26** |
| BLOCKED | 0 |
| NOT_IMPLEMENTED | 0 |

The prior matrix claimed 22 implemented-unverified / 7 partial. **That was arithmetically impossible**: it has
34 rows for 33 stories (E02-05 twice) and its status column sums to 27 + 7 = 34. Re-derivation against the real
issue criteria lowered every optimistic status: several stories I had marked `IMPLEMENTED_UNVERIFIED` are in
fact partial — E20-02 (no payable, no material cost), E05-02 (no weights or scores), E11-02 (no effort range),
E11-03 (no material readiness), E06-05 (no affected quantity/date), E06-06 (no capacity/material/transport
impact), E19-03 (no withdrawal), E13-05 (hard-coded threshold).

## C. Verification

| Check | Result |
|---|---|
| `pnpm lint` | **PASS** — 379 files, 0 findings |
| `pnpm typecheck` | **PASS** — 0 TS errors |
| API unit tests (direct runner) | **PASS** — 108 / 108, 0 skipped |
| Web unit tests (direct runner) | **PASS** — 25 / 25, 0 skipped |
| `pnpm --filter @nasj/api test` | **BLOCKED** — sandbox denies `tsx` IPC |
| `pnpm test:integration` | **BLOCKED** — `tsx` IPC; direct run then hits Docker permission denial |
| `pnpm test:e2e` / `test:e2e:demo` | **BLOCKED** — Docker permission denial |
| `pnpm build` | **PASS** — all 5 new routes emitted |
| `prisma validate` | **PASS** |
| `git diff --check` | **PASS** |
| Migration execution | **NOT PERFORMED** — no PostgreSQL, no Docker daemon |
| Integration scenarios for new modules | **0** |
| Browser specs for new routes | **0** |
| Negative security tests executed | **1 of 18** (unit-level only) |
| Showroom coverage of new models | **0 of 7** models seeded |

No pre-existing test regressed.

## D. Critical defects

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| **D-1** | **P0** | Accepted counteroffer never reaches the offer. `ARTISAN_ACCEPTED` is recorded but no new terms, no capacity reservation, no commitment. Agreement recorded without force. | `collaboration.service.ts` `acceptCounter` — no `commercialOffer.update` in path; only such call is in `decideSchedule`. |
| **D-2** | **P0** | Migrations unexecuted. 20 tables exist only as SQL text. | No PostgreSQL; Docker socket permission denied. |
| **D-3** | **P1** | Platform administrator can approve a schedule change in the buyer's place, substituting governance authority for contractual consent. | `!buyerAuthority && !access.platform` at ~line 350. |
| **D-4** | **P1** | Two competing product-specification authorities. Catalogue approval gates nothing; release still reads `ProcurementSample`. | Zero references to catalogue models from `modules/procurement/`. |
| **D-5** | **P1** | No sample payment obligation and no numeric material cost → E20-02's own verification scenario cannot pass. | Zero `payable` references in `catalog.service.ts`. |
| **D-6** | **P2** | Showroom demonstrates no new feature; zero new models seeded. | `grep` of `demo.seed.ts` returns 0 for all 7 models. |
| **D-7** | **P2** | EMAIL-only notification opt-in writes no delivery record at all — the event vanishes silently. | `notify()` returns `null` when `!plan.deliver`. |

## E. Next development plan

Full detail in `NEXT_IMPLEMENTATION_BACKLOG.md` (19 work packages). The recommended order is **not** the order
of the original batches; it follows risk:

1. **WP-01 — prove the migrations.** Everything else is unverifiable until 20 tables actually exist.
2. **WP-13 (start) — integration harness.** Land every later fix with evidence.
3. **WP-02 — counteroffer writeback.** Consent integrity outranks features.
4. **WP-03 — unify the specification chain.** Deepest architectural risk.
5. **WP-04/05/06**, then **WP-07…WP-11**, then **WP-12** (seed the showroom only once workflows are correct),
   then **WP-14…WP-19**.

Rationale: WP-02 and WP-03 both concern *whether the platform's commitments are real*. WP-12 is deliberately
late because seeding a showroom over incorrect workflows would demonstrate something untrue.

## F. Acceptance recommendation per story

| Story | Issue | Recommendation |
|---|---|---|
| E05-02 | #115 | NEEDS_IMPLEMENTATION (weights/scores) |
| E05-03 | #48 | NEEDS_IMPLEMENTATION (material assumptions) |
| E05-04 | #50 | NEEDS_DATABASE_VERIFICATION |
| E05-05 | #116 | NEEDS_DATABASE_VERIFICATION (concurrency) |
| E05-07 | #118 | NEEDS_IMPLEMENTATION (auditor scoping) |
| E11-01 | #149 | NEEDS_IMPLEMENTATION (weights reference) |
| E11-02 | #150 | NEEDS_IMPLEMENTATION (effort range) |
| E11-03 | #151 | NEEDS_IMPLEMENTATION (material readiness) |
| E20-01 | #91 | NEEDS_IMPLEMENTATION (catalogue→release binding) |
| E20-02 | #98 | NEEDS_IMPLEMENTATION (payable, material cost) |
| E20-03 | #99 | NEEDS_IMPLEMENTATION (downstream inspection) |
| E02-06 | #100 | NEEDS_IMPLEMENTATION (unify approval paths) — **CLOSED, review** |
| E11-04 | #152 | NEEDS_IMPLEMENTATION (staleness, owner) |
| E11-05 | #153 | NEEDS_IMPLEMENTATION (forecast snapshot) |
| E11-06 | #154 | NEEDS_IMPLEMENTATION (auditor scope, findings) |
| E13-01 | #174 | NEEDS_IMPLEMENTATION (producer share) |
| E13-02 | #173 | NEEDS_DATABASE_VERIFICATION |
| E13-04 | #176 | NEEDS_IMPLEMENTATION (observed hours store) |
| E13-05 | #177 | NEEDS_IMPLEMENTATION (configurable threshold) |
| E05-06 | #117 | NEEDS_IMPLEMENTATION (paid participation, period) |
| E06-07 | #123 | NEEDS_IMPLEMENTATION (dedup, ack, owner) |
| E02-05 | #97 | NEEDS_BROWSER_VERIFICATION (pre-existing) |
| E02-07 | #101 | NEEDS_IMPLEMENTATION (sanitisation) |
| E06-05 | #121 | NEEDS_IMPLEMENTATION (quantity/date, coordinator notify) |
| E06-06 | #122 | NEEDS_IMPLEMENTATION (impact scope, affected parties) |
| E04-05 | #110 | NEEDS_DATABASE_VERIFICATION (pre-existing) |
| E04-07 | #112 | NEEDS_IMPLEMENTATION (**P0 writeback**) |
| E04-08 | #113 | NEEDS_IMPLEMENTATION (effective date) |
| E04-09 | #114 | NEEDS_DATABASE_VERIFICATION (pre-existing) |
| E19-01 | #92 | NEEDS_IMPLEMENTATION (renderer, print, validation) |
| E19-03 | #211 | NEEDS_IMPLEMENTATION (withdrawal) |
| E14-03 | #181 | NEEDS_IMPLEMENTATION (attachments, escalation) |
| E14-06 | #184 | NEEDS_IMPLEMENTATION (localisation, retry) |

**READY_FOR_OWNER_ACCEPTANCE: 0 of 33.**
**BLOCKED_BY_EXTERNAL_EVIDENCE: 0** — nothing here is blocked on third-party policy; the blockers are
infrastructure (Docker/PostgreSQL) and code.

## G. What changed in my own assessment

The Batch 8–11 reports I wrote previously were too generous. This audit revised **22 stories downward** from
`IMPLEMENTED_UNVERIFIED` to `PARTIALLY_IMPLEMENTED` after reading the real issue criteria rather than the
one-line backlog summary. The headline 22/7 figure was also arithmetically wrong. Corrected: **0 / 7 / 26**.

The most serious finding is D-1: the counteroffer workflow records an agreement that has no effect. It would
pass a superficial UI check — status shows `ARTISAN_ACCEPTED` — while nothing has actually been agreed. That is
precisely the class of defect a green test suite hides, and precisely why WP-13 must precede feature work.
