# Link validation

**Last verified:** 1 November 2026.

## Method

A Python validator walked every Markdown file under `docs/` and resolved each inline link relative to
the file's directory, testing that the target exists on disk.

- Excluded: `documentation-maintenance/preservation-backup/` and `engineering/**/recovered-git/`.
  These are recovery copies, not navigation.
- Parsed inline Markdown links (label plus parenthesised target).
- Ignored `http:`, `https:`, `mailto:` and pure `#anchor` targets.

## Result

| Measure | Value |
|---|---|
| Markdown files scanned | 184 |
| Internal links parsed | 476 |
| **Broken internal links** | **4** |

All four are pre-existing breaks inside archived historical reports, not navigation links.

## The four broken links

| File | Target | Cause |
|---|---|---|
| `99-archive/historical-backlog-snapshots/full-backlog-remediation/ai-service-verification.md` | `evidence/ai-service/` | Destroyed 31 October. See [Evidence recovery status](EVIDENCE_RECOVERY_STATUS.md). |
| `99-archive/historical-backlog-snapshots/full-backlog-remediation/ai-service-verification.md` | `evidence/ai-service/namespace-rename-proof.json` | Same. |
| `99-archive/remediation-batches/batch8-11-completion/showroom-verification.md` | `evidence/browser-demo-release.log` | Never present in this repository. |
| `99-archive/remediation-batches/batch13-planning/scope-audit.md` | `../../../../docs/HirfaCare_FINAL_Full_Project_Backlog.md` | Backlog file lives in the separate `docs` repository. |

These are left unresolved on purpose. Each points at material that does not exist here, and rewriting
a historical report to hide a dangling citation would falsify the record.

## Correction to the previous revision

The previous revision of this file claimed **0 broken of 1,020 links across 228 documents**. That was
wrong. It was produced against a tree in which `docs/99-archive/` did not exist, so the 113 archived
documents it counted were not on disk to be checked, and the 13 links that other documents aimed into
`99-archive/` were not followed.

Measured against the tree as it actually stood at that moment, the correct figure was **15 broken
links of 131**: 13 pointing into the absent `99-archive/`, plus 2 inside a `recovered-git/` copy.

## Not validated

- **External URLs** were not fetched. Network access is filtered in this environment.
- **Mermaid syntax** was not machine-checked. No Mermaid validator is installed. Diagrams use only
  `flowchart` and `sequenceDiagram` constructs.
- **Markdown lint** was not run. No Markdown linter is configured; Biome covers TypeScript only.
