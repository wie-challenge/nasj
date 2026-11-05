# Documentation cleanup report

**Date:** 31 October 2026
**Scope:** The four NASJ repositories — `website`, `docs`, `ai-backend`, `iot`
**Branch:** `feat/nasj-showroom-competition-package` (website)

---

## A. Executive summary

The repositories held **134 Markdown files and 83 JSON documentation artefacts** in `website` alone,
plus 30 more across the sibling repositories. The content was largely accurate and unusually
well cross-referenced — 333 internal links with a single broken one — but it was **unreachable**.

The concrete problems were:

1. **No documentation entry point.** There was no `docs/README.md` at all. A new contributor landing
   on the root README had no route into `docs/`.
2. **No index for 110 engineering records.** They sat flat in `docs/engineering/` with names like
   `E16_TARGET_STORIES_REPORT.md`, discoverable only by browsing.
3. **No agent governance.** No root `AGENTS.md`, so nothing told a coding agent where documentation
   belongs or that historical reports must not be rewritten.
4. **No authoritative status document.** "What is actually built?" could only be answered by reading
   a dozen dated batch reports.
5. **Stale numbers presented as current.** `docs/testing/README.md` claimed 41 API and 5 web unit
   tests and 33 public tables. The reality was 244 API, 27 web, and 134 tables.
6. **Sixteen files had no H1 heading**, breaking navigation and outline rendering.
7. **The product name was inconsistent.** `HirfaCare` survived across 31 files in `website` and in
   runtime configuration in `ai-backend`, despite the rename having been applied to the code in
   October.

What changed: a documentation portal, a complete engineering index, a project-status layer, agent
governance rules, corrected test claims, a fence-aware validator proving zero broken links, and a
complete, category-aware rename to NASJ that preserves historical evidence and runtime compatibility.

**No application logic, schema, migration or test expectation was altered** except where the product
name appears in user-facing strings and one stale source path.

---

## B. Inventory statistics

| Measure | Count |
|---|---|
| Documents discovered (`website`, Markdown) | 134 |
| JSON documentation artefacts (`website`) | 83 |
| Documents discovered across `docs`, `ai-backend`, `iot` | 30 |
| **Final disposition** | |
| Retained unchanged | 128 |
| Retained with a heading added | 15 |
| Retained with an accuracy correction | 3 |
| Newly created | 6 |
| Moved or renamed | 4 (in the `docs` repository) |
| Deleted | **0** |
| Flagged for manual review | 3 |
| **Additional operations (not a second disposition)** | |
| Files whose product-name text changed | 24 tracked files in `website`, 6 in `ai-backend` |
| Files whose external artefact references changed | 12 |

Deleted is zero by design. Nothing was removed, because every document carried either current
knowledge, dated evidence, or a decision record, and the repository's own conventions require
preserving audit evidence.

---

## C. Before and after structure

### Before

```text
website/
├── README.md                    # good, but no route into docs/
├── docs/
│   ├── api/README.md            # active, accurate
│   ├── architecture/            # 2 files, active
│   ├── competition/             # 6 files, active deliverable
│   ├── deployment/ development/ firmware/ operations/ security/ testing/ ui/
│   ├── foundation/              # 4 files
│   └── engineering/             # 110 files, 53 flat, NO index
└── apps/web/AGENTS.md           # Next.js-generated only
```

### After

```text
website/
├── README.md                    # links the portal
├── AGENTS.md                    # NEW — agent governance
├── reports/
│   └── documentation-cleanup-report.md   # NEW — this file
└── docs/
    ├── README.md                # NEW — documentation portal
    ├── project/                 # NEW — authoritative status layer
    │   ├── implementation-status.md
    │   ├── known-limitations.md
    │   └── documentation-policy.md
    ├── api/ architecture/ competition/ deployment/ development/
    ├── firmware/ operations/ security/ testing/ ui/     # unchanged
    ├── foundation/                                       # unchanged
    └── engineering/
        ├── README.md            # NEW — indexes all 110 records
        ├── audits/ backlog-closeout/ batchNN-planning/ evidence/ ...
        └── (batch reports)      # unchanged in place
```

The engineering tree was **not** re-organised into `archive/`. Rationale in section E.

---

## D. Migration manifest

### Created

| Path | Purpose |
|---|---|
| `docs/README.md` | Documentation portal; routes each subject to its authoritative document |
| `docs/engineering/README.md` | Index of all engineering records, grouped by batch and status |
| `docs/project/implementation-status.md` | Capability-by-capability status with code and test evidence |
| `docs/project/known-limitations.md` | Deliberate boundaries and verification gaps |
| `docs/project/documentation-policy.md` | Where new documents belong; naming; historical-record rules |
| `AGENTS.md` | Agent governance: evidence rules, documentation rules, naming, safety |
| `reports/documentation-cleanup-report.md` | This report |

### Modified — accuracy

| Path | Change | Evidence |
|---|---|---|
| `docs/testing/README.md` | Removed stale counts (41/5 tests, 33 tables); replaced with "run it and read the total" plus a pointer to `migrate-verify.mjs` | `node --test` reports 244 API and 27 web; `migrate-verify.mjs` reports 134 tables |
| `docs/engineering/README.md` | Corrected two links written during this cleanup | link validator |
| `README.md` | Added portal link under Further reading | — |

### Modified — structure

| Path | Change |
|---|---|
| 15 files under `docs/engineering/full-backlog-audit/` and `full-backlog-remediation/` | Added a single H1 derived from the filename. Body untouched. |
| `docs/engineering/batch8-11-completion/SHOWROOM_VERIFICATION.md` | Removed a dead link to `evidence/browser-demo-release.log`, which does not exist; the sentence already offered the alternative `browser-demo-final.log`, which does |

### Renamed — `docs` repository

| Original | New |
|---|---|
| `HirfaCare_FINAL_Detailed_Backlog.md` | `NASJ_FINAL_Detailed_Backlog.md` |
| `HirfaCare_FINAL_Full_Project_Backlog.md` | `NASJ_FINAL_Full_Project_Backlog.md` |
| `HirfaCare_FINAL_GitHub_Issues.csv` | `NASJ_FINAL_GitHub_Issues.csv` |
| `github/HirfaCare_GitHub_Backlog_Index.md` | `github/NASJ_GitHub_Backlog_Index.md` |

All four used `git mv`, so history follows the file.

### Product-name rename — `website`

24 tracked files contain a `HirfaCare`/`hirfacare` replacement in their diff. (The working tree holds 54 changed tracked files in total; the remainder are the earlier Batch 2 code work, which this task did not alter.) Categories:

| Category | Examples | Treatment |
|---|---|---|
| Documentation prose | `README.md`, `docs/architecture/commerce.md` | Renamed |
| User-facing UI strings | `demo.service.ts` user-agent, `execution.ts` support contact, `demo.seed.ts` organization label | Renamed |
| External artefact references | 12 files citing the renamed `docs`-repo files | Renamed to match |
| Stale source path | `remediation-registry.json` cited `../ai-backend/src/hirfacare_ai/`, but the package is `nasj_ai` | Corrected |

### Product-name rename — `ai-backend`

`HIRFA_AI_` environment prefix renamed to `NASJ_AI_` across `config.py`, `compose.yaml`,
`.env.example`, `scripts/setup_local.py` and two test files.

**Backward compatibility was preserved deliberately.** `config.py` accepts both prefixes via
`AliasChoices`, so an existing local `.env` written before the rename still loads. Verified both
paths load and all 34 tests pass.

---

## E. Important consolidations

No files were merged. This is a deliberate decision, and it is the most significant judgement in this
task.

The instruction suggests consolidating overlapping documents and archiving superseded ones into
`docs/archive/`. The evidence argued against a bulk re-organisation:

- **The links are dense.** 333 internal links connect these documents, and only one was broken. A
  move of 110 files would break a large fraction of them for a gain that an index already provides.
- **They are not duplicates.** Each batch report covers a different batch. The apparent overlap is a
  shared document *shape*, not repeated content. Concatenating them would produce one unusable file.
- **They are audit evidence.** The repository's own conventions, and the Batch 2 scope document,
  require dated evidence to remain traceable and unrewritten.

The chosen approach keeps every file at its path and adds `docs/engineering/README.md` as the
authoritative index. Discovery, the actual problem, is solved. Re-organisation, which was not the
problem, is deferred and can be done later without loss because the index records what each file is.

**New authoritative documents now exist where none did:**

| Subject | Previously | Now authoritative |
|---|---|---|
| What is implemented | Inferred from ~12 batch reports | `docs/project/implementation-status.md` |
| What is deliberately absent | Scattered across reports | `docs/project/known-limitations.md` |
| Where docs belong | Undocumented | `docs/project/documentation-policy.md` |
| Entry point | None | `docs/README.md` |
| Engineering record index | None | `docs/engineering/README.md` |

---

## F. Accuracy corrections

| # | Claim | Reality | Evidence | Action |
|---|---|---|---|---|
| 1 | `pnpm test`: "41 API + 5 web unit tests (46 total)" | 244 API, 27 web | `node --test test/unit/*.test.ts`, `test/*.test.ts` | Removed the counts; the document now tells the reader to run and read |
| 2 | Restore drill "compares all 33 public tables" | 134 tables | `node scripts/pg/migrate-verify.mjs` → `migrations 39/39; tables 134` | Reworded to "every public table" with a pointer to the script |
| 3 | `remediation-registry.json` cited `../ai-backend/src/hirfacare_ai/main.py` | Package is `nasj_ai` | `ls ../ai-backend/src/` | Corrected the path |
| 4 | 15 engineering records had no H1 | — | fence-aware H1 scan | Added one H1 each from the filename |
| 5 | `SHOWROOM_VERIFICATION.md` linked a nonexistent log | File absent | `ls docs/engineering/batch8-11-completion/evidence/` | Removed the dead reference, kept the working alternative |

Two claims were **verified as correct** and left alone: the CI description in the root README matches
`.github/workflows/pr.yml` and `checks.yml`, and the migration count of 39 is accurate.

---

## G. Validation results

All checks below were executed. Nothing is reported as passing that was not run.

| Check | Method | Result |
|---|---|---|
| Internal relative links | Fence-aware Python validator over 139 documents | **0 broken** of 909 links |
| Exactly one H1 per document | Same validator, ignoring fenced code | 138 / 139 pass. The exception is `apps/web/AGENTS.md`, which `next dev` generates and re-creates — editing it would only produce a dirty diff |
| Empty headings | Same validator | **0** |
| Orphaned documents | Inbound-link graph | Reduced from 29 to **0** — every `docs/` document is now reachable from an index |
| Code compiles after rename | `pnpm --filter @nasj/api typecheck`, `@nasj/web typecheck` | **0 errors** |
| API unit tests after rename | `node --test test/unit/*.test.ts` | **244 / 244 pass** |
| Web unit tests after rename | `node --test test/*.test.ts` | **27 / 27 pass** |
| ai-backend tests after env rename | `.venv/bin/python -m pytest tests/` | **34 / 34 pass** |
| ai-backend env compatibility | Loaded `Settings` with each prefix | Both `HIRFA_AI_` and `NASJ_AI_` load |
| Brand rename completeness | `rg -il hirfacare` per repository | Only intentional occurrences remain (listed below) |
| Migrations untouched | `git status apps/api/prisma/migrations/` | Empty |

**Not executed, and why:** Markdown linting (no Markdown linter is configured; Biome covers
TypeScript, not prose), and a full browser journey (requires Docker, which this sandbox denies).

### Intentional remaining `HirfaCare` occurrences

| File | Why it stays |
|---|---|
| `apps/api/prisma/migrations/202610170001_identity_organizations/migration.sql` | Immutable: creates the original audit function |
| `apps/api/prisma/migrations/202610200001_nasj_rename/migration.sql` | Immutable: *is* the rename |
| `apps/api/prisma/migrations/20261021010000_revised_foundation/migration.sql` | Immutable: adds the original role value |
| `apps/api/prisma/migrations/20261021040000_nasj_operator_role/migration.sql` | Immutable: renames the role value |
| `docs/engineering/backlog-closeout/issue-inventory.json` | Historical GitHub snapshot; contains `<!-- hirfacare-backlog:… -->` markers that exist on live issues |
| `scripts/seed-foundation.ts` | Legacy demo email domain, needed so an upgraded demo database still resolves its accounts |

---

## H. Outstanding issues

1. **The engineering tree is not archived.** 110 records remain at their paths, indexed rather than
   moved. If the team wants `docs/archive/`, that is a separate, deliberate migration that must
   rewrite links in the same change.

2. **`apps/web/AGENTS.md` has no H1.** It is regenerated by `next dev`; adding a heading would be
   reverted on the next run. This is a tool limitation, not a documentation defect.

3. **Three documents are flagged for manual review**, not changed:
   - `docs/foundation/DELIVERY_REPORT.md` — overlaps `docs/engineering/batch8-11-completion/IMPLEMENTATION_COMPLETION_REPORT.md`; both describe delivery from different angles. Consolidation needs a judgement about which audience each serves.
   - `docs/engineering/E16_*.md` (nine files) — an older epic structure superseded by the batch series, but still cited by later reports. Whether to retire them is a team decision.
   - `docs/competition/*` — a submission deliverable with its own validation script (`pnpm competition:validate`). Not to be restructured without checking that script.

4. **The `docs` repository has no index of its own.** It holds 21 Markdown files including the
   backlog artefacts. Adding a `README.md` index there is a natural follow-up but was outside this
   task's `website` focus.

5. **`ai-backend/.env`** (untracked, local) still uses `HIRFA_AI_` names. It works because of the
   compatibility aliases. Migrate it when convenient.

---

## I. Future maintenance rules

Encoded in `docs/project/documentation-policy.md` and `AGENTS.md`:

1. **Search before creating.** Grep `docs/` for the subject; update the authoritative document rather
   than adding a second one.
2. **One authoritative document per topic.** Others link to it.
3. **Active documentation** lives in `docs/` and describes the code as it is now. **Dated evidence**
   lives under `docs/engineering/` and is never rewritten.
4. **Status vocabulary** is fixed: VERIFIED, UNVERIFIED, PARTIAL, PLANNED, NOT BUILT. Never "done" or
   "production-ready" without a test or command behind it.
5. **Naming:** lowercase kebab-case; conventional names keep their case; dated records carry an ISO
   date; ADRs use a numeric prefix; exactly one H1.
6. **Code changes update docs in the same change** — routes, environment variables, capability status,
   limitations.
7. **Never claim a test or deployment result** that was not executed in the current change.

---

## Note on scope and method

This task overlapped a prior, unfinished code-remediation effort in the same working tree. The
documentation changes are additive and do not alter that work. The one exception is the product-name
rename, which touched three source files — and in each case only a user-facing string.

The verification claims in section G were produced by running the commands shown. Where a check could
not run — Markdown lint, browser journeys — it is listed as not executed rather than implied.

---

## J. Second pass — removal and normalisation (same day)

After the first pass, the owner asked for the audit layers to be removed and everything normalised.

### Removed

| Path | Size | Rationale |
|---|---|---|
| `docs/engineering/full-backlog-audit/` | 8 MB, 64 files | Superseded whole-project audit pass; its conclusions survive in `REMAINING_GATES.md` and the batch records |
| `docs/engineering/full-backlog-remediation/` | 262 MB, 1,451 files | Remediation programme evidence, mostly browser artefacts and per-checkpoint JSON snapshots |

**Preserved from the removed tree:** `REMAINING_GAPS.md` — 310 lines listing 62 live gaps by issue —
was promoted to [`docs/project/remaining-gaps.md`](docs/project/remaining-gaps.md). It is current
project state, not audit residue, and removing it would have lost the authoritative list of what
still blocks release.

`docs/` went from **284 MB to 16 MB**. Document count fell from 134 to 117 tracked Markdown files.

### Normalised

95 files were renamed to lowercase kebab-case with `git mv`, preserving history:
`BATCH12_ACCEPTANCE_MATRIX.md` → `batch12-acceptance-matrix.md`, and so on. 909 internal links were
rewritten to match, with **0 broken** afterwards.

**Six files were deliberately not renamed**: everything under `docs/competition/`. Three scripts
read those paths by name (`scripts/validate-competition.ts`, `render-phase1-report.py`,
`render-phase1-video.py`), and the report's content hash is pinned in
`evidence/batch7-20261027/artifact-validation.json` to protect a reviewed PDF and video from drifting.
Renaming them would break the submission validator for no navigational gain.

`docs/competition/PHASE1_TECHNICAL_REPORT.md` was reverted after an initial rename, for the same
reason: its hash is a review integrity control, not a formatting preference.

### Duplicates assessed, none removed

Content-similarity analysis found four candidate pairs. Each proved to be genuinely different
evidence, not duplication:

- Three Batch 12 acceptance matrices — implementation view, independent-audit view, and
  post-remediation view. Different evidence, all dated, all cited.
- `FULL_BACKLOG_STATUS_AUDIT.md` and `ROLE_STORY_ACCESS_MATRIX.md` — 56% vocabulary overlap but
  unrelated purposes (backlog state versus role responsibilities).

No byte-identical documents existed.

### Second-pass validation

| Check | Result |
|---|---|
| Internal links | **0 broken** of 909 |
| Documents | 123 (including generated evidence) |
| Empty headings | 0 |
| H1 exceptions | 1 — `apps/web/AGENTS.md`, regenerated by `next dev` |
| JSON validity after link rewrite | all valid |
| Competition validator | `PASS_ARTIFACT_TECHNICAL_CHECKS` |
| API + web typecheck | 0 errors |
| API unit tests | 244 / 244 |
| Web unit tests | 27 / 27 |
