import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedBrowserCommerceFixture } from './commerce.fixture.js';

/** Nonce-protected loopback test control only. Business records are made by API calls in the spec. */
export async function seedBrowserProductFixture(url: string, suffix: string) {
  const fixture = await seedBrowserCommerceFixture(url, suffix);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const operator = await db.user.findUniqueOrThrow({
      where: { email: `commerce-operator-${suffix}@example.com` },
    });
    const member = await db.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: fixture.operatorOrganizationId,
          userId: operator.id,
        },
      },
    });
    await db.membershipRole.createMany({
      data: ['NASJ_OPERATOR', 'PRODUCT_DESIGNER'].map((role) => ({
        membershipId: member.id,
        role: role as 'NASJ_OPERATOR' | 'PRODUCT_DESIGNER',
        assignedByUserId: operator.id,
      })),
    });
    await db.operatorAssignment.create({
      data: {
        operatorId: operator.id,
        organizationId: fixture.buyerOrganizationId,
        assignedById: operator.id,
      },
    });
    return fixture;
  } finally {
    await db.$disconnect();
  }
}
