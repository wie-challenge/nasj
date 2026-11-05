import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Loopback browser control only. Creates fictional groups; not registered in the application.
export async function seedBrowserDirectoryFixture(url: string, suffix: string) {
  if (!/^[a-z0-9-]{1,32}$/.test(suffix)) throw new Error('Invalid fixture suffix.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const userId = async (role: string) =>
      (
        await db.user.findUniqueOrThrow({
          where: { email: `directory-${role}-${suffix}@example.com` },
        })
      ).id;
    const buyerId = await userId('buyer');
    const sfaxId = await userId('sfax');
    const kairouanId = await userId('kairouan');
    const period = {
      effectiveFrom: new Date('2027-06-01T00:00:00+01:00'),
      effectiveTo: new Date('2027-06-08T00:00:00+01:00'),
    };
    const association = async (name: string, region: string, coordinatorId: string) =>
      db.organization.create({
        data: {
          name,
          slug: `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}`,
          type: 'ASSOCIATION',
          approvalStatus: 'APPROVED',
          region,
          description: 'Synthetic directory browser fixture',
          contactEmail: 'directory@example.com',
          representativeName: 'Synthetic coordinator',
          createdByUserId: coordinatorId,
          members: {
            create: {
              userId: coordinatorId,
              roles: {
                create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: coordinatorId },
              },
            },
          },
        },
      });
    await db.organization.create({
      data: {
        name: `Directory buyer ${suffix}`,
        slug: `directory-buyer-${suffix}`,
        type: 'BUYER_BUSINESS',
        approvalStatus: 'APPROVED',
        region: 'Tunis',
        description: 'Synthetic directory browser fixture',
        contactEmail: 'directory@example.com',
        representativeName: 'Synthetic buyer',
        createdByUserId: buyerId,
        members: {
          create: {
            userId: buyerId,
            roles: { create: { role: 'BUYER', assignedByUserId: buyerId } },
          },
        },
      },
    });
    const sfax = await association(`Directory group Sfax ${suffix}`, 'Sfax', sfaxId);
    const kairouan = await association(
      `Directory group Kairouan ${suffix}`,
      'Kairouan',
      kairouanId,
    );
    const policy = await db.authorizationPolicy.create({
      data: {
        version: `directory-browser-${suffix}`,
        methods: ['SIGNED'],
        reviewReference: 'Synthetic reviewed method fixture',
        reviewedById: sfaxId,
      },
    });
    const add = async (orgId: string, coordinatorId: string, name: string, quantity: number) => {
      const profile = await db.artisanProfile.create({
        data: {
          displayName: name,
          region: 'Synthetic quarter',
          contactPhone: '+21699000111',
          userId: null,
          equipment: [],
          skills: { create: { craftSkillId: 'weaving' } },
        },
      });
      await db.artisanManagement.create({
        data: {
          artisanProfileId: profile.id,
          organizationId: orgId,
          recordedById: coordinatorId,
          reason: 'Synthetic browser directory management',
        },
      });
      await db.artisanAssignment.create({
        data: {
          artisanProfileId: profile.id,
          organizationId: orgId,
          coordinatorId,
          assignedById: coordinatorId,
          reason: 'Synthetic browser directory assignment',
        },
      });
      await db.onboardingAuthorization.create({
        data: {
          artisanProfileId: profile.id,
          policyId: policy.id,
          purpose: 'PARTICIPATION',
          method: 'SIGNED',
          occurredAt: new Date(),
          language: 'fr',
          evidenceReference: 'Synthetic worker confirmation fixture',
          recordedById: coordinatorId,
        },
      });
      await db.capacityDeclaration.create({
        data: {
          artisanProfileId: profile.id,
          craftSkillId: 'weaving',
          unitType: 'PIECES',
          quantity,
          ...period,
          declaredByUserId: coordinatorId,
        },
      });
      return profile.id;
    };
    for (const name of ['one', 'two', 'three'])
      await add(sfax.id, sfaxId, `Hidden directory ${name} ${suffix}`, 100);
    const soloId = await add(kairouan.id, kairouanId, `Hidden directory solo ${suffix}`, 40);
    return { soloId };
  } finally {
    await db.$disconnect();
  }
}
