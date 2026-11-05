# Duplicates and obsolete files

**Date:** 1 November 2026.

## Exact duplicates

**None.** Content-hash comparison across every file under `docs/`, excluding `preservation-backup/`,
found no two files with identical bytes.

This is the result of a deduplication pass, not of the tree having been clean. It previously held
57 redundant copies in 33 groups (0.64 MB). Four earlier statements in this document were wrong on
this point; the history is below so the correction is traceable rather than silent.

| Was claimed | Was true | Corrected |
|---|---|---|
| No duplicates across 1,525 artefacts | 57 redundant copies in 33 groups, before the archive move completed | 1 November 2026 |
| `recovered-git/` was a 19-file recovery scaffold | 18 of its 19 files were byte-identical to copies elsewhere | Removed; 1 unique file kept |
| 11 copies of one `schema.log` were distinct batch records | The file is 142 bytes: "The schema at prisma/schema.prisma is valid" | Collapsed to one |
| 15 copies of `diff.log` were distinct batch records | Every one was **0 bytes** | Removed |

## What was kept and why

Each byte-identical group now has exactly one copy, placed in the folder that produced it:

- **Batch evidence** stays in its own `evidence/batchN-*/` folder, even where an aggregate folder
  also held a copy. The batch folder is what a report cites.
- **Probe scripts** connected to the 31 October verification stay in that bundle's `probes/`.
- **`recovered-git/.../REMAINING_GAPS.md`** is the one survivor of that recovery tree. It is
  byte-identical to no other file, and it records the pre-edit text that later became
  `08-backlog-and-acceptance/known-gaps.md`. Keeping the recovery copy preserves what the file said
  before the move; keeping only the renamed version would lose it.

## Near-duplicates examined

| Pair | Overlap | Verdict |
|---|---|---|
| `batch12-acceptance-matrix` / `audits/batch12/acceptance-matrix` / `batch12-remediation/updated-acceptance-matrix` | 56–67% vocabulary | **Not duplicates.** Implementation view, independent-audit view and post-remediation view. Each is dated and cited separately. Retained. |
| `backlog-closeout/full-backlog-status-audit` / `role-story-access-matrix` | 56% vocabulary | **Not duplicates.** Backlog state versus role responsibilities. Retained. |

Similarity was measured by shared-word-set Jaccard index over 5+ character words, with a 50%
threshold. Filename similarity was not used, per the task rule.

## Obsolete files retained deliberately

| Category | Count | Why retained |
|---|---|---|
| Historical batch reports | 113 | Each is the only record of what that batch changed. Merging them would destroy the audit trail. |
| Batch planning documents | 6 | Superseded by their implementation reports, but they record the intended scope at the time. |
| E16/E02 epic records | 13 | Cited by later batch reports. |

## The preservation backup

`documentation-maintenance/preservation-backup/` holds 54 files (2.6 MB) that duplicate restored
originals. It is **excluded from Git and from documentation navigation** because it exists solely as
recovery evidence for the incident in `EVIDENCE_RECOVERY_STATUS.md`. It is not a documentation
duplicate.

Both halves have since been restored to their live locations: `surviving-alignment-review/` is
byte-identical to `engineering/full-backlog-remediation/evidence/backlog-code-alignment-review/`, and
16 of the 19 files in `tracked-evidence/` are byte-identical to their `99-archive/` originals. The
recovery this copy existed to enable is complete, so it is now removable. It was kept during this
pass because removing a recovery artefact immediately after the move it recovered from needs a
deliberate decision, not a cleanup default.

## Generated reports

644 of the 827 files under `docs/` are gitignored generated output (logs, JSON snapshots, browser
artefacts, Playwright traces). They are not documentation. Their retention is governed by the
`.gitignore` policy in `CONVENTIONS.md`.

Removed on 1 November 2026 as regenerable: four exponential GitHub snapshots (11.8 MB) from the
backlog-verification bundle, five byte-identical duplicate JSON exports, and one 12 MB Playwright
trace. `docs/` went from 59 MB to 29 MB across the pass. The 29 verdict reports in that bundle were
retained, and its `README.md` records what went and why.

## Current totals

| Measure | Value |
|---|---|
| Files under `docs/` | 771 |
| Markdown files | 211 |
| Tracked files | 683 |
| Tracked payload | 9.2 MB |
| Working-tree size | 25.7 MB |
