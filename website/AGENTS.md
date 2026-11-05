# Agent instructions

Operational rules for coding agents working in this repository. Keep them short; they override
convenience, not the user.

## Evidence before claims

Never state that a feature is implemented, a test passes, or a deployment works without having run
the command and read its output in this session. If a check could not run — Docker unavailable, a
sandbox denies a socket — say so plainly and do not record it as a pass.

Historical documents under `docs/engineering/` record what was true on their date. They are not
evidence about the current commit.

## Documentation

- **Search before creating.** Grep `docs/` for an authoritative document on the subject. Update it
  rather than adding a second one.
- Follow [the documentation policy](docs/documentation-maintenance/CONVENTIONS.md) for where a file belongs
  and how it is named.
- Dated reports are historical. Fix a broken link or typo; never rewrite a historical PASS, soften a
  finding, or delete an unflattering record.
- Temporary execution reports, verification transcripts and scratch analysis do not belong in
  `docs/`. Put them under `docs/engineering/evidence/` if they are evidence worth keeping, or leave
  them out of the repository.
- When code changes, update the affected document in the same change: routes in `docs/api/README.md`,
  environment variables in the root `README.md`, capability status in
  `docs/project/implementation-status.md`.

## Product naming

The product is **NASJ**. The former name `HirfaCare` appears only in:

- four migrations under `apps/api/prisma/migrations/` that record the rename itself — these are
  immutable;
- one historical GitHub snapshot under `docs/engineering/backlog-closeout/`;
- the legacy demo email domain in `scripts/seed-foundation.ts`, which exists so upgraded demo
  databases keep working.

Do not add the old name anywhere else.

## Safety

- Do not modify applied migrations. Add a new one.
- Do not relax anti-fabrication constraints (`execution_unverified`, `payout_status`,
  `SimulatedSettlement_provenance_check`) to make a test pass.
- Do not treat simulated or manually reported payments as verified settlement.
- Do not commit secrets. `.env`, `.local/` and credentials are ignored; keep them that way.

## Commands

Run from the repository root with Node 24 and pnpm 11.3.0.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration   # requires Docker
```
