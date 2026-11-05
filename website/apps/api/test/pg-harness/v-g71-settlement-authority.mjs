// CP5-G71 independent verification: what evidence does the shipped fix actually consult?
//
// Two questions must be answered separately.
//  1. Does a synthetic settlement still produce "paid participation"?  (the reported defect)
//  2. Is the verification predicate attached to a table that can ever hold verified evidence?
//
// The schema answer to (2) is decisive: SimulatedSettlement carries
//   CHECK (provenance='SYNTHETIC' AND bankVerified=false)
//   CHECK (status IN ('SCHEDULED','SIMULATED_INITIATED','SIMULATED_SETTLED','SIMULATED_FAILED'))
// so isVerifiedSettlement() can never be true for any row the database will accept.
import { readFileSync } from 'node:fs';
import { bootPostgres } from './wire-session.mjs';
import { buildChain, addPayable } from './fixture.mjs';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const C = await import(`${REPO}/packages/contracts/dist/index.js`);
const env = await bootPostgres();
const db = env.client;
const out = {};

// ---------- A. Integer/decimal exactness in TND millimes ----------
// Partial verified payments against a 1 000 000 millime obligation, summed per subjectKey.
const partial = [
  {
    subjectKey: 'pay-A',
    reference: 'bank-a1',
    status: 'VERIFIED_SETTLED',
    bankVerified: true,
    amountMillimes: 333_333n,
  },
  {
    subjectKey: 'pay-A',
    reference: 'bank-a2',
    status: 'VERIFIED_SETTLED',
    bankVerified: true,
    amountMillimes: 333_334n,
  },
  {
    subjectKey: 'pay-B',
    reference: 'bank-b1',
    status: 'VERIFIED_SETTLED',
    bankVerified: true,
    amountMillimes: 1n,
  },
];
out.partialSum = {
  // Batch 2: identity is the payment reference, so distinct partials on one payable both count.
  comment: 'Deduplicated by payment reference. Distinct partials on pay-A are summed.',
  identityDedup: C.verifiedPaidMillimes(partial).toString(),
  earned: '1000000',
  payableAfter: (1_000_000n - C.verifiedPaidMillimes(partial)).toString(),
  exactTnd: C.formatTnd(C.verifiedPaidMillimes(partial)),
};

// ---------- B. Simulation never reduces the payable ----------
const simulated = Array.from({ length: 5 }, (_, i) => ({
  subjectKey: `sim-${i}`,
  status: 'SIMULATED_SETTLED',
  bankVerified: false,
  amountMillimes: 200_000n,
}));
out.simulation = {
  rows: simulated.length,
  verifiedPaid: C.verifiedPaidMillimes(simulated).toString(),
  simulatedPaid: C.simulatedPaidMillimes(simulated).toString(),
  payableIfEarned1M: (1_000_000n - C.verifiedPaidMillimes(simulated)).toString(),
  oldComputeWouldHaveBeen: (1_000_000n - C.simulatedPaidMillimes(simulated)).toString(),
};

// ---------- C. The service reads which table? ----------
const svc = readFileSync(
  `${REPO}/apps/api/src/modules/intelligence/intelligence.service.ts`,
  'utf8',
);
out.serviceReads = {
  // Batch 2: verified payment is read from payout evidence, never from synthetic settlements.
  readsPayoutEvidence: /payoutEvidenceEvents/.test(svc),
  payablesIncludePayouts: /payouts:\s*\{\s*include:\s*\{\s*executions:\s*true/.test(svc),
  settlementsRelationTarget: 'ArtisanPayable.settlements -> SimulatedSettlement[] (synthetic only)',
  verifiedSource: 'PayoutRequest -> PayoutExecutionRecord, reached through ArtisanPayable.payouts',
};

// ---------- D. Can the database hold a VERIFIED_SETTLED row at all? ----------
const chain = await buildChain(db, 'g71v');
const payableId = await addPayable(db, chain, 'g71v', 100_000n);
const attempts = [];
for (const [label, status, bankVerified, provenance] of [
  ['verified status, synthetic provenance', 'VERIFIED_SETTLED', true, 'SYNTHETIC'],
  ['simulated status, bankVerified true', 'SIMULATED_SETTLED', true, 'SYNTHETIC'],
  ['verified status, bankVerified false', 'VERIFIED_SETTLED', false, 'SYNTHETIC'],
]) {
  const result = await db
    .query(
      `insert into "SimulatedSettlement"(id,"orderId","payableId","subjectKey",side,attempt,status,"amountMillimes","dueAt",provenance,"bankVerified","createdAt")
       values ($1,$2,$3,$4,'ARTISAN',1,$5,1000,'2026-12-01T00:00:00Z',$6,$7,now()) returning id`,
      [
        `g71-${attempts.length}-${chain.orderId}`,
        chain.orderId,
        payableId,
        `k-${attempts.length}`,
        status,
        provenance,
        bankVerified,
      ],
    )
    .then(() => 'ACCEPTED')
    .catch((e) => `REJECTED:${e.constraint ?? e.code}`);
  attempts.push({ label, result });
}
out.databaseCanStoreVerifiedSettlement = attempts;

// ---------- E. The authoritative layer, and whether it accepts a verified row ----------
const execution = await db
  .query(
    `select constraint_name, check_clause from information_schema.check_constraints
     where constraint_name in ('execution_unverified','payout_status')`,
  )
  .then((r) => r.rows)
  .catch(() => []);
out.executionConstraints = execution;

// ---------- F. Live service behaviour against the real table ----------
// Drive the real predicate over rows the real database accepted.
const rowsRes = await db.query(
  `select ss."subjectKey", ss."status", ss."bankVerified", ss."amountMillimes"::text amt
   from "SimulatedSettlement" ss where ss."payableId"=$1`,
  [payableId],
);
const liveRows = rowsRes.rows.map((r) => ({
  subjectKey: r.subjectKey,
  status: r.status,
  bankVerified: r.bankVerified,
  amountMillimes: BigInt(r.amt),
}));
out.liveTableRows = {
  count: liveRows.length,
  statusesPresent: [...new Set(liveRows.map((r) => r.status))],
  verifiedPaidOfAcceptedRows: C.verifiedPaidMillimes(liveRows).toString(),
  note: attempts.every((a) => a.result !== 'ACCEPTED')
    ? 'No verified row can be inserted, so this figure is structurally always zero.'
    : 'A verified row was accepted; see attempts.',
};

console.log(JSON.stringify(out, null, 1));
await env.close();
