import { bootPostgres } from './wire-session.mjs';

const env = await bootPostgres();
const tables = [
  'User',
  'Organization',
  'ArtisanProfile',
  'CraftSkill',
  'CommercialRfq',
  'CapacityDeclaration',
  'CommercialOrder',
  'CommercialOffer',
  'CommercialBatch',
  'ArtisanPayable',
  'SimulatedSettlement',
];
for (const t of tables) {
  const r = await env.client.query(
    `select column_name, data_type, udt_name, column_default
     from information_schema.columns
     where table_schema='public' and table_name=$1 and is_nullable='NO' and column_default is null
     order by ordinal_position`,
    [t],
  );
  console.log(`\n${t}: ${r.rows.map((x) => `${x.column_name}(${x.udt_name})`).join(', ')}`);
}
await env.close();
