# Engineering evidence

**Last verified:** 1 November 2026.

Surviving execution evidence: test logs, build output, browser captures, probe scripts and JSON
exports, grouped by the batch that produced them.

This folder is **evidence, not documentation**. Nothing here describes current behaviour. For that,
use [Current status](../00-project/current-status.md); for dated reports, use
[the archive](../99-archive/README.md).

## Folders

| Folder | Contents |
|---|---|
| [evidence/](evidence/) | Per-batch execution evidence: unit and integration logs, browser captures, migration and restore drills |
| [audits/](audits/) | Independent audit evidence for batches 8–12 |
| [batch8-11-completion/](batch8-11-completion/) | Completion evidence for batches 8–11: story acceptance, integration, migration execution |
| [batch12-remediation/](batch12-remediation/) | Batch 12 financial remediation evidence |
| [full-backlog-remediation/](full-backlog-remediation/) | Backlog alignment review evidence and probes |
| [backlog-code-verification-2026-10-31/](backlog-code-verification-2026-10-31/) | The 31 October backlog-to-code verification bundle |
| [backlog-closeout/](backlog-closeout/) | GitHub backlog closeout and reconciliation |
| [issues/](issues/) | Per-issue records |

## The verification bundle

[backlog-code-verification-2026-10-31/](backlog-code-verification-2026-10-31/) is the largest single
package. Its `README.md` is the entry point and records both the review conclusions and the
regenerable artefacts that were removed from it.

## Retention

Evidence is version-controlled. Binaries and regenerable machine output (archives, screenshots,
Playwright traces, `gh` snapshots) are gitignored by explicit pattern, listed in `.gitignore`.

Duplicate copies have been removed where the same bytes existed in more than one place. Each
surviving copy sits in the batch folder that produced it.

**Before deleting any evidence, verify it is committed.** A gitignored file has no second copy. See
[the retention policy](../documentation-maintenance/CONVENTIONS.md).
