import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Loopback browser control only. The accepted quotation is synthetic and is not artisan consent.
export async function seedBrowserProductionFixture(url: string, suffix: string) {
  if (!/^[a-z0-9-]{1,32}$/.test(suffix)) throw new Error('Invalid fixture suffix.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const user = async (role: string) =>
      db.user.findUniqueOrThrow({ where: { email: `production-${role}-${suffix}@example.com` } });
    const [operator, artisan, coordinator] = await Promise.all([
      user('operator'),
      user('artisan'),
      user('coordinator'),
    ]);
    const period = {
      effectiveFrom: new Date('2027-09-06T00:00:00+01:00'),
      effectiveTo: new Date('2027-09-13T00:00:00+01:00'),
    };
    const organization = async (
      name: string,
      type: 'BUYER_BUSINESS' | 'INTERNAL' | 'ASSOCIATION',
      userId: string,
      role: 'BUYER' | 'NASJ_OPERATOR' | 'ASSOCIATION_COORDINATOR',
    ) =>
      db.organization.create({
        data: {
          name,
          slug: `${suffix}-production-${type.toLowerCase()}`,
          type,
          approvalStatus: 'APPROVED',
          region: 'Sfax',
          description: 'Synthetic production browser fixture',
          contactEmail: 'production-browser@example.com',
          representativeName: 'Synthetic representative',
          createdByUserId: userId,
          members: {
            create: { userId, roles: { create: { role, assignedByUserId: userId } } },
          },
        },
      });
    const [buyerOrg, operatorOrg, association] = await Promise.all([
      organization(`Production buyer ${suffix}`, 'BUYER_BUSINESS', operator.id, 'BUYER'),
      organization(`Production operator ${suffix}`, 'INTERNAL', operator.id, 'NASJ_OPERATOR'),
      organization(
        `Production association ${suffix}`,
        'ASSOCIATION',
        coordinator.id,
        'ASSOCIATION_COORDINATOR',
      ),
    ]);
    await db.operatorAssignment.create({
      data: { operatorId: operator.id, organizationId: buyerOrg.id, assignedById: operator.id },
    });
    if (suffix.startsWith('c08')) {
      const membership = await db.organizationMember.findFirstOrThrow({
        where: { organizationId: buyerOrg.id, userId: operator.id },
      });
      await db.membershipPermission.create({
        data: {
          membershipId: membership.id,
          permission: 'buyer.quotation.approve',
          grantedById: operator.id,
          reason: 'Synthetic explicit buyer contract decision authority',
        },
      });
    }
    if (suffix.startsWith('b12')) {
      const m = await db.organizationMember.findFirstOrThrow({
        where: { organizationId: operatorOrg.id, userId: operator.id },
      });
      await db.membershipRole.createMany({
        data: ['BUSINESS_DEVELOPMENT', 'FINANCE_MANAGER', 'PRODUCT_DESIGNER'].map((role) => ({
          membershipId: m.id,
          role: role as 'BUSINESS_DEVELOPMENT' | 'FINANCE_MANAGER' | 'PRODUCT_DESIGNER',
          assignedByUserId: operator.id,
        })),
      });
      await db.membershipPermission.createMany({
        data: [
          'finance.payable.reconcile',
          'finance.accounting.export',
          'finance.closure.assess',
        ].map((permission) => ({
          membershipId: m.id,
          permission,
          grantedById: operator.id,
          reason: 'Synthetic Batch12 browser finance authority',
        })),
      });
    }
    const policy = await db.authorizationPolicy.create({
      data: {
        version: `production-browser-${suffix}`,
        methods: ['SIGNED'],
        reviewReference: 'Synthetic reviewed method',
        reviewedById: operator.id,
      },
    });
    const linkedName = `Synthetic linked ${suffix}`;
    const accountlessName = `Synthetic accountless ${suffix}`;
    const linked = await db.artisanProfile.create({
      data: {
        displayName: linkedName,
        region: 'Synthetic quarter',
        preferredLanguage: 'fr',
        userId: artisan.id,
        equipment: [],
        skills: { create: { craftSkillId: 'weaving' } },
      },
    });
    await db.consentRecord.create({
      data: {
        userId: artisan.id,
        purpose: 'artisan.profile',
        decision: true,
        policyVersion: 'artisan-profile-v1',
        collectionContext: 'synthetic_browser_fixture',
      },
    });
    await db.artisanManagement.create({
      data: {
        artisanProfileId: linked.id,
        organizationId: association.id,
        recordedById: coordinator.id,
        reason: 'Synthetic production management',
      },
    });
    const accountless = await db.artisanProfile.create({
      data: {
        displayName: accountlessName,
        region: 'Synthetic quarter',
        preferredLanguage: 'ar',
        equipment: [],
        skills: { create: { craftSkillId: 'weaving' } },
      },
    });
    await db.artisanManagement.create({
      data: {
        artisanProfileId: accountless.id,
        organizationId: association.id,
        recordedById: coordinator.id,
        reason: 'Synthetic production management',
      },
    });
    await db.onboardingAuthorization.create({
      data: {
        artisanProfileId: accountless.id,
        policyId: policy.id,
        purpose: 'PARTICIPATION',
        method: 'SIGNED',
        occurredAt: new Date(),
        language: 'ar',
        evidenceReference: 'Synthetic participation confirmation',
        recordedById: coordinator.id,
      },
    });
    for (const profileId of [linked.id, accountless.id])
      await db.artisanAssignment.create({
        data: {
          artisanProfileId: profileId,
          coordinatorId: coordinator.id,
          organizationId: association.id,
          assignedById: coordinator.id,
          reason: 'Synthetic assignment',
        },
      });
    for (const profileId of [linked.id, accountless.id])
      await db.capacityDeclaration.create({
        data: {
          artisanProfileId: profileId,
          craftSkillId: 'weaving',
          unitType: 'PIECES',
          quantity: 50,
          ...period,
          declaredByUserId: operator.id,
        },
      });
    const rfq = await db.commercialRfq.create({
      data: {
        buyerOrganizationId: buyerOrg.id,
        operatorOrganizationId: operatorOrg.id,
        craftSkillId: 'weaving',
        title: `Synthetic production ${suffix}`,
        specification: 'Synthetic cotton runner, exact version one.',
        designRequirements: 'Synthetic border and dimensions.',
        quantity: 100,
        deliveryAt: new Date('2027-10-01T00:00:00+01:00'),
        deliveryLocation: 'Synthetic Tunis site',
        status: 'ACCEPTED',
        procurementManaged: true,
        order: { create: { status: 'APPROVED' } },
      },
      include: { order: { select: { id: true } } },
    });
    const revision = await db.procurementRevision.create({
      data: {
        rfqId: rfq.id,
        version: 1,
        authorId: operator.id,
        reason: 'Synthetic baseline specification',
        snapshot: { provenance: 'SYNTHETIC' },
      },
    });
    const sample = await db.procurementSample.create({
      select: { id: true },
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
        actorId: operator.id,
        decision: 'APPROVED',
        comments: 'Synthetic approval of this sample only.',
      },
    });
    const feasibility = await db.feasibilityAssessment.create({
      data: {
        rfqId: rfq.id,
        version: 1,
        rfqVersion: 1,
        result: 'FEASIBLE',
        unitType: 'PIECES',
        requestedQuantity: '100.00',
        knownRemaining: '100.00',
        effortMin: '150.00',
        effortMax: '250.00',
        constraints: [],
        explanation: 'Synthetic feasible capacity.',
        assumptions: {
          effectiveFrom: period.effectiveFrom.toISOString(),
          effectiveTo: period.effectiveTo.toISOString(),
          unit: 'PIECES',
          provenance: 'SYNTHETIC',
        },
        authorId: operator.id,
      },
    });
    const cost = await db.costEstimate.create({
      data: {
        rfqId: rfq.id,
        version: 1,
        feasibilityAssessmentId: feasibility.id,
        quantity: 100,
        components: [
          { category: 'ARTISAN_LABOR', basis: 'VARIABLE', rateTnd: '3.000', amountTnd: '300.000' },
        ],
        subtotalMillimes: 300000n,
        marginMethod: 'NONE',
        marginBasisPoints: 0,
        sellingMillimes: 300000n,
        incomplete: false,
        status: 'APPROVED',
        authorId: operator.id,
        snapshot: { provenance: 'SYNTHETIC' },
      },
    });
    const quote = await db.procurementQuote.create({
      data: {
        rfqId: rfq.id,
        version: 1,
        revisionId: revision.id,
        authorId: operator.id,
        totalMillimes: 300000n,
        expiresAt: new Date('2027-09-20T00:00:00.000Z'),
        snapshot: { provenance: 'SYNTHETIC' },
        feasibilityAssessmentId: feasibility.id,
        costEstimateId: cost.id,
        termsSha256: 'ab'.repeat(32),
        acceptance: {
          create: {
            orderId: rfq.order!.id,
            actorId: operator.id,
            snapshot: {
              capacityReserved: false,
              artisanAccepted: false,
              legalStatus: 'DEMO_ONLY_NOT_A_BINDING_CONTRACT',
            },
          },
        },
      },
    });
    return {
      rfqId: rfq.id,
      buyerOrganizationId: buyerOrg.id,
      operatorOrganizationId: operatorOrg.id,
      orderId: rfq.order!.id,
      linkedName,
      accountlessName,
      quoteId: quote.id,
      coordinatorId: coordinator.id,
    };
  } finally {
    await db.$disconnect();
  }
}
