// CP5-G95 independent verification of the *evidence authority* question.
//
// The reported defect (PROPOSAL had no CONTRACTED edge) is a reachability bug. This probe asks the
// integrity question the batch's own report flagged: can CONTRACTED be produced without independent
// contractual evidence?
//
// Three separate facts are established:
//  A. What shape a prospect snapshot can take, given the write schemas.
//  B. Whether a caller-supplied reference can be persisted through any accepted request.
//  C. What the transition guard does when the snapshot does (and does not) carry a reference.
import { readFileSync } from 'node:fs';
import { bootPostgres } from './wire-session.mjs';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const env = await bootPostgres();
const db = env.client;
const out = {};

const contracts = readFileSync(`${REPO}/packages/contracts/src/batch12.ts`, 'utf8');
const node = (name) => {
  const start = contracts.indexOf(`export const ${name}`);
  if (start < 0) return '';
  const next = contracts.indexOf('\nexport const ', start + 10);
  return contracts.slice(start, next < 0 ? undefined : next);
};
const updateSchema = node('prospectUpdateSchema');
const createSchema = node('prospectCreateSchema');
const detailsSchema = node('prospectDetailsSchema');

out.schemas = {
  updateSchemaStrict: /\.strict\(\)/.test(updateSchema),
  createSchemaStrict: /\.strict\(\)/.test(createSchema),
  // createSchema is .extend(...).refine(...) so strict() is inherited from detailsSchema.
  detailsSchemaStrict: /\.strict\(\)/.test(detailsSchema),
  signedReferenceAcceptedByAnyProspectSchema:
    /signedContractReference/.test(updateSchema) ||
    /signedContractReference/.test(createSchema) ||
    /signedContractReference/.test(detailsSchema),
};

// The service reads it from the stored snapshot. Find every write site and whether the value can
// originate in a create/update body.
const sales = readFileSync(`${REPO}/apps/api/src/modules/sales/sales.service.ts`, 'utf8');
const referenceReads = [...sales.matchAll(/signedContractReference/g)].length;
out.service = {
  referenceReads,
  onlyReadSite: /snapshot\?\.signedContractReference/.test(sales),
  writesReferenceItself: /signedContractReference\s*[:=]/.test(sales),
};

// A. What does a real prospect snapshot look like once written by the accepted schema?
const chain = await (async () => {
  const { buildChain } = await import('./fixture.mjs');
  return buildChain(db, 'g95v');
})();
const buyerOrg = (
  await db.query(`select "buyerOrganizationId" b from "CommercialRfq" where id=$1`, [
    chain.rfqId ?? '',
  ])
).rows[0]?.b;
const orgs = await db.query(
  `select id, type from "Organization" where slug like $1 order by type`,
  [`%${chain.orderId.slice(-4)}%`],
);
const buyerOrgId = buyerOrg ?? orgs.rows.find((r) => r.type === 'BUYER_BUSINESS')?.id;
const operatorOrg = orgs.rows.find((r) => r.type === 'INTERNAL')?.id;

const prospectId = `pros-${Date.now()}`;
const detailsBody = {
  segment: 'textile',
  needs: 'synthetic needs',
  qualificationNotes: 'synthetic qualification',
  status: 'PROPOSAL',
  ownerId: chain.userId,
  nextAction: 'synthetic next action',
  followUpAt: null,
  contactBasis: 'CONSENT',
  basisEvidence: 'synthetic basis evidence',
  contactReviewAt: '2026-10-31T00:00:00Z',
  reason: 'synthetic reason',
};
// Snapshot as the service would have written it: the validated body only.
await db.query(
  `insert into "CommercialProspect"(id,"operatorOrganizationId","buyerOrganizationId",snapshot,version,"createdAt")
   values ($1,$2,$3,$4::jsonb,1,now())`,
  [prospectId, operatorOrg, buyerOrgId, JSON.stringify(detailsBody)],
);
const stored = await db.query(`select snapshot from "CommercialProspect" where id=$1`, [
  prospectId,
]);
out.snapshotShape = {
  keysFromValidatedBody: Object.keys(stored.rows[0].snapshot),
  carriesSignedContractReference: 'signedContractReference' in stored.rows[0].snapshot,
};

// C. Guard behaviour: no reference present, and no accepted RFQ for this buyer.
const acceptedForBuyer = await db.query(
  `select count(*)::int c from "CommercialRfq" where "buyerOrganizationId"=$1 and status='ACCEPTED'`,
  [buyerOrgId],
);
out.acceptedRfqForBuyer = acceptedForBuyer.rows[0].c;

// Now simulate a snapshot that DOES carry a reference (only reachable by direct DB write or a
// future schema change) and evaluate the guard's own rule against it.
const guardRule = (snapshot) => {
  const ref = snapshot?.signedContractReference;
  return typeof ref === 'string' && ref.trim().length >= 6;
};
out.guardRule = {
  absent: guardRule({}),
  arbitrarySixChars: guardRule({ signedContractReference: 'ABCDEF' }),
  nonexistentContract: guardRule({ signedContractReference: 'CONTRACT-THAT-DOES-NOT-EXIST' }),
  secondOrgContract: guardRule({ signedContractReference: 'OTHER-ORGS-CONTRACT-REF' }),
  note: 'The guard cannot distinguish any of these strings from a real signed contract.',
};

// D. Is a contract record persisted anywhere the guard could cross-check?
const contractTables = await db.query(
  `select table_name from information_schema.tables
   where table_schema='public' and (table_name ilike '%contract%' or table_name ilike '%signature%')`,
);
out.contractStorage = {
  tables: contractTables.rows.map((r) => r.table_name),
  commerciallyContractColumn: await db
    .query(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='CommercialProspect' and column_name ilike '%contract%'`,
    )
    .then((r) => r.rows.map((x) => x.column_name)),
};

// E. #205 WON evidence chain untouched?
out.issue205Preserved = {
  pilotProposalSchemaPresent: /pilotProposalSchema/.test(contracts),
  wonStatusStillEnumerated: /'WON'/.test(node('pilotProposalSchema')),
};

console.log(JSON.stringify(out, null, 1));
await env.close();
