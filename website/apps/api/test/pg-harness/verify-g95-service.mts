// CP5-G95: exercise the real SalesService.update through a real transaction.
import 'reflect-metadata';
import { bootPostgres } from './wire-session.mjs';

const env = await bootPostgres();
process.env.DATABASE_URL = env.connectionString;

const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const { SalesService } = await import('../../src/modules/sales/sales.service.js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.connectionString, connectionTimeoutMillis: 10000 }),
  log: [],
});
const db = prisma;
const svc = new SalesService(prisma as never);

const results: Record<string, unknown> = {};
const now = new Date();

async function seed(suffix: string, acceptedRfq: boolean) {
  const u = await db.user.create({
    data: {
      id: `u-${suffix}`,
      email: `${suffix}@example.test`,
      emailVerified: true,
      name: 'S',
      status: 'ACTIVE',
      updatedAt: now,
    },
  });
  for (const [id, type] of [
    [`op-${suffix}`, 'INTERNAL'],
    [`buy-${suffix}`, 'BUYER_BUSINESS'],
  ] as const)
    await db.organization.create({
      data: {
        id,
        name: id,
        slug: id,
        type,
        approvalStatus: 'APPROVED',
        region: 'TN',
        description: 's',
        contactEmail: `${id}@example.test`,
        representativeName: 'R',
        createdByUserId: u.id,
        updatedAt: now,
      },
    });
  await db.organizationMember.create({
    data: {
      id: `mem-${suffix}`,
      organizationId: `op-${suffix}`,
      userId: u.id,
      status: 'ACTIVE',
      permissionGrants: {
        create: [
          {
            permission: 'buyer.relationship.manage',
            grantedById: u.id,
            reason: 'synthetic verification',
          },
        ],
      },
      roles: { create: { role: 'BUSINESS_DEVELOPMENT', assignedByUserId: u.id } },
    },
  });
  const craft = await db.craftSkill.findFirst({ where: { isActive: true } });
  if (acceptedRfq)
    await db.commercialRfq.create({
      data: {
        id: `rfq-${suffix}`,
        buyerOrganizationId: `buy-${suffix}`,
        operatorOrganizationId: `op-${suffix}`,
        craftSkillId: craft.id,
        title: 't',
        specification: 's',
        designRequirements: 'n',
        quantity: 1,
        deliveryAt: new Date(now.getTime() + 8.64e7),
        deliveryLocation: 'Tunis',
        status: 'ACCEPTED',
        version: 1,
        updatedAt: now,
        order: { create: { id: `ord-${suffix}`, status: 'APPROVED' } },
      },
    });
  // iamTransaction requires a live session row; the service under test is the real one.
  await db.session
    .create({
      data: {
        id: `sess-${suffix}`,
        token: `tok-${suffix}`,
        userId: u.id,
        expiresAt: new Date(now.getTime() + 3600_000),
        createdAt: now,
        updatedAt: now,
        ipAddress: '127.0.0.1',
        userAgent: 'verification',
      },
    })
    .catch(async () => {
      await db.session.create({
        data: {
          id: `sess-${suffix}`,
          token: `tok-${suffix}`,
          userId: u.id,
          expiresAt: new Date(now.getTime() + 3600_000),
        },
      });
    });
  const prospect = await db.commercialProspect.create({
    data: {
      id: `pr-${suffix}`,
      operatorOrganizationId: `op-${suffix}`,
      buyerOrganizationId: `buy-${suffix}`,
      version: 1,
      snapshot: {
        status: 'PROPOSAL',
        segment: 'artisan',
        needs: 'panels',
        qualificationNotes: 'qualified',
        ownerId: u.id,
        nextAction: 'call',
        followUpAt: null,
        contactBasis: 'CONSENT',
        basisEvidence: 'consent recorded',
        contactReviewAt: now.toISOString(),
        reason: 'pipeline',
      },
    },
  });
  const check = await db.commercialProspect.findUnique({ where: { id: `pr-${suffix}` } });
  if (!check) throw new Error(`prospect not persisted for ${suffix}`);
  return { u, prospect };
}

const body = (version: number) => ({
  version,
  segment: 'artisan',
  needs: 'panels',
  qualificationNotes: 'qualified',
  status: 'CONTRACTED' as const,
  ownerId: 'placeholder',
  nextAction: 'call',
  followUpAt: null,
  contactBasis: 'CONSENT' as const,
  basisEvidence: 'consent recorded',
  contactReviewAt: now.toISOString(),
  reason: 'attempt conversion',
});

// Case 1: no accepted RFQ and no signed reference -> must be refused
{
  const { u, prospect } = await seed('g95a', false);
  try {
    await svc.update(
      { id: u.id, sessionId: `sess-${prospect.id.slice(3)}` } as never,
      prospect.id,
      { ...body(1), ownerId: u.id },
      'g95-probe-key-0001',
    );
    results.noEvidence = { accepted: true };
  } catch {
    results.noEvidence = {
      accepted: false,
      code: e?.response?.code ?? e?.message,
      msg: e?.response?.message,
    };
  }
}
// Case 2: accepted RFQ exists -> must succeed via the authoritative branch
{
  const { u, prospect } = await seed('g95b', true);
  try {
    const out = await svc.update(
      { id: u.id, sessionId: `sess-${prospect.id.slice(3)}` } as never,
      prospect.id,
      { ...body(1), ownerId: u.id },
      'g95-probe-key-0002',
    );
    const stored = await db.commercialProspect.findUnique({ where: { id: prospect.id } });
    results.acceptedRfq = {
      accepted: true,
      status: out?.status,
      provenance: out?.stageProvenance,
      evidenceKind: out?.contractedEvidence?.kind,
      storedSnapshotEvidence: stored?.snapshot?.contractedEvidence ?? null,
      storedProvenance: stored?.snapshot?.stageProvenance ?? null,
      storedConversionMeaning: stored?.snapshot?.conversionMeaning ?? null,
      storedStatus: stored?.snapshot?.status ?? null,
    };
  } catch {
    results.acceptedRfq = {
      accepted: false,
      code: e?.response?.code ?? e?.message,
      msg: e?.response?.message,
    };
  }
}
// Case 3: caller smuggles an arbitrary signed reference through the body
{
  const { u, prospect } = await seed('g95c', false);
  try {
    const out = await svc.update(
      { id: u.id, sessionId: `sess-${prospect.id.slice(3)}` } as never,
      prospect.id,
      {
        ...body(1),
        ownerId: u.id,
        signedContractReference: 'ARBITRARY',
      } as never,
      'g95-probe-key-0003',
    );
    results.smuggledReference = {
      accepted: true,
      status: out?.status,
      evidenceKind: out?.contractedEvidence?.kind ?? null,
    };
  } catch {
    results.smuggledReference = {
      accepted: false,
      code: e?.response?.code ?? e?.message,
      msg: e?.response?.message,
    };
  }
}

console.log(JSON.stringify(results, null, 1));
await prisma.$disconnect();
await env.close();
