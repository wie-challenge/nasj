// CP5-G27 over real HTTP: does the buyer-facing download route leak internal costing?
//
// The service-level probe already proved the projection is correct. This one proves the *route*
// does not bypass it: authenticate a real buyer session against the booted NestJS app and fetch the
// document endpoint, then scan the serialized response for private sentinels.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { bootPostgres } from './wire-session.mjs';

const env = await bootPostgres();
process.env.DATABASE_URL = env.connectionString;
process.env.BETTER_AUTH_SECRET = randomUUID().repeat(2);

const { createApp } = await import('../../src/app.js');
const { testConfig } = await import('../support.js');

// testConfig needs an SMTP port; nothing in this probe sends mail, so point it at a closed port.
const config = testConfig(env.connectionString, 2525, { RATE_API_MAX: 10_000 });
const app = await createApp({ config });
await app.listen(0, '127.0.0.1');
const origin = (await app.getUrl()).replace('[::1]', '127.0.0.1');
const out = { origin };

const { PrismaService } = await import('../../src/database/prisma.service.js');
const prisma = app.get(PrismaService);
const now = new Date();
let n = 0;

const _makeUser = async (label, role = 'USER') =>
  prisma.user.create({
    data: {
      id: `u-${label}-${++n}`,
      email: `${label}-${n}@example.test`,
      emailVerified: true,
      name: label,
      status: 'ACTIVE',
      updatedAt: now,
      preferredLanguage: 'en',
      role,
    },
  });

/**
 * Better Auth signs session cookies, so a hand-built token is rejected. Register through the real
 * endpoint, mark the account verified directly in the database (SMTP is not part of this probe),
 * then sign in to obtain a legitimate cookie.
 */
const signUpAndSignIn = async (email, name, password) => {
  const jar = new Map();
  const call = async (path, method, body) => {
    const headers: Record<string, string> = { Origin: config.PUBLIC_APP_URL };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    const res = await fetch(origin + path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      redirect: 'manual',
    });
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const at = pair.indexOf('=');
      const name2 = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value) jar.set(name2, value);
      else jar.delete(name2);
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };
  const signup = await call('/api/auth/sign-up/email', 'POST', { email, name, password });
  if (signup.status !== 202 && signup.status !== 200)
    return { ok: false, at: 'signup', status: signup.status, body: signup.body };
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  const login = await call('/api/auth/sign-in/email', 'POST', { email, password });
  if (login.status !== 200)
    return { ok: false, at: 'login', status: login.status, body: login.body };
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const me = await call('/api/v1/me', 'GET');
  return { ok: true, cookie, meStatus: me.status, me: me.body, sessionId: me.body?.session?.id };
};

const makeOrg = async (id, type, createdByUserId) => {
  await prisma.organization.create({
    data: {
      id,
      name: id,
      slug: id,
      type,
      approvalStatus: 'APPROVED',
      updatedAt: now,
      region: 'TN',
      description: 'synthetic',
      contactEmail: `${id}@example.test`,
      representativeName: 'Rep',
      createdByUserId,
    },
  });
  return id;
};

const addMember = async (orgId, userId, roles) => {
  const m = await prisma.organizationMember.create({
    data: { id: `mem-${orgId}-${userId}`, organizationId: orgId, userId, status: 'ACTIVE' },
  });
  for (const role of roles)
    await prisma.membershipRole.create({
      data: { id: `role-${m.id}-${role}`, membershipId: m.id, role, assignedByUserId: userId },
    });
  return m;
};

const _signIn = (token) =>
  prisma.session
    .findUnique({ where: { token }, select: { userId: true, id: true } })
    .then((s) => s);

const request = async (path, cookie) => {
  const res = await fetch(origin + path, {
    headers: { Origin: config.PUBLIC_APP_URL, Cookie: cookie },
    redirect: 'manual',
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 400);
  }
  return { status: res.status, body, text };
};

const SENTINELS = [
  'INTERNAL_SENTINEL_ALPHA',
  'SENTINEL_INTERNAL_BETA',
  'SENTINEL_COST_GAMMA',
  'SENTINEL_RATE_DELTA',
  'SENTINEL_FEASIBILITY_EPSILON',
  'SENTINEL_EXPL_ZETA',
  'SENTINEL_SHARE_ETA',
];

try {
  const craft = await prisma.craftSkill.findFirst({ where: { isActive: true } });
  const craftId =
    craft?.id ??
    (
      await prisma.craftSkill.create({
        data: { id: `craft-http-${n}`, name: 'Craft', category: 'TEXTILE', isActive: true },
      })
    ).id;

  // Accounts must exist before organizations reference their creator.
  const password = 'Verification-probe-password-2026!';
  const financeSignup = await signUpAndSignIn(
    `fin-http-${Date.now()}@example.test`,
    'Fin',
    password,
  );
  const buyerSignup = await signUpAndSignIn(`buy-http-${Date.now()}@example.test`, 'Buy', password);
  if (!financeSignup.ok || !buyerSignup.ok)
    throw new Error(
      `signup failed: ${JSON.stringify({ financeSignup, buyerSignup }).slice(0, 400)}`,
    );
  const financeId = financeSignup.me.user.id ?? financeSignup.me.userId;
  const buyerId = buyerSignup.me.user.id ?? buyerSignup.me.userId;

  // Roles are granted after sign-in so the account guard sees an ordinary verified user.
  const operatorOrg = await makeOrg(`op-http-${++n}`, 'INTERNAL', financeId);
  const buyerOrg = await makeOrg(`buy-http-${n}`, 'BUYER_BUSINESS', buyerId);
  await addMember(operatorOrg, financeId, ['FINANCE_MANAGER']);
  await addMember(buyerOrg, buyerId, ['BUYER_REPRESENTATIVE']);
  await prisma.user.update({ where: { id: financeId }, data: { role: 'USER' } });

  const rfqId = `rfq-http-${n}`;
  await prisma.commercialRfq.create({
    data: {
      id: rfqId,
      buyerOrganizationId: buyerOrg,
      operatorOrganizationId: operatorOrg,
      craftSkillId: craftId,
      title: 'Synthetic',
      specification: 'spec',
      designRequirements: 'none',
      quantity: 100,
      deliveryAt: new Date('2027-01-01T00:00:00Z'),
      deliveryLocation: 'Tunis',
      status: 'ACCEPTED',
      updatedAt: now,
    },
  });
  const orderId = `ord-${rfqId}`;
  await prisma.commercialOrder.create({
    data: { id: orderId, rfqId, status: 'DELIVERED', version: 1, delivered: 100 },
  });

  const legacy = await prisma.procurementDocument.create({
    data: {
      id: `doc-http-${n}`,
      rfqId,
      orderId,
      authorId: financeId,
      kind: 'INVOICE',
      number: 4400 + n,
      version: 1,
      status: 'FINAL',
      content: {
        totalTnd: '1250.000',
        taxTnd: '237.500',
        netTnd: '1012.500',
        paymentTerms: 'net30',
        internal: { SENDS: 'INTERNAL_SENTINEL_ALPHA', notes: 'SENTINEL_INTERNAL_BETA' },
        costEstimate: {
          marginBasisPoints: 4237,
          lines: [{ rateTnd: 'SENTINEL_RATE_DELTA' }],
          costs: ['SENTINEL_COST_GAMMA'],
        },
        feasibility: { floor: 'SENTINEL_FEASIBILITY_EPSILON', explanation: 'SENTINEL_EXPL_ZETA' },
        producerShare: 'SENTINEL_SHARE_ETA',
      },
    },
  });

  const buyerToken = buyerSignup.cookie;
  const finToken = financeSignup.cookie;

  const path = `/api/v1/procurement/documents/${legacy.id}/download`;
  const anonRes = await fetch(origin + path, { headers: { Origin: config.PUBLIC_APP_URL } });
  const anonText = await anonRes.text();
  const anon = { status: anonRes.status, text: anonText };

  const asBuyer = await request(path, buyerToken);
  const asFinance = await request(path, finToken);

  out.documentId = legacy.id;
  out.anonymous = {
    status: anon.status,
    leaks: SENTINELS.filter((s) => anonText.includes(s)),
  };
  out.buyer = {
    status: asBuyer.status,
    leaks: SENTINELS.filter((s) => asBuyer.text.includes(s)),
    keys:
      asBuyer.status === 200 && asBuyer.body?.document ? Object.keys(asBuyer.body.document) : null,
    hasLegitimateTerms: asBuyer.text.includes('1250.000') && asBuyer.text.includes('net30'),
  };
  out.financeOperator = {
    status: asFinance.status,
    seesInternalCosting: asFinance.text.includes('SENTINEL_COST_GAMMA'),
  };
} catch (error) {
  out.fatal = String(error.stack ?? error).slice(0, 900);
} finally {
  console.log(JSON.stringify(out, null, 1));
  await app.close();
  await env.close();
  process.exit(0);
}
