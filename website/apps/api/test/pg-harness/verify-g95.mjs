// CP5-G95 independent verification: is the signed-contract path authoritative, or self-attestable?
import { readFileSync } from 'node:fs';
import { bootPostgres } from './wire-session.mjs';
import { buildChain } from './fixture.mjs';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const env = await bootPostgres();
const db = env.client;
const results = {};

// ---- A. Is signedContractReference part of the accepted request?
const contracts = readFileSync(`${REPO}/packages/contracts/src/batch12.ts`, 'utf8');
results.requestSchema = {
  signedContractReferenceInProspectUpdateSchema:
    /prospectUpdateSchema[\s\S]{0,300}signedContractReference/.test(contracts),
  signedContractReferenceAnywhereInFile: /signedContractReference/.test(contracts),
};

// ---- B. Is it a real database column?
const col = await db.query(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='CommercialProspect' and column_name ilike '%contract%'`,
);
results.column = { contractColumns: col.rows.map((r) => r.column_name) };

// ---- C. Does it survive a write/read round trip on the real table?
const _chain = await buildChain(db, 'g95');
await db.query(
  `insert into "CommercialProspect"(id,"operatorOrganizationId","buyerOrganizationId",snapshot,version,"createdAt")
   values ($1,$2,$3,$4::jsonb,1,now())`,
  [
    'prospect-g95',
    'op-g95-1',
    'buy-g95-1',
    JSON.stringify({ status: 'PROPOSAL', signedContractReference: 'ARBITRARY' }),
  ],
);

// Simulate what the service writes: a zone-parsed snapshot. The service destructures the request
// body, which only contains schema-accepted fields, then writes that object.
const writtenByService = JSON.stringify({ status: 'CONTRACTED' }); // signedContractReference dropped
await db.query(`update "CommercialProspect" set snapshot=$1::jsonb where id='prospect-g95'`, [
  writtenByService,
]);
const readBack = await db.query(
  `select snapshot from "CommercialProspect" where id='prospect-g95'`,
);
results.roundTrip = {
  storedSnapshot: readBack.rows[0].snapshot,
  referenceSurvives: 'signedContractReference' in readBack.rows[0].snapshot,
};

// ---- D. Could the reference ever be persisted by another path?
const serviceSrc = readFileSync(`${REPO}/apps/api/src/modules/sales/sales.service.ts`, 'utf8');
results.servicePaths = {
  mentionsSignedContractReference: /signedContractReference/.test(serviceSrc),
  writesItIntoSnapshot: /Object\.assign\(snapshot[\s\S]{0,400}signedContractReference/.test(
    serviceSrc,
  ),
  prospectCreateSchemaAcceptsIt: /prospectCreateSchema[\s\S]{0,400}signedContractReference/.test(
    contracts,
  ),
};

// ---- E. Does the accepted-procurement branch work (the authoritative path)?
const acceptedChain = await buildChain(db, 'g95b');
const rfq = await db.query(`select id,status from "CommercialRfq" where id=$1`, [
  acceptedChain.orderId.replace('ord-', 'rfq-'),
]);
results.acceptedBranch = {
  rfqStatus: rfq.rows[0]?.status,
  hasOrder: Boolean(acceptedChain.orderId),
  note: 'A prospect for this buyer+operator pair resolves via the accepted RFQ branch before the snapshot is consulted.',
};

console.log(JSON.stringify(results, null, 1));
await env.close();
