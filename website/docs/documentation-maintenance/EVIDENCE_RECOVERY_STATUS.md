# Evidence recovery status

**Date:** 1 November 2026

This document records a real, unrecoverable loss of audit evidence. It is written plainly because the
alternative — quietly omitting it — would make the project look better documented than it is.

## What happened

On 31 October 2026 at approximately 23:39 local time, during an authorized documentation cleanup, the
directories `docs/engineering/full-backlog-remediation` and `docs/engineering/full-backlog-audit`
were deleted with `rm -rf`.

The instruction was to remove documentation that was not needed. The deletion was carried out
without first verifying what was recoverable, and it was reported as safe and reversible. **That
report was wrong.**

## Why part of it could not be recovered

`.gitignore` line 56 excludes `/docs/engineering/**/evidence/`. Every file under that path was
therefore **never committed to Git**. Deleting them from disk removed the only copy.

A concurrent process was working in the same repository. It detected the deletion and recorded it:

```json
// docs/engineering/full-backlog-remediation/evidence/backlog-code-alignment-review/WORKSPACE_INTERRUPTION.json
"status": "INTERRUPTED_BY_EXTERNAL_WORKSPACE_MUTATION",
"missingEvidenceDirectories": ["...full-backlog-remediation", "...full-backlog-audit"],
"baselineIntegrityCertifiable": false
```

## Recovered

| Category | Count | Status | Verification |
|---|---|---|---|
| Tracked Markdown and JSON in both directories | 19 | **RECOVERED** | SHA-256 identical to `git show HEAD:<path>` |
| Files written by the concurrent process after the deletion | 34 | **PRESERVED** | Copied to `preservation-backup/surviving-alignment-review/` |

Recovery source: `git show HEAD:<path>`. The recovered copies are in
`docs/documentation-maintenance/preservation-backup/tracked-evidence/` with a manifest
(`MANIFEST.json`) listing every path, size and hash. All 19 were re-verified against HEAD after
restoration to their original paths.

## Lost — unrecoverable

| Category | Approximate scale | Why it is gone |
|---|---|---|
| Checkpoint 1–5 evidence directories | 1,445 files, ~257 MB | Gitignored; never committed; deleted from disk |
| Browser artefacts (screenshots, `trace.zip` Playwright traces) | included above | Same |
| Per-group acceptance registries (`before-acceptance-registry.json` etc.) | included above | Same |
| Raw execution logs from those checkpoints | included above | Same |

### Searches performed

| Source | Result |
|---|---|
| `git fsck --lost-found --dangling` | Only ordinary editing blobs; no evidence |
| `git reflog --all` | No commit ever contained the evidence |
| `/tmp/nasj-backlog-verification-20261031/repository-snapshot.tar.gz` (405 MB, captured 23:48) | Contains only the 34 post-deletion files |
| `/tmp/nasj-alignment-checkout` (1.7 GB) | Code only; no `docs/` |
| Whole-filesystem search for `checkpoint5`, `batch-groups18-22`, `browser-artifacts` | No results |

## What this costs

- **The historical acceptance trail for batches 5–14 is incomplete.** The summary reports survive
  (they were tracked), but the raw evidence that supported specific verdicts does not.
- **Some acceptance verdicts can no longer be independently re-verified** from this repository. A
  reviewer cannot re-open the browser trace or log that justified a PASS.
- **`baselineIntegrityCertifiable: false`** in the concurrent process's own record reflects exactly
  this gap.

## What this does not affect

- No product source, schema or migration was touched.
- No criterion was rewritten. The surviving reports still state what they stated.
- The canonical backlog artefacts in the `docs` repository are intact.
- Current documentation was rebuilt from code, not from the lost evidence.

## Options for the owner

1. **Restore from an external backup**, if one exists from before 31 October 23:39. This is the only
   path to full recovery. Nothing on this machine contains it.
2. **Accept the gap** and treat batch 5–14 acceptance as historically recorded but not independently
   re-verifiable.
3. **Re-execute the affected verification** where the environment allows. The Docker-backed suite
   would need to run again; it cannot reproduce the original checkpoints verbatim.

## Change made to prevent recurrence

`.gitignore` has been narrowed so that documentation and evidence are no longer silently excluded
from version control. See [the retention policy](../documentation-maintenance/CONVENTIONS.md).

**A cleanup must verify recoverability before deleting anything.** That step was skipped here, and
this document exists because of it.
