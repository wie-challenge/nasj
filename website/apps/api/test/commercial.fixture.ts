import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Loopback browser control only. Synthetic capacity is not a reservation.
export async function seedBrowserCommercialFixture(url: string, suffix: string) {
  if (!/^[a-z0-9-]{1,32}$/.test(suffix)) throw new Error('Invalid fixture suffix.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const user = async (role: string) =>
      db.user.findUniqueOrThrow({
        where: { email: `commercial-${role}-${suffix}@example.com` },
      });
    const [buyer, operator] = await Promise.all([user('buyer'), user('operator')]);
    const craftSkillId = `commercial-weaving-${suffix}`;
    await db.craftSkill.create({
      data: {
        id: craftSkillId,
        name: `Synthetic commercial weaving ${suffix}`,
        category: `Fixture ${suffix}`,
        description: 'Isolated disposable commercial capacity cohort.',
      },
    });
    const offset = [...suffix].reduce((total, char) => total + char.charCodeAt(0), 0) % 10;
    const startDay = 6 + offset;
    const periodStart = `2027-09-${String(startDay).padStart(2, '0')}T00:00`;
    const periodEnd = `2027-09-${String(startDay + 7).padStart(2, '0')}T00:00`;
    const instant = (value: string) => new Date(`${value}:00+01:00`);
    const period = { effectiveFrom: instant(periodStart), effectiveTo: instant(periodEnd) };
    const organization = async (
      name: string,
      type: 'BUYER_BUSINESS' | 'INTERNAL' | 'ASSOCIATION',
      userId: string,
      role: 'BUYER' | 'NASJ_OPERATOR' | 'ASSOCIATION_COORDINATOR',
    ) =>
      db.organization.create({
        data: {
          name,
          slug: `${suffix}-${type.toLowerCase()}`,
          type,
          approvalStatus: 'APPROVED',
          region: 'Sfax',
          description: 'Synthetic commercial browser fixture',
          contactEmail: 'commercial-browser@example.com',
          representativeName: 'Synthetic representative',
          createdByUserId: userId,
          members: {
            create: {
              userId,
              roles: { create: { role, assignedByUserId: userId } },
              ...(role === 'BUYER'
                ? {
                    permissionGrants: {
                      create: {
                        permission: 'buyer.quotation.approve',
                        grantedById: userId,
                        reason: 'Synthetic approval authority',
                      },
                    },
                  }
                : {}),
            },
          },
        },
      });
    const [buyerOrg, operatorOrg, association] = await Promise.all([
      organization(`Commercial buyer ${suffix}`, 'BUYER_BUSINESS', buyer.id, 'BUYER'),
      organization(`Commercial operator ${suffix}`, 'INTERNAL', operator.id, 'NASJ_OPERATOR'),
      organization(
        `Commercial association ${suffix}`,
        'ASSOCIATION',
        operator.id,
        'ASSOCIATION_COORDINATOR',
      ),
    ]);
    await db.operatorAssignment.create({
      data: {
        operatorId: operator.id,
        organizationId: buyerOrg.id,
        assignedById: operator.id,
      },
    });
    const policy = await db.authorizationPolicy.create({
      data: {
        version: `commercial-browser-${suffix}`,
        methods: ['SIGNED'],
        reviewReference: 'Synthetic reviewed method',
        reviewedById: operator.id,
      },
    });
    const participant = async (name: string) => {
      const profile = await db.artisanProfile.create({
        data: {
          displayName: name,
          region: 'Synthetic quarter',
          contactPhone: '+21699000222',
          equipment: [],
          skills: { create: { craftSkillId } },
        },
      });
      await db.artisanManagement.create({
        data: {
          artisanProfileId: profile.id,
          organizationId: association.id,
          recordedById: operator.id,
          reason: 'Synthetic commercial management',
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
          evidenceReference: 'Synthetic participation confirmation',
          recordedById: operator.id,
        },
      });
      return db.capacityDeclaration.create({
        data: {
          artisanProfileId: profile.id,
          craftSkillId,
          unitType: 'PIECES',
          quantity: 50,
          ...period,
          declaredByUserId: operator.id,
        },
      });
    };
    const alpha = await participant(`Hidden commercial alpha ${suffix}`);
    await participant(`Hidden commercial beta ${suffix}`);
    await participant(`Hidden commercial gamma ${suffix}`);
    const consumed = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: buyerOrg.id,
        operatorOrganizationId: operatorOrg.id,
        craftSkillId,
        title: `Synthetic consumed throughput ${suffix}`,
        specification: 'Synthetic only',
        designRequirements: 'Synthetic only',
        quantity: 20,
        deliveryAt: period.effectiveTo,
        deliveryLocation: 'Synthetic site',
        status: 'ACCEPTED',
        order: { create: { status: 'CLOSED' } },
      },
      include: { order: true },
    });
    await db.commercialOffer.create({
      data: {
        orderId: consumed.order!.id,
        artisanProfileId: alpha.artisanProfileId,
        capacityDeclarationId: alpha.id,
        quantity: 20,
        unitPayMillimes: 1000n,
        estimatedHours: 'Synthetic range',
        expiresAt: period.effectiveFrom,
        materials: 'Synthetic only',
        reworkTerms: 'Synthetic only',
        paymentConditions: 'Simulated only',
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        batch: {
          create: {
            orderId: consumed.order!.id,
            artisanProfileId: alpha.artisanProfileId,
            status: 'COMPLETED',
            produced: 20,
          },
        },
      },
    });
    const previousEffort = await db.effortAssumption.findFirst({
      where: { craftSkillId, unitType: 'PIECES' },
      orderBy: { version: 'desc' },
    });
    await db.effortAssumption.create({
      data: {
        craftSkillId,
        unitType: 'PIECES',
        minPerUnit: '1.50',
        maxPerUnit: '2.50',
        source: 'Synthetic reviewed timing study',
        version: (previousEffort?.version ?? 0) + 1,
        authorId: operator.id,
      },
    });
    const rfq = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: buyerOrg.id,
        operatorOrganizationId: operatorOrg.id,
        craftSkillId,
        title: `Synthetic feasibility runner ${suffix}`,
        specification: 'Synthetic cotton runner, exact version one.',
        designRequirements: 'Synthetic border and dimensions.',
        quantity: 100,
        deliveryAt: new Date('2027-10-01T00:00:00+01:00'),
        deliveryLocation: 'Synthetic Tunis site',
        status: 'UNDER_REVIEW',
        procurementManaged: true,
      },
    });
    const revision = await db.procurementRevision.create({
      data: {
        rfqId: rfq.id,
        version: rfq.version,
        authorId: operator.id,
        reason: 'Synthetic baseline specification',
        snapshot: { provenance: 'SYNTHETIC' },
      },
    });
    const sample = await db.procurementSample.create({
      data: {
        rfqId: rfq.id,
        version: 1,
        revisionId: revision.id,
        authorId: operator.id,
        evidenceReference: 'Synthetic sample board',
        criteria: 'Synthetic color and size check',
        snapshot: { provenance: 'SYNTHETIC' },
      },
    });
    await db.procurementSampleDecision.create({
      data: {
        sampleId: sample.id,
        actorId: buyer.id,
        decision: 'APPROVED',
        comments: 'Synthetic approval of this sample only.',
      },
    });
    return {
      rfqId: rfq.id,
      periodStart,
      periodEnd,
      expiresAt: '2027-09-25T00:00',
    };
  } finally {
    await db.$disconnect();
  }
}
