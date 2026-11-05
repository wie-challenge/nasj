# Archive manifest

**Date:** 1 November 2026.

Materials moved into `docs/99-archive/`. Every file retains its original content.

## historical-audits/

Batch implementation reports, acceptance matrices and dated domain reports for batches 5–14 and the
E16/E02 epics. Moved from `docs/engineering/`. Reason: superseded as current documentation by
`00-project/current-status.md`, but retained as the record of what each batch did.

## remediation-batches/

Audit and remediation material: `audits/`, `batch12-remediation/`, `batch13-planning/`,
`batch14-planning/`, `batch8-11-completion/`. Reason: batch-scoped evidence.

## historical-backlog-snapshots/

`backlog-closeout/`, `full-backlog-audit/`, `full-backlog-remediation/`. Reason: GitHub backlog
reconciliation and audit passes, tied to a snapshot date.

## legacy-documentation/

`delivery-report`, `role-restructuring-audit`, `role-story-access-matrix`, `try-the-foundation`, moved
from `docs/foundation/`. Reason: foundation-era documents describing a completed extraction.

There is no `superseded-plans/` folder. Batch planning documents sit under `remediation-batches/`
with the audits that superseded them, which keeps a plan beside the verdict on it. The reserved
folder listed in the previous revision of this document was never created.

## What was NOT archived

| Retained in place | Reason |
|---|---|
| `docs/competition/` | Frozen submission artefacts. Content hash pinned in `artifact-validation.json`; moving or editing breaks `pnpm competition:validate`. |
| `docs/engineering/evidence/` | Surviving raw evidence, referenced by archive reports. Binary artefacts remain gitignored. |

`docs/engineering/remediation-batch2/` is absent, not retained. It appears in the previous revision
of this document as an active proposal awaiting owner decisions D1 and D2, but it holds no files and
never has in any commit. The proposal it referred to does not exist in this repository.

## Verification

The archive holds 111 files across four folders, plus [README.md](../99-archive/README.md) indexing
them.

The original move was staged in the Git index and never written to the working tree, so for a period
the 110 moved files existed only in `HEAD`. They were restored on 1 November 2026 and checked
file-by-file: every restored file is byte-identical to its `HEAD` blob, 110 of 110, with SHA-256
recorded in `MIGRATION_MANIFEST.json`. See section I of
`FINAL_DOCUMENTATION_RESTRUCTURING_REPORT.md`.

`HASH_VERIFICATION.json` records the earlier comparison (368 identical, 12 CRLF-normalised, 0
modified). It is retained as the record of that pass and does not cover the restore above.
