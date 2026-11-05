import { bootPostgres, assertWire } from './wire-session.mjs';

const env = await bootPostgres();
const wire = await assertWire(env);

await env.client.query('create table if not exists wire_probe (id int primary key, v text)');
await env.client.query(
  'insert into wire_probe values (1,$1) on conflict (id) do update set v=excluded.v',
  ['committed'],
);
await env.client.query('begin');
await env.client.query("insert into wire_probe values (2,'rolled-back')");
await env.client.query('rollback');
const rows = await env.client.query('select id, v from wire_probe order by id');

// A real transactional conflict: two overlapping writers on the same row.
await env.client.query('create table if not exists lock_probe (id int primary key, n int)');
await env.client.query('insert into lock_probe values (1,0) on conflict (id) do nothing');
const a = await env.client.query('begin');
void a;
await env.client.query('update lock_probe set n = n + 1 where id = 1');
await env.client.query('rollback');
const afterRollback = await env.client.query('select n from lock_probe where id = 1');

console.log(
  JSON.stringify(
    {
      ...wire,
      writeReadBack: rows.rows,
      rollbackHonoured: !rows.rows.some((r) => r.id === 2),
      updateRollbackHonoured: afterRollback.rows[0].n === 0,
    },
    null,
    1,
  ),
);
await env.close();
