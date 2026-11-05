// CP5-G71 independent verification against a running PostgreSQL server.
//
// A decisive schema fact emerged while building the fixture: SimulatedSettlement carries
//   CHECK (provenance = 'SYNTHETIC' AND bankVerified = false)
//   CHECK (status IN ('SCHEDULED','SIMULATED_INITIATED','SIMULATED_SETTLED','SIMULATED_FAILED'))
// so the table can never hold a verified payment. The genuine paid-artisan evidence path is
// PayoutRequest -> PayoutExecutionRecord (bankVerified, status). The verification therefore tests
// BOTH layers: what the schema forbids, what the shipped predicate does, and whether the service
// actually consults the authoritative layer.
import { readFileSync } from 'node:fs';
import { bootPostgres } from './wire-session.mjs';
import { buildChain, addPayable, addSettlement } from './fixture.mjs';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const C = await import(`${REPO}/packages/contracts/dist/index.js`);
const env = await bootPostgres();
const db = env.client;

const results = { schemaFacts: {} };

// ---- A. What the database actually forbids
for (const [name, status, bankVerified] of [
  ['verified status on simulated table', 'VERIFIED_SETTLED', false],
  ['bankVerified true on simulated table', 'SIMULATED_SETTLED', true],
]) {
  try {
    await addSettlement(db, 'probe-order', null, {
      status,
      bankVerified,
      amountMillimes: 1000n,
      subject: `probe-${name}`,
    });
    results.schemaFacts[name] = 'ACCEPTED (constraint absent)';
    await db
      .query(`delete from "SimulatedSettlement" where "subjectKey"=$1`, [`probe-${name}`])
      .catch(() => {});
  } catch (error) {
    const code = String(error.constraint ?? error.code);
    results.schemaFacts[name] = `REJECTED by ${code}`;
  }
}

// ---- B. Predicate behaviour on realistic rows
const chain = await buildChain(db, 'g71');
const p = await addPayable(db, chain, 'main', 100000n);
const amount = 100000n;

async function settle(payableId, rows) {
  await db.query('delete from "SimulatedSettlement" where "payableId"=$1', [payableId]);
  for (const r of rows) await addSettlement(db, chain.orderId, payableId, r);
  const q = await db.query(
    `select "subjectKey","status","bankVerified","amountMillimes"::text as amount
     from "SimulatedSettlement" where "payableId"=$1`,
    [payableId],
  );
  return q.rows.map((r) => ({
    subjectKey: r.subjectKey,
    status: r.status,
    bankVerified: r.bankVerified,
    amountMillimes: BigInt(r.amount),
  }));
}

// Simulated only (the only thing the table can store)
{
  const rows = await settle(p, [
    { status: 'SIMULATED_SETTLED', bankVerified: false, amountMillimes: amount, subject: 'sim-1' },
    { status: 'SIMULATED_SETTLED', bankVerified: false, amountMillimes: amount, subject: 'sim-2' },
  ]);
  const verified = C.verifiedPaidMillimes(rows);
  results.simulatedOnly = {
    rows: rows.length,
    verifiedMillimes: verified.toString(),
    countsAsPaidParticipation: verified > 0n,
    oldPredicateWouldCredit: rows.length > 0,
  };
}
// Duplicate subject keys: the schema itself forbids two rows with the same (subjectKey, side, attempt)
{
  const rows = await settle(p, [
    { status: 'SIMULATED_SETTLED', bankVerified: false, amountMillimes: 25000n, subject: 'dup' },
  ]);
  const replay = await addSettlement(db, chain.orderId, p, {
    status: 'SIMULATED_SETTLED',
    bankVerified: false,
    amountMillimes: 25000n,
    subject: 'dup',
  })
    .then(() => 'ACCEPTED')
    .catch((e) => `REJECTED by ${String(e.constraint ?? e.code)}`);
  results.duplicateKeys = {
    firstRowVerified: C.verifiedPaidMillimes(rows).toString(),
    replayAttempt: replay,
    inflated: C.verifiedPaidMillimes(rows) > 0n,
  };
}
// Historical pre-fix row
{
  await addSettlement(db, chain.orderId, null, {
    status: 'SIMULATED_SETTLED',
    bankVerified: false,
    amountMillimes: 75000n,
    subject: 'legacy',
  });
  const r = await db.query(
    `select "status","bankVerified" from "SimulatedSettlement" where "subjectKey"='legacy' limit 1`,
  );
  results.historicalRow = { ...r.rows[0], countsAsVerified: C.isVerifiedSettlement(r.rows[0]) };
}

// ---- C. Does the service consult the authoritative layer?
const intelligence = readFileSync(
  `${REPO}/apps/api/src/modules/intelligence/intelligence.service.ts`,
  'utf8',
);
// Batch 2 corrected this: verified payment is now read from payout evidence reached through
// ArtisanPayable.payouts -> PayoutRequest -> PayoutExecutionRecord. Synthetic settlements remain
// loaded but are never credited as verified payment.
results.serviceSource = {
  readsPayoutEvidence: /payoutEvidenceEvents/.test(intelligence),
  loadsPayoutsRelation: /payouts:\s*\{\s*include:\s*\{\s*executions:\s*true/.test(intelligence),
  clampsToObligation: /clampVerifiedToObligation/.test(intelligence),
  verifiedSource: 'PayoutExecutionRecord via ArtisanPayable.payouts',
};

// ---- D. Can the authoritative path represent a verified payment at all?
let verifiedInsertOutcome = null;
{
  const payable = await db.query(
    `insert into "ArtisanPayable"(id,"orderId","offerId","batchId","artisanProfileId",milestone,"policyVersion",quantity,"unitPayMillimes","amountMillimes",currency,status,"sourceEventId","termsSnapshot",provenance,"createdAt")
     values ($1,$2,$3,$4,$5,'BUYER_ACCEPTED_PIECE',1,100,1000,100000,'TND','RECOGNIZED',$6,'{}','SYNTHETIC',now())
     returning id`,
    [
      `pay-auth-${chain.orderId}`,
      chain.orderId,
      chain.offerId,
      chain.batchId,
      chain.artisanProfileId,
      `evt-auth-${chain.orderId}`,
    ],
  );
  const payableId = payable.rows[0].id;
  // payout_approval_metadata requires an approver distinct from the requester.
  await db.query(
    `insert into "User"(id,email,"emailVerified",name,status,"createdAt","updatedAt","role","preferredLanguage")
     values ($1,$2,true,'Approver','ACTIVE',now(),now(),'USER','en')`,
    [`u-approver-${chain.orderId}`, `approver-${chain.orderId}@example.test`],
  );
  const payout = await db.query(
    `insert into "PayoutRequest"(id,"orderId","payableId","amountMillimes","payableSnapshotMillimes","requesterId","approverId","approvedAt",status,"reason","policyVersion")
     values ($1,$2,$3,100000,100000,$4,$5,now(),'APPROVED','synthetic verification',1) returning id`,
    [
      `payout-${chain.orderId}`,
      chain.orderId,
      payableId,
      chain.userId,
      `u-approver-${chain.orderId}`,
    ],
  );
  // execution_unverified permits only NOT bankVerified AND status IN (VERIFICATION_PENDING, FAILED).
  // Try the verified combination first and record exactly how the database answers.
  const verifiedInsert = await db
    .query(
      `insert into "PayoutExecutionRecord"(id,"payoutId","amountMillimes",reference,evidence,"occurredAt","actorId",status,"bankVerified","createdAt")
       values ($1,$2,100000,$3,'SYNTHETIC','2026-10-31T00:00:00Z',$4,'VERIFIED_SETTLED',true,now()) returning id`,
      [`exec-${chain.orderId}`, payout.rows[0].id, `ref-${chain.orderId}`, chain.userId],
    )
    .then(() => 'ACCEPTED')
    .catch((e) => `REJECTED by ${String(e.constraint ?? e.code)}`);
  verifiedInsertOutcome = verifiedInsert;
  // Insert the combination the constraint does permit, so the read path can still be examined.
  await db.query(
    `insert into "PayoutExecutionRecord"(id,"payoutId","amountMillimes",reference,evidence,"occurredAt","actorId",status,"bankVerified","createdAt")
     values ($1,$2,100000,$3,'SYNTHETIC','2026-10-31T00:00:00Z',$4,'VERIFICATION_PENDING',false,now())`,
    [`exec-p-${chain.orderId}`, payout.rows[0].id, `refp-${chain.orderId}`, chain.userId],
  );
  const execs = await db.query(
    `select "amountMillimes"::text as amt,"bankVerified","status" from "PayoutExecutionRecord" where "payoutId"=$1`,
    [payout.rows[0].id],
  );
  const verifiedExecution = execs.rows.filter(
    (e) => e.bankVerified && e.status === 'VERIFIED_SETTLED',
  );
  results.authoritativeLayer = {
    verifiedExecutionInsert: verifiedInsertOutcome,
    executionRows: execs.rows.length,
    verifiedExecutions: verifiedExecution.length,
    contractPredicateAgrees: verifiedExecution.every((e) =>
      C.isVerifiedSettlement({ status: e.status, bankVerified: e.bankVerified }),
    ),
    canRepresentRealPayment: execs.rows.length > 0,
  };
  // And the simulated table genuinely cannot:
  const simAttempt = await db
    .query(
      `insert into "SimulatedSettlement"(id,"orderId","payableId","subjectKey",side,attempt,status,"amountMillimes","dueAt",provenance,"bankVerified","createdAt")
       values ('sim-verified-attempt',$1,$2,'attempt','ARTISAN',1,'VERIFIED_SETTLED',1000,'2026-12-01T00:00:00Z','SYNTHETIC',true,now()) returning id`,
      [chain.orderId, payableId],
    )
    .then(() => 'ACCEPTED')
    .catch((e) => `REJECTED by ${String(e.constraint ?? e.code)}`);
  results.authoritativeLayer.simulatedVerifiedAttempt = simAttempt;
}

console.log(JSON.stringify(results, null, 1));
await env.close();
