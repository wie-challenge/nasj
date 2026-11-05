# Documentation conventions

**Last verified:** 1 November 2026.

Rules for adding and maintaining documentation. They apply to humans and coding agents.

## Where a document belongs

| You are writing | Put it in |
|---|---|
| How to set up or run the project | `03-engineering/` |
| How the system is designed | `02-architecture/` |
| A product capability | `01-product/` |
| A procedure: deploy, monitor, recover | `07-operations/` |
| An exact contract: routes, variables | `02-architecture/api-architecture.md` |
| Current capability status or limits | `00-project/` |
| Outstanding work | `08-backlog-and-acceptance/` |
| Testing and verification | `09-verification-and-quality/` |
| A dated report, audit or acceptance matrix | `99-archive/` |
| Raw evidence | `docs/engineering/evidence/<date-or-batch>/` |
| A proposal for unapproved work | `engineering/remediation-<batch>/` |

## Before creating a file

1. **Search** `docs/` for an authoritative document on the subject.
2. **Update it** rather than adding a second one. Two documents on one subject drift apart.
3. If the subject is genuinely new, create one file in the right folder and link it from
   `docs/README.md`.

## Naming

- Lowercase kebab-case: `system-overview.md`, `known-gaps.md`.
- Conventional names keep their case: `README.md`, `AGENTS.md`.
- Dated records carry an ISO date: `*-2026-10-27.md`.
- ADRs use a numeric prefix under `02-architecture/architecture-decisions/`.
- Exactly one H1 per document.

## Writing

- State what is true now, not what was planned.
- Put evidence beside the claim: a file path, a test name, a command.
- Never claim a capability, test result or deployment not verified in this repository.
- Prefer a table over paragraphs of narration.
- No completion congratulations, no repeated executive summaries, no progress narration.

## Status vocabulary

Use only: **VERIFIED**, **UNVERIFIED**, **PARTIAL**, **PLANNED**, **NOT BUILT**.
Never "done", "complete" or "production-ready" without a test or command behind it.

## Historical records are immutable in substance

A dated record describes what was true on its date. You may fix a broken link or a typo. You may
**not** update a historical PASS to cover a later commit, soften a finding, or delete an unflattering
record. If superseded, add a line at the top pointing to the newer document; leave the body intact.

## Retention

Documentation and evidence are version-controlled. `.gitignore` previously excluded whole evidence
trees, which allowed ~257 MB of audit evidence to be deleted with no recoverable copy. Only oversized
binary artefacts (`.zip`, `.png`, Playwright traces) and regenerable machine output are ignored, each
named explicitly rather than by a broad pattern.

**Before deleting any documentation, verify it is recoverable.** This is not optional.

A deletion is recoverable only if the content is committed. `git show HEAD:<path>` is the test. A
file that is gitignored, or staged for deletion but never committed, has no second copy: deleting it
removes the only one. Stage nothing you intend to keep as the sole record.

### What may be deleted without a retention decision

- Machine output reproducible from a command (`gh` snapshots, build logs, Playwright traces).
- Byte-identical duplicates where the authoritative copy is named and verified first.
- Empty directories.

Everything else — dated reports, acceptance matrices, evidence captures — is a record of a moment
that cannot be regenerated, and stays.

## Current size

| Measure | Value |
|---|---|
| Files under `docs/` | 771 |
| Markdown files | 211 |
| Tracked files | 683 |
| Tracked payload | 9.2 MB |
| Working-tree size | 25.7 MB |

The gap between tracked payload and working-tree size is gitignored evidence on this machine. It is
not part of the repository and does not affect clone size or CI.

## When code changes

| Code change | Update |
|---|---|
| New or changed route | `02-architecture/api-architecture.md` |
| New environment variable | root `README.md` configuration |
| New migration | `03-engineering/database-and-migrations.md` |
| Capability status change | `00-project/current-status.md` |
| New limitation | `00-project/scope-and-boundaries.md` |
