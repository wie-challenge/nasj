import { bootPostgres } from './wire-session.mjs';
import { buildChain } from './fixture.mjs';
const env = await bootPostgres();
await buildChain(env.client, 'txv');
const outside = await env.client.query(`select count(*)::int c from "CommercialRfq"`);
const { PrismaClient } = await import(
  '/home/ashenix/Projects/wie-challenge/website/node_modules/.pnpm/@prisma+client@7.10.1_prisma@7.10.1_@types+node@24.19.2_@types+react-dom@19.3.0_@types+_9e72caf218d3f522373b8e6c9536cf3f/node_modules/@prisma/client/default.js'
);
const { PrismaPg } = await import(
  '/home/ashenix/Projects/wie-challenge/website/node_modules/.pnpm/@prisma+adapter-pg@7.10.1/node_modules/@prisma/adapter-pg/dist/index.mjs'
);
const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.connectionString }),
  log: [],
});
const viaPrismaOutside = await p.commercialRfq.count();
const inTx = await p.$transaction(async (tx) => tx.commercialRfq.count());
console.log(
  JSON.stringify({ outside, viaPrismaOutside, inTx, txSeesRows: inTx === viaPrismaOutside }),
);
await p.$disconnect();
await env.close();
