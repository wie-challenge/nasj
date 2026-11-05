import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import * as C from '@nasj/contracts';
import type { Db } from '../foundation/transaction.js';
import { commercialTermsHash } from '../procurement/commercial-decision.js';
import { specificationSnapshot } from '../procurement/records.js';
export const DEMO_SEED_VERSION = 3;
export const DEMO_LIMITATIONS = [
  'All scenario identities, organizations, capacity, costs and commercial records are synthetic.',
  'Seeded sample approval and feasibility are demonstrations, not field measurement or independently verified evidence.',
  'No verified buyer receipt, bank payment, physical stock, invoice/tax policy or legal agreement exists.',
  'Accountless reported acceptance remains pending and cannot create a production commitment.',
  'QA uses the existing scoped internal operator role; it also retains standard production/logistics permissions.',
  'Governance administration uses a separate normal sign-in; global administrator access is not available through visitor switching.',
  'Reset archives prior generations, revokes only their synthetic sessions and preserves immutable history. Local safety simulation is separate.',
];
export const DEMO_PERSONAS: { id: C.DemoPersona; label: string; workspacePath: string }[] = [
  { id: 'buyer', label: 'Synthetic buyer representative', workspacePath: '/buyer' },
  { id: 'artisan', label: 'Synthetic authenticated artisan', workspacePath: '/commerce/artisan' },
  { id: 'coordinator', label: 'Synthetic association coordinator', workspacePath: '/association' },
  { id: 'production', label: 'Synthetic production operator', workspacePath: '/operator' },
  { id: 'qa', label: 'Synthetic quality operator', workspacePath: '/operator' },
  { id: 'finance', label: 'Synthetic finance reviewer', workspacePath: '/operator/finance' },
];
export const initialDemoTotals: C.DemoTotals = {
  rfqs: 1,
  quotations: 1,
  orders: 0,
  offers: 0,
  acceptedCommitments: 0,
  committedPieces: 0,
  capacityReserved: '0.00',
  produced: 0,
  qualityApproved: 0,
  prepared: 0,
  shipments: 0,
  delivered: 0,
  payables: 0,
  payableMillimes: '0',
  simulations: 0,
  simulatedMillimes: '0',
  verifiedPaidMillimes: '0',
  inventoryLots: 0,
  inventoryReservedMilli: '0',
  publishedQr: 0,
  allocationPlans: 0,
  productSpecifications: 1,
  sampleRequests: 0,
  samplePayables: 0,
  productionExceptions: 0,
  discussions: 0,
  supportTickets: 0,
  notificationDeliveries: 0,
};
export type DemoSeedSpec = {
  version: number;
  quoteId: string;
  linkedArtisanId: string;
  accountlessArtisanId: string;
  buyerOrganizationId: string;
  operatorOrganizationId: string;
  associationOrganizationId: string;
  craftSkillId: string;
  periodFrom: string;
  periodTo: string;
  offerExpiresAt: string;
  deliveryAt: string;
  initialTotals: C.DemoTotals;
};
export async function prepareDemoPassword(password: string) {
  return hashPassword(password);
}
export async function seedDemoScenario(
  tx: Db,
  visitorId: string,
  generation: number,
  scenarioId: string,
  passwordHash: string,
) {
  const users = {} as Record<C.DemoPersona, string>;
  for (const persona of DEMO_PERSONAS) {
    const id = randomUUID();
    users[persona.id] = id;
    await tx.user.create({
      data: {
        id,
        name: persona.label,
        email: `${persona.id}.${scenarioId}@showroom.invalid`,
        emailVerified: true,
        preferredLanguage: 'en',
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: 'credential',
            password: passwordHash,
          },
        },
      },
    });
  }
  const owner = users.production;
  const organization = async (
    kind: 'BUYER_BUSINESS' | 'INTERNAL' | 'ASSOCIATION',
    name: string,
    userId: string,
  ) =>
    tx.organization.create({
      data: {
        name: `SYNTHETIC — ${name}`,
        slug: `showroom-${kind.toLowerCase()}-${scenarioId}`,
        type: kind,
        approvalStatus: 'APPROVED',
        country: 'TN',
        region: 'Tunis',
        description: 'Fictional organization belonging to one isolated visitor scenario.',
        contactEmail: `${kind.toLowerCase()}.${scenarioId}@showroom.invalid`,
        representativeName: 'Synthetic representative',
        createdByUserId: userId,
        approvalReason: 'Versioned synthetic fixture; not real organization verification',
        approvedAt: new Date(),
      },
    });
  const buyer = await organization('BUYER_BUSINESS', 'Jasmin buyer studio', users.buyer);
  const internal = await organization('INTERNAL', 'NASJ operations', owner);
  const association = await organization(
    'ASSOCIATION',
    'Noura artisan association',
    users.coordinator,
  );
  const member = async (
    userId: string,
    organizationId: string,
    roles: C.BusinessRole[],
    grants: string[] = [],
    isCoordinator = false,
  ) =>
    tx.organizationMember.create({
      data: {
        userId,
        organizationId,
        isCoordinator,
        roles: { create: roles.map((role) => ({ role, assignedByUserId: owner })) },
        permissionGrants: {
          create: grants.map((permission) => ({
            permission,
            grantedById: owner,
            reason: 'Explicit scoped synthetic showroom authority',
          })),
        },
      },
    });
  await member(users.buyer, buyer.id, ['BUYER_REPRESENTATIVE'], ['buyer.quotation.approve']);
  await member(users.coordinator, association.id, ['ASSOCIATION_COORDINATOR'], [], true);
  await member(
    users.production,
    internal.id,
    ['NASJ_OPERATOR', 'PRODUCT_DESIGNER'],
    [
      'inventory.stock.register',
      'inventory.stock.reserve',
      'inventory.stock.handover',
      'inventory.stock.adjust',
      'finance.payable.reconcile',
      'finance.deposit.record',
      'finance.payout.request',
      'finance.payout.execute',
      'finance.adjustment.propose',
      'finance.closure.assess',
      'operator.payout.initiate',
    ],
  );
  await member(users.qa, internal.id, ['NASJ_OPERATOR', 'QUALITY_INSPECTOR']);
  await member(
    users.finance,
    internal.id,
    ['FINANCE_MANAGER'],
    [
      'finance.payable.reconcile',
      'finance.deposit.review',
      'finance.payout.approve',
      'finance.payout.execute',
      'finance.dispute.manage',
      'finance.adjustment.approve',
      'finance.closure.assess',
    ],
  );
  for (const userId of [users.production, users.qa, users.finance])
    for (const organizationId of [buyer.id, association.id])
      await tx.operatorAssignment.create({
        data: { operatorId: userId, organizationId, assignedById: owner },
      });
  const craft = await tx.craftSkill.create({
    data: {
      name: `SYNTHETIC embroidery ${scenarioId}`,
      category: 'Textile',
      description: 'Scenario-owned embroidery skill; capacity is synthetic and never a time study.',
    },
  });
  const policy = await tx.authorizationPolicy.create({
    data: {
      version: `showroom-${scenarioId}`,
      methods: ['SIGNED'],
      reviewReference:
        'Synthetic participation fixture only; not a commercial acceptance verification policy',
      reviewedById: owner,
    },
  });
  const linked = await tx.artisanProfile.create({
    data: {
      userId: users.artisan,
      createdById: users.coordinator,
      displayName: 'SYNTHETIC — Amel artisan',
      region: 'Tunis',
      preferredLanguage: 'en',
      equipment: ['Embroidery tools'],
      skills: { create: { craftSkillId: craft.id, proficiency: 'ADVANCED' } },
    },
  });
  const accountless = await tx.artisanProfile.create({
    data: {
      createdById: users.coordinator,
      displayName: 'SYNTHETIC — Accountless artisan',
      region: 'Tunis',
      preferredLanguage: 'en',
      equipment: ['Embroidery tools'],
      skills: { create: { craftSkillId: craft.id, proficiency: 'ADVANCED' } },
    },
  });
  await tx.consentRecord.create({
    data: {
      userId: users.artisan,
      purpose: 'artisan.profile',
      decision: true,
      policyVersion: 'artisan-profile-v1',
      collectionContext: 'synthetic_showroom_fixture',
    },
  });
  await tx.onboardingAuthorization.create({
    data: {
      artisanProfileId: accountless.id,
      policyId: policy.id,
      purpose: 'PARTICIPATION',
      method: 'SIGNED',
      occurredAt: new Date(),
      language: 'en',
      evidenceReference: 'Synthetic participation fixture; not artisan offer acceptance',
      recordedById: users.coordinator,
    },
  });
  const periodFrom = new Date();
  periodFrom.setUTCHours(0, 0, 0, 0);
  periodFrom.setUTCDate(periodFrom.getUTCDate() + 7);
  const periodTo = new Date(periodFrom.getTime() + 7 * 86400000);
  const offerExpiresAt = new Date(Date.now() + 5 * 86400000);
  const deliveryAt = new Date(periodTo.getTime() + 14 * 86400000);
  for (const profile of [linked, accountless]) {
    await tx.artisanManagement.create({
      data: {
        artisanProfileId: profile.id,
        organizationId: association.id,
        recordedById: users.coordinator,
        reason: 'Synthetic visitor-owned association',
      },
    });
    await tx.artisanAssignment.create({
      data: {
        artisanProfileId: profile.id,
        organizationId: association.id,
        coordinatorId: users.coordinator,
        assignedById: owner,
        reason: 'Synthetic scenario-only assignment',
      },
    });
    await tx.capacityDeclaration.create({
      data: {
        artisanProfileId: profile.id,
        craftSkillId: craft.id,
        unitType: 'PIECES',
        quantity: 50,
        effectiveFrom: periodFrom,
        effectiveTo: periodTo,
        declaredByUserId: profile.id === linked.id ? users.artisan : users.coordinator,
      },
    });
  }
  const rfq = await tx.commercialRfq.create({
    data: {
      buyerOrganizationId: buyer.id,
      operatorOrganizationId: internal.id,
      craftSkillId: craft.id,
      title: 'SYNTHETIC — Embroidered table runners',
      specification: 'Ten cotton table runners with the approved synthetic border and dimensions.',
      designRequirements:
        'Synthetic blue embroidery, 40 × 120 cm; no physical sample certification.',
      quantity: 10,
      deliveryAt,
      deliveryLocation: 'Synthetic Tunis buyer studio',
      status: 'QUOTED',
      procurementManaged: true,
      quoteMillimes: 150000n,
      quoteExpiresAt: offerExpiresAt,
    },
  });
  const revision = await tx.procurementRevision.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      authorId: owner,
      reason: 'Initial synthetic showroom specification',
      snapshot: specificationSnapshot(rfq),
    },
  });
  const sample = await tx.procurementSample.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      revisionId: revision.id,
      authorId: owner,
      evidenceReference: 'SYNTHETIC sample board — no physical evidence',
      criteria: 'Synthetic dimensions, embroidery and finish',
      snapshot: { provenance: 'SYNTHETIC', scenarioId },
    },
  });
  await tx.procurementSampleDecision.create({
    data: {
      sampleId: sample.id,
      actorId: users.buyer,
      decision: 'APPROVED',
      comments: 'Synthetic sample approval for demonstration only.',
    },
  });
  await tx.specificationMaterialLine.create({
    data: {
      revisionId: revision.id,
      materialCode: 'cotton-thread',
      name: 'Cotton thread',
      unit: 'METERS',
      perItemMilli: 1000,
      wastageBps: 0,
    },
  });
  await tx.inspectionCriterion.create({
    data: {
      revisionId: revision.id,
      code: 'finish',
      description: 'Embroidery and finish',
      expected: 'Synthetic match to approved sample',
      required: true,
      version: 1,
    },
  });
  const effort = await tx.effortAssumption.create({
    data: {
      craftSkillId: craft.id,
      unitType: 'PIECES',
      minPerUnit: '1.00',
      maxPerUnit: '2.00',
      source: 'SYNTHETIC scenario assumption; not measured productivity',
      version: 1,
      authorId: owner,
    },
  });
  const feasibility = await tx.feasibilityAssessment.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      rfqVersion: 1,
      result: 'FEASIBLE',
      unitType: 'PIECES',
      requestedQuantity: '10.00',
      knownRemaining: '100.00',
      shortage: '0.00',
      effortMin: '10.00',
      effortMax: '20.00',
      effortAssumptionId: effort.id,
      constraints: [],
      explanation:
        'Synthetic feasibility seed using 100 declared pieces for a 10-piece demonstration. Material readiness is only a synthetic attestation.',
      assumptions: {
        effectiveFrom: periodFrom.toISOString(),
        effectiveTo: periodTo.toISOString(),
        unit: 'PIECES',
        region: 'Tunis',
        provenance: 'SYNTHETIC',
        scenarioId,
        materialStatus: 'CONFIRMED_AVAILABLE',
        materialSource: 'SYNTHETIC only, not physical stock',
        calendarSource: 'Synthetic assumed calendar',
      },
      authorId: owner,
    },
  });
  const components = [
    { category: 'ARTISAN_LABOR', basis: 'VARIABLE', rateTnd: '8.000', amountTnd: '80.000' },
    { category: 'MATERIALS', basis: 'VARIABLE', rateTnd: '4.000', amountTnd: '40.000' },
  ];
  const cost = await tx.costEstimate.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      feasibilityAssessmentId: feasibility.id,
      quantity: 10,
      components,
      subtotalMillimes: 120000n,
      marginMethod: 'MARKUP_ON_COST',
      marginBasisPoints: 2500,
      sellingMillimes: 150000n,
      incomplete: false,
      status: 'APPROVED',
      authorId: owner,
      snapshot: { unitPriceTnd: '15.000', provenance: 'SYNTHETIC', scenarioId },
    },
  });
  const terms = {
    quoteVersion: 1,
    buyer: buyer.name,
    title: rfq.title,
    specification: rfq.specification,
    craftSkillId: craft.id,
    quantity: 10,
    unit: 'PIECES',
    unitPriceTnd: '15.000',
    totalTnd: '150.000',
    currency: 'TND',
    deliveryAt: deliveryAt.toISOString(),
    deliveryLocation: rfq.deliveryLocation,
    deliveryConditions: 'Synthetic delivery; buyer confirmation does not prove real transport.',
    paymentTerms: 'Synthetic terms; no payment or tax confirmation.',
    expiresAt: offerExpiresAt.toISOString(),
    taxStatus: 'PENDING_LEGAL_REVIEW',
    taxTnd: '',
    conditional: false,
    feasibilityVersion: 1,
    costVersion: 1,
    capacityReserved: false,
    artisanAccepted: false,
    paymentReceived: false,
    provenance: 'SYNTHETIC',
    legalStatus: 'DEMO_ONLY_NOT_A_BINDING_CONTRACT',
  };
  const hash = commercialTermsHash(terms);
  const quote = await tx.procurementQuote.create({
    data: {
      rfqId: rfq.id,
      version: 1,
      revisionId: revision.id,
      authorId: owner,
      totalMillimes: 150000n,
      expiresAt: offerExpiresAt,
      feasibilityAssessmentId: feasibility.id,
      costEstimateId: cost.id,
      termsSha256: hash,
      snapshot: {
        ...specificationSnapshot(rfq),
        buyer: { id: buyer.id, name: buyer.name },
        buyerTerms: { ...terms, termsSha256: hash },
        internal: {
          components,
          subtotalTnd: '120.000',
          marginMethod: 'MARKUP_ON_COST',
          marginBasisPoints: 2500,
          feasibilityResult: 'FEASIBLE',
        },
        totalTnd: '150.000',
        currency: 'TND',
        taxStatus: 'PENDING_LEGAL_REVIEW',
      },
    },
  });
  await tx.procurementDocument.create({
    data: {
      rfqId: rfq.id,
      authorId: owner,
      kind: 'QUOTE',
      version: 1,
      content: {
        quoteId: quote.id,
        quoteVersion: 1,
        termsSha256: hash,
        provenance: 'SYNTHETIC',
        legalStatus: 'DEMO_ONLY_NOT_A_TAX_OR_LEGAL_DOCUMENT',
      },
    },
  });
  const seedSpec: DemoSeedSpec = {
    version: DEMO_SEED_VERSION,
    quoteId: quote.id,
    linkedArtisanId: linked.id,
    accountlessArtisanId: accountless.id,
    buyerOrganizationId: buyer.id,
    operatorOrganizationId: internal.id,
    associationOrganizationId: association.id,
    craftSkillId: craft.id,
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
    offerExpiresAt: offerExpiresAt.toISOString(),
    deliveryAt: deliveryAt.toISOString(),
    initialTotals: initialDemoTotals,
  };
  // Batch 8–11 demonstration records. Every row belongs to this generation's organizations, so a
  // reset archives them with the scenario and a new generation never sees them.
  const recommendationPolicy = await tx.recommendationPolicy.upsert({
    where: { version: C.PLANNING_POLICY_VERSION },
    create: {
      version: C.PLANNING_POLICY_VERSION,
      name: 'SYNTHETIC deterministic eligibility ranking',
      inputs: {
        weights: C.rankingWeights,
        provenance: 'SYNTHETIC',
        criteria: [
          'craft',
          'declared availability',
          'free capacity',
          'accepted commitments',
          'equipment',
        ],
      },
      excluded: [
        'wearable participation',
        'health or strain records',
        'protected demographics',
        'offer decline history',
      ],
      active: true,
    },
    update: {},
  });
  const specification = await tx.productSpecification.create({
    data: {
      craftSkillId: craft.id,
      productCode: `SYNTH-RUNNER-${scenarioId.slice(0, 6).toUpperCase()}`,
      name: 'SYNTHETIC — Embroidered table runner',
      ownerOrganizationId: internal.id,
      authorId: owner,
      revisions: {
        create: {
          revisionNumber: 1,
          status: 'DRAFT',
          description:
            'Synthetic draft design; review, sample consent and buyer approval are still required.',
          dimensions: '40 × 120',
          unit: 'cm',
          materials: [
            { materialCode: 'COTTON', name: 'Cotton cloth', quantity: '1.200', unit: 'METERS' },
          ],
          instructions: 'Synthetic stitching instructions for demonstration only.',
          tolerances: '± 5 mm, synthetic tolerance.',
          qualityCriteria: 'Even border, no loose thread, synthetic criteria.',
          referenceImages: [],
          authorId: owner,
        },
      },
    },
    include: { revisions: true },
  });
  for (const category of ['PRODUCTION_EXCEPTION', 'SUPPORT_CASE_UPDATE'] as const)
    await tx.notificationPreference.upsert({
      where: {
        userId_channel_category: { userId: users.artisan, channel: 'IN_APP', category },
      },
      create: { userId: users.artisan, channel: 'IN_APP', category, optedIn: true },
      update: {},
    });
  await tx.auditEvent.create({
    data: {
      actorId: owner,
      action: 'demo.planning.seeded',
      targetType: 'RecommendationPolicy',
      targetId: recommendationPolicy.id,
      organizationId: internal.id,
      correlationId: randomUUID(),
      reason: 'Synthetic planning, catalogue and collaboration demonstration records.',
      after: {
        policyVersion: recommendationPolicy.version,
        specificationRevision: specification.revisions[0].revisionNumber,
        provenance: 'SYNTHETIC',
      },
    },
  });
  const scenario = await tx.demoScenario.create({
    data: {
      id: scenarioId,
      visitorId,
      generation,
      version: DEMO_SEED_VERSION,
      seedSpec: JSON.parse(JSON.stringify(seedSpec)),
      organizationIds: [buyer.id, internal.id, association.id],
      rfqId: rfq.id,
    },
  });
  for (const persona of DEMO_PERSONAS)
    await tx.demoIdentity.create({
      data: { scenarioId, userId: users[persona.id], persona: persona.id },
    });
  await tx.demoVisitor.update({ where: { id: visitorId }, data: { activeScenarioId: scenarioId } });
  await tx.auditEvent.create({
    data: {
      actorId: owner,
      action: 'demo.scenario.seeded',
      targetType: 'DemoScenario',
      targetId: scenarioId,
      organizationId: internal.id,
      correlationId: randomUUID(),
      reason: 'Versioned visitor-owned synthetic scenario; no production or verified evidence',
      after: { generation, version: DEMO_SEED_VERSION, provenance: 'SYNTHETIC' },
    },
  });
  return scenario;
}
