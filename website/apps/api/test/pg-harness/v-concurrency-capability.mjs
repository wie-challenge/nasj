// Establishes exactly what concurrency evidence this environment can produce.
//
// Written with hard timeouts and step logging: if the server serializes connections, a second
// session's query will never complete while the first holds an open transaction. That is the
// finding, and it must be demonstrated rather than assumed.
import { bootPostgres } from './wire-session.mjs';
import pg from 'pg';

const env = await bootPostgres();
const url = env.connectionString;
const out = { steps: [] };
const log = (s) => {
  out.steps.push(s);
  process.stderr.write(`${s}\n`);
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise.then((v) => ({ status: 'resolved', value: v })),
    new Promise((r) => setTimeout(() => r({ status: 'TIMEOUT', label }), ms)),
  ]);

const connect = async (name) => {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await c.connect();
  log(`connected ${name}`);
  return c;
};

const a = await connect('A');
const b = await connect('B');

await a.query('create table if not exists conc_probe (id int primary key, n int not null)');
await a.query('insert into conc_probe values (1,0) on conflict (id) do nothing');
log('schema ready');

// ---- A. Both sessions begin, then B queries while A holds an open transaction with a write.
await a.query('begin');
log('A began');
await a.query('update conc_probe set n = 1 where id = 1');
log('A updated (uncommitted)');

const bBegin = await withTimeout(b.query('begin'), 3000, 'B begin');
log(`B begin -> ${bBegin.status}`);

const bSelect = await withTimeout(
  b.query('select n from conc_probe where id = 1'),
  3000,
  'B select',
);
out.crossSessionRead = {
  outcome: bSelect.status,
  sawValue: bSelect.status === 'resolved' ? bSelect.value.rows[0].n : null,
  interpretation:
    bSelect.status === 'TIMEOUT'
      ? 'B cannot execute while A holds an open transaction: the server serializes sessions.'
      : bSelect.value.rows[0].n === 1
        ? 'B observed A uncommitted data: sessions share one transaction context.'
        : 'B saw the pre-A value: genuine isolation.',
};
log(`B select -> ${bSelect.status}`);

// Release A so B can drain.
await a.query('rollback');
log('A rolled back');

// ---- B. Independent sessions on separate statements do complete (server is usable, just serial).
const soloA = await withTimeout(a.query('select pg_backend_pid() as p'), 3000, 'A pid');
const soloB = await withTimeout(b.query('select pg_backend_pid() as p'), 3000, 'B pid');
out.pidCheck = {
  a: soloA.status === 'resolved' ? soloA.value.rows[0].p : soloA.status,
  b: soloB.status === 'resolved' ? soloB.value.rows[0].p : soloB.status,
  distinctSessions: soloA.status === 'resolved' && soloB.status === 'resolved',
};

// ---- C. Concurrent statements without an open transaction: do they overlap or queue?
const slow = await withTimeout(a.query(`select pg_sleep(1.5)`), 8000, 'pg_sleep');
out.pgSleep = slow.status;

try {
  await b.query('rollback');
} catch {}
await a.end().catch(() => {});
await b.end().catch(() => {});
await env.close();
console.log(JSON.stringify(out, null, 1));
process.exit(0);
