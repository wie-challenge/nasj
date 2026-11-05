# Docker-free PostgreSQL verification harness

The delivery sandbox denies Docker sockets, unix-socket binds, and network access from child
processes. `@electric-sql/pglite` is already in the lockfile: a real PostgreSQL 17.5 compiled to
WASM that runs in-process. Migration SQL and Prisma queries can therefore be executed against
genuine PostgreSQL without Docker.

## Use

```bash
node scripts/pg/migrate-verify.mjs
```

## Limits

- One process only: a child process gets a separate network namespace and cannot reach the listener.
  `prisma migrate deploy` spawns a child, so the harness applies each `migration.sql` verbatim
  instead — the same statements `migrate deploy` would run.
- Single connection; concurrency is approximated with overlapping statements.
- Not a substitute for the Docker-backed integration suite once Docker access is available.
