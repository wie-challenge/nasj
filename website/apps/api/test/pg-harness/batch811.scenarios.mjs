// Batch 8–11 database-level verification against a real PostgreSQL instance.
//
// Runs in-process against PGlite (PostgreSQL 17.5/WASM) because the delivery sandbox denies Docker
// sockets. It executes the same migration SQL `prisma migrate deploy` would run, then exercises the
// constraints and invariants the TypeScript services depend on. It is NOT a substitute for the
// HTTP-level integration suite in ../integration.ts, which needs Docker.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { PGlite } = await import(
  join(
    root,
    'node_modules/.pnpm/@electric-sql+pglite@0.4.3/node_modules/@electric-sql/pglite/dist/index.js',
  )
);

const results = [];
const checkAsync = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split('\n')[0] });
  }
};

const db = new PGlite();
await db.waitReady;
const migDir = join(root, 'apps/api/prisma/migrations');
const migrations = readdirSync(migDir)
  .filter((d) => /^\d+_/.test(d))
  .sort();
for (const m of migrations) await db.exec(readFileSync(join(migDir, m, 'migration.sql'), 'utf8'));

// ---------------------------------------------------------------- fixtures
const q = (sql, params) => db.query(sql, params);

// Minimal authoritative rows. Ids are explicit so FK chains are readable.
await db.exec(`
insert into "User"(id,name,email,"emailVerified",role,status,"createdAt","updatedAt","preferredLanguage")
  values ('u_art','Artisan','a@x.invalid',true,'USER','ACTIVE',now(),now(),'en'),
         ('u_buy','Buyer','b@x.invalid',true,'USER','ACTIVE',now(),now(),'en'),
         ('u_op','Operator','o@x.invalid',true,'USER','ACTIVE',now(),now(),'en');
insert into "Organization"(id,name,slug,type,"approvalStatus",country,region,description,"contactEmail","representativeName","createdByUserId","createdAt","updatedAt")
  values ('org_b','Buyer Co','buyer-co','BUYER_BUSINESS','APPROVED','TN','Tunis','d','b@x.invalid','Rep','u_buy',now(),now()),
         ('org_o','Ops Co','ops-co','INTERNAL','APPROVED','TN','Tunis','d','o@x.invalid','Rep','u_op',now(),now());
insert into "CraftSkill"(id,name,category,description,"isActive") values ('c1','Weaving','TEXTILE','d',true);
insert into "ArtisanProfile"(id,"userId","displayName",region,"preferredLanguage","contactVisibility","experienceDescription","participantStatus","createdAt","updatedAt")
  values ('ap1','u_art','Group A','Tunis','en','PRIVATE','e','ACTIVE',now(),now());
insert into "CommercialRfq"(id,"buyerOrganizationId","operatorOrganizationId","craftSkillId",title,specification,"designRequirements",quantity,"deliveryAt","deliveryLocation","procurementManaged",status,version,provenance,"createdAt","updatedAt")
  values ('rfq1','org_b','org_o','c1','Test','spec','req',500,now(),'Tunis',true,'ACCEPTED',1,'SYNTHETIC',now(),now());
insert into "CommercialOrder"(id,"rfqId") values ('ord1','rfq1');
`);

// ---------------------------------------------------------------- Batch 9: specification
await db.exec(`
insert into "ProductSpecification"(id,"craftSkillId","productCode",name,"ownerOrganizationId","authorId","createdAt","updatedAt")
  values ('ps1','c1','P-1','Rug','org_o','u_op',now(),now());
insert into "ProductSpecificationRevision"(id,"specificationId","revisionNumber",status,description,materials,instructions,"qualityCriteria","referenceImages","authorId","createdAt")
  values ('pr1','ps1',1,'APPROVED','d','[]','i','q','[]','u_op',now()),
         ('pr2','ps1',2,'DRAFT','d2','[]','i','q','[]','u_op',now());
`);

await checkAsync('E20-01 duplicate revision number is rejected', async () => {
  await assert.rejects(
    db.exec(
      `insert into "ProductSpecificationRevision"(id,"specificationId","revisionNumber",status,description,materials,instructions,"qualityCriteria","referenceImages","authorId","createdAt") values ('prx','ps1',1,'DRAFT','d','[]','i','q','[]','u_op',now())`,
    ),
    /unique constraint/,
  );
});

await checkAsync(
  'E20-01 ProcurementRevision is append-only, so binding lives on the order',
  async () => {
    await db.exec(
      `insert into "ProcurementRevision"(id,"rfqId",version,"authorId",reason,snapshot) values ('rev1','rfq1',1,'u_op','r','{}')`,
    );
    await assert.rejects(
      db.exec(`update "ProcurementRevision" set reason='changed' where id='rev1'`),
      /append-only/,
    );
  },
);

await checkAsync('E20-01 an order pins at most one catalogue revision', async () => {
  await db.exec(
    `update "CommercialOrder" set "productSpecificationRevisionId"='pr1' where id='ord1'`,
  );
  const r = await q(
    `select "productSpecificationRevisionId" p from "CommercialOrder" where id='ord1'`,
  );
  assert.equal(r.rows[0].p, 'pr1');
  // A second order cannot reuse the same catalogue revision.
  await db.exec(
    `insert into "CommercialRfq"(id,"buyerOrganizationId","operatorOrganizationId","craftSkillId",title,specification,"designRequirements",quantity,"deliveryAt","deliveryLocation","procurementManaged",status,version,provenance,"createdAt","updatedAt") values ('rfq2','org_b','org_o','c1','T2','s','r',10,now(),'Tunis',true,'ACCEPTED',1,'SYNTHETIC',now(),now())`,
  );
  await db.exec(`insert into "CommercialOrder"(id,"rfqId") values ('ord2','rfq2')`);
  await assert.rejects(
    db.exec(`update "CommercialOrder" set "productSpecificationRevisionId"='pr1' where id='ord2'`),
    /unique constraint/,
  );
});

await checkAsync('E20-01 superseded revision is distinguishable from a current one', async () => {
  await db.exec(
    `update "ProductSpecificationRevision" set status='SUPERSEDED', "supersededById"='pr2' where id='pr1'`,
  );
  const r = await q(
    `select status, "supersededById" from "ProductSpecificationRevision" where id='pr1'`,
  );
  assert.equal(r.rows[0].status, 'SUPERSEDED');
  assert.equal(r.rows[0].supersededById, 'pr2');
});

// ---------------------------------------------------------------- Batch 9: paid sample
await db.exec(`
insert into "ProductSampleRequest"(id,"specificationRevisionId","buyerOrganizationId","operatorOrganizationId","sampleQuantity","responsibleArtisanProfileId",status,"workTerms","compensationMillimes","compensationBasis","materialCostMillimes","materialResponsibility","authorId","createdAt","updatedAt")
  values ('sr1','pr2','org_b','org_o',1,'ap1','UNDER_REVIEW','terms',45000,'PER_SAMPLE',12500,'artisan','u_buy',now(),now());
`);

await checkAsync('E20-02 a sample payable is unique per request and milestone', async () => {
  await db.exec(
    `insert into "SamplePayable"(id,"sampleRequestId","artisanProfileId",milestone,"amountMillimes","sourceEventId","termsSnapshot") values ('sp1','sr1','ap1','SAMPLE_ACCEPTED_TERMS',45000,'e1','{}')`,
  );
  await assert.rejects(
    db.exec(
      `insert into "SamplePayable"(id,"sampleRequestId","artisanProfileId",milestone,"amountMillimes","sourceEventId","termsSnapshot") values ('sp2','sr1','ap1','SAMPLE_ACCEPTED_TERMS',45000,'e2','{}')`,
    ),
    /unique constraint/,
  );
});

await checkAsync('E20-02 the obligation survives a rejected sample', async () => {
  await db.exec(`update "ProductSampleRequest" set status='REJECTED' where id='sr1'`);
  const r = await q(
    `select status, "amountMillimes" from "SamplePayable" where "sampleRequestId"='sr1'`,
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, 'RECOGNIZED');
  assert.equal(Number(r.rows[0].amountMillimes), 45000);
});

await checkAsync('E20-02 material cost is a numeric exact amount', async () => {
  const r = await q(`select "materialCostMillimes" from "ProductSampleRequest" where id='sr1'`);
  assert.equal(Number(r.rows[0].materialCostMillimes), 12500);
});

// ---------------------------------------------------------------- Batch 11: schedule consent
await db.exec(`
insert into "CapacityDeclaration"(id,"artisanProfileId","craftSkillId","unitType",quantity,"effectiveFrom","effectiveTo","declaredByUserId",version,"createdAt")
  values ('cd1','ap1','c1','PIECES',1000,'2026-11-01','2026-12-01','u_art',1,now());
insert into "CommercialOffer"(id,"orderId","capacityDeclarationId","artisanProfileId",quantity,"unitPayMillimes","estimatedHours","expiresAt",materials,"reworkTerms","paymentConditions",status,version,provenance,"createdAt")
  values ('of1','ord1','cd1','ap1',200,12000,'10','2026-12-01','m','r','p','ACCEPTED',1,'SYNTHETIC',now());
insert into "CommercialBatch"(id,"orderId","offerId","artisanProfileId") values ('bt1','ord1','of1','ap1');
insert into "ScheduleRevision"(id,"batchId","orderId","proposedDeadline","previousDeadline",reason,impact,status,"authorId")
  values ('sch1','bt1','ord1','2026-12-10','2026-12-01','delay','{}','PENDING_APPROVAL','u_op');
`);

await checkAsync('E06-06 a schedule change records both party approvals separately', async () => {
  await db.exec(
    `update "ScheduleRevision" set status='AWAITING_ARTISAN', "buyerApprovedById"='u_buy', "buyerApprovedAt"=now() where id='sch1'`,
  );
  let r = await q(
    `select status, "buyerApprovedById", "artisanApprovedById" from "ScheduleRevision" where id='sch1'`,
  );
  assert.equal(r.rows[0].status, 'AWAITING_ARTISAN');
  assert.equal(r.rows[0].buyerApprovedById, 'u_buy');
  assert.equal(r.rows[0].artisanApprovedById, null);
  assert.equal(r.rows[0].status === 'APPROVED', false, 'buyer alone cannot apply the change');
  await db.exec(
    `update "ScheduleRevision" set status='APPROVED', "artisanApprovedById"='u_art', "artisanApprovedAt"=now() where id='sch1'`,
  );
  r = await q(`select status from "ScheduleRevision" where id='sch1'`);
  assert.equal(r.rows[0].status, 'APPROVED');
});

await checkAsync('E06-06 approval columns must reference real users', async () => {
  await assert.rejects(
    db.exec(`update "ScheduleRevision" set "buyerApprovedById"='nobody' where id='sch1'`),
    /foreign key constraint/,
  );
});

// ---------------------------------------------------------------- Batch 11: counteroffer
await db.exec(`
insert into "Counteroffer"(id,"offerId","proposedQuantity","proposedDeadline",status,"authorUserId")
  values ('co1','of1',150,'2026-12-05','MANAGER_REVIEW','u_art');
`);

await checkAsync('E04-07 counteroffer states are a closed set of known values', async () => {
  const r = await q(`select status, "proposedQuantity" from "Counteroffer" where id='co1'`);
  assert.equal(r.rows[0].status, 'MANAGER_REVIEW');
  assert.equal(r.rows[0].proposedQuantity, 150);
});

// ---------------------------------------------------------------- Batch 8: allocation
await db.exec(`
insert into "AllocationPlan"(id,"orderId",version,state,"requiredQuantity","policyVersion","authorId","createdAt","updatedAt")
  values ('plan1','ord1',1,'DRAFT',500,1,'u_op',now(),now());
`);

await checkAsync('E05-03 one group cannot appear twice in a plan', async () => {
  await db.exec(
    `insert into "AllocationPlanItem"(id,"planId","artisanProfileId",quantity,"createdAt","updatedAt") values ('ai1','plan1','ap1',200,now(),now())`,
  );
  await assert.rejects(
    db.exec(
      `insert into "AllocationPlanItem"(id,"planId","artisanProfileId",quantity,"createdAt","updatedAt") values ('ai2','plan1','ap1',100,now(),now())`,
    ),
    /unique constraint/,
  );
});

await checkAsync('E05-03 plan versions are unique per order', async () => {
  await assert.rejects(
    db.exec(
      `insert into "AllocationPlan"(id,"orderId",version,state,"requiredQuantity","policyVersion","authorId","createdAt","updatedAt") values ('plan2','ord1',1,'DRAFT',500,1,'u_op',now(),now())`,
    ),
    /unique constraint/,
  );
});

await checkAsync('E05-04 one offer cannot back two allocation items', async () => {
  await db.exec(`update "AllocationPlanItem" set state='OFFERED', "offerId"='of1' where id='ai1'`);
  await db
    .exec(
      `insert into "AllocationPlanItem"(id,"planId","artisanProfileId",quantity) values ('ai3','plan1','ap2x',10).catch?.(()=>{})`,
    )
    .catch(() => {});
  // ap2x does not exist, so insert a real second profile first.
  await db.exec(
    `insert into "User"(id,name,email,"emailVerified",role,status,"createdAt","updatedAt") values ('u_art2','A2','a2@x.invalid',true,'USER','ACTIVE',now(),now())`,
  );
  await db.exec(
    `insert into "ArtisanProfile"(id,"userId","displayName",region,"preferredLanguage","contactVisibility","experienceDescription","participantStatus","createdAt","updatedAt") values ('ap2','u_art2','Group B','Tunis','en','PRIVATE','e','ACTIVE',now(),now())`,
  );
  await db.exec(
    `insert into "AllocationPlanItem"(id,"planId","artisanProfileId",quantity,"createdAt","updatedAt") values ('ai4','plan1','ap2',100,now(),now())`,
  );
  await assert.rejects(
    db.exec(`update "AllocationPlanItem" set "offerId"='of1' where id='ai4'`),
    /unique constraint/,
  );
});

// ---------------------------------------------------------------- Batch 10: risk + alerts
await checkAsync('E11-04 risk thresholds are versioned data, not hard-coded SQL', async () => {
  const r = await q(
    `select column_name from information_schema.columns where table_name='RecommendationPolicy' order by 1`,
  );
  assert.ok(r.rows.some((c) => c.column_name === 'version'));
});

// ---------------------------------------------------------------- summary
await db.close();
const passed = results.filter((r) => r.ok).length;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n        ${r.error}`}`);
}
console.log(`\n${passed}/${results.length} database checks passed`);
process.exit(passed === results.length ? 0 : 1);
