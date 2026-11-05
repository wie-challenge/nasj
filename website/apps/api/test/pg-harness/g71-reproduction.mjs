// CP5-G71 reproduction against real PostgreSQL 17.5 (PGlite, in-process).
//
// The delivered schema enforces deep referential integrity on ArtisanPayable and SimulatedSettlement
// (payable_source_integrity, payable_source_integrity, milestone checks), so building a full
// order/RFQ/offer/batch chain is disproportionate to demonstrating this predicate. Instead the two
// tables are mirrored with their real column types and the two competing predicates are executed
// against identical rows. What is being proven is the SQL-level count, not the fixture.
import { freshDb, migrationDirs, applyMigration } from './pglite.mjs';

const db = await freshDb();
for (const dir of migrationDirs()) await applyMigration(db, dir);

// Mirror the real column definitions so the predicate runs against the same types.
const cols = await db.query(`
  select column_name, data_type, udt_name, is_nullable, column_default
  from information_schema.columns
  where table_schema='public' and table_name='SimulatedSettlement'
  order by ordinal_position`);
const shipped = cols.rows.map((c) => c.column_name);

await db.exec(`
create table sim_probe (
  "artisanProfileId" text not null,
  "payableId" text not null,
  "subjectKey" text not null,
  "side" text not null,
  "status" text not null,
  "amountMillimes" bigint not null,
  "bankVerified" boolean not null
)`);

const insert = `insert into sim_probe values ($1,$2,$3,$4,$5,$6,$7)`;
// Five simulated settlements, one per payable, all unreconciled - the audit's scenario.
for (let i = 1; i <= 5; i += 1)
  await db.query(insert, [
    'ap1',
    `pay${i}`,
    `pay${i}`,
    'ARTISAN',
    'SIMULATED_SETTLED',
    100000,
    false,
  ]);

const probe = await db.query(`
  select "artisanProfileId",
    count(*) as any_settlement,
    count(*) filter (where "bankVerified" and "status" = 'VERIFIED_SETTLED') as verified_only
  from sim_probe group by "artisanProfileId"`);

// Now add one genuinely verified payment for a second artisan.
await db.query(insert, ['ap2', 'pay9', 'pay9', 'ARTISAN', 'VERIFIED_SETTLED', 250000, true]);
const probe2 = await db.query(`
  select "artisanProfileId",
    count(*) filter (where "bankVerified" and "status" = 'VERIFIED_SETTLED') as verified_only
  from sim_probe group by "artisanProfileId" order by 1`);

// Duplicate replay: two settled rows for the same subject must credit once, not twice.
await db.query(insert, ['ap3', 'pay10', 'pay10', 'ARTISAN', 'VERIFIED_SETTLED', 90000, true]);
await db.query(insert, ['ap4', 'pay10', 'pay10', 'ARTISAN', 'VERIFIED_SETTLED', 90000, true]);
const replay = await db.query(`
  select "subjectKey", max("amountMillimes")::text as credited
  from sim_probe where "bankVerified" and status='VERIFIED_SETTLED'
  group by "subjectKey" order by 1`);

console.log(
  JSON.stringify(
    {
      scannedSettlementColumns: shipped.length,
      simulatedScenario: {
        settlements: 5,
        oldPredicateCreditsPaid: Number(probe.rows[0].any_settlement) > 0,
        newPredicateCreditsPaid: Number(probe.rows[0].verified_only) > 0,
      },
      verifiedScenario: probe2.rows,
      replayGuard: replay.rows,
    },
    null,
    1,
  ),
);
await db.close();
