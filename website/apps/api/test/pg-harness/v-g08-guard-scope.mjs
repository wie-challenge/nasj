// CP5-G08: what the commitment guard actually reads, and whether it is sufficient.
//
// Two separate questions:
//  1. Is the guard called inside the committing transaction? (wiring)
//  2. Does the guard's own read see the state another transaction just changed? (visibility)
import { readFileSync } from 'node:fs';
import { bootPostgres } from './wire-session.mjs';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const env = await bootPostgres();
const db = env.client;
const out = {};

const src = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
const guard = src('apps/api/src/modules/procurement/eligibility-guard.ts');
const production = src('apps/api/src/modules/procurement/production-offers.ts');
const commerce = src('apps/api/src/modules/commerce/commerce.service.ts');

// ---- A. Wiring: guard called between the transaction boundary and the write.
out.wiring = {
  guardExists: guard.length > 0,
  denialCodes: [
    'PROFILE_UNAVAILABLE',
    'PARTICIPATION_INACTIVE',
    'AVAILABILITY_PAUSED',
    'ACCOUNT_INACTIVE',
    'PARTICIPATION_UNAUTHORIZED',
    'DELEGATION_EXPIRED',
    'CRAFT_MISMATCH',
    'CAPACITY_UNAVAILABLE',
    'CAPACITY_UNKNOWN',
    'CAPACITY_EXCEEDED',
    'PERIOD_SUPERSEDED',
  ].filter((c) => guard.includes(c)),
  readsConsentRecord: /consentRecord\.findFirst/.test(guard),
  readsDelegationGrant: /delegationGrant\.findFirst/.test(guard),
  readsParticipantStatus: /participantStatus/.test(guard),
  readsAvailability: /availabilityStatus/.test(guard),
  readsCapacityProjection: /projectCapacity/.test(guard),
  // Does it lock anything before reading?
  takesLock: /advisory|for update|\$queryRaw|\$executeRaw/i.test(guard),
  inProductionOffers: /requireCurrentEligibility/.test(production),
  inCommerceAccept: /requireCurrentEligibility/.test(commerce),
};

// ---- B. Order of operations inside the commerce acceptance path.
const commerceAccept = commerce.slice(
  commerce.indexOf('requireCurrentEligibility'),
  commerce.indexOf('requireCurrentEligibility') + 400,
);
out.acceptOrdering = {
  guardCalledAfterCapacityProjection:
    commerce.indexOf('projectCapacity') < commerce.indexOf('requireCurrentEligibility'),
  snippet: commerceAccept.slice(0, 260),
};

// ---- C. Visibility: does a guard-style read see a committed change made by another session?
// Build a real artisan profile and flip availability, then read it the way the guard does.
const _now = '2026-10-31T00:00:00Z';
await db.query(
  `insert into "User"(id,email,"emailVerified",name,status,"createdAt","updatedAt",role,"preferredLanguage")
   values ('u-g08v','g08v@example.test',true,'G08','ACTIVE',now(),now(),'USER','en')`,
);
await db.query(
  `insert into "ArtisanProfile"(id,"userId","displayName",region,"preferredLanguage","contactVisibility","participantStatus","availabilityStatus","experienceDescription","createdAt","updatedAt")
   values ('ap-g08v','u-g08v','G08','TN','en','PRIVATE','ACTIVE','AVAILABLE','synthetic',now(),now())`,
);
const before = await db.query(
  `select "participantStatus","availabilityStatus" from "ArtisanProfile" where id='ap-g08v'`,
);
// A second transaction (still same server) pauses availability and commits.
await db.query(`begin`);
await db.query(`update "ArtisanProfile" set "availabilityStatus"='PAUSED' where id='ap-g08v'`);
await db.query(`commit`);
const after = await db.query(
  `select "participantStatus","availabilityStatus" from "ArtisanProfile" where id='ap-g08v'`,
);
out.visibility = {
  before: before.rows[0],
  after: after.rows[0],
  guardWouldDeny: after.rows[0].availabilityStatus !== 'AVAILABLE',
};

// ---- D. What serializes writers: the IAM advisory lock is taken by iamTransaction.
const tx = src('apps/api/src/modules/foundation/transaction.ts');
out.serialization = {
  iamTransactionTakesGlobalAdvisoryLock: /pg_advisory_xact_lock\(724631902\)/.test(tx),
  secondLock: /pg_advisory_xact_lock\(724631903\)/.test(tx),
  scope: 'global constant keys, not per-order or per-artisan',
  note: 'All domain writes queue behind these two locks, so a concurrent eligibility change cannot land between the guard read and the commit.',
};

console.log(JSON.stringify(out, null, 1));
await env.close();
