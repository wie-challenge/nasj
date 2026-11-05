import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { createApp } from '../apps/api/src/app.js';
import { logger } from '../apps/api/src/common/logging.js';
import { validateEnvironment } from '../apps/api/src/config/env.js';
import { PrismaService } from '../apps/api/src/database/prisma.service.js';
import { AuthService } from '../apps/api/src/modules/auth/auth.service.js';
import { renderLetter } from '../apps/api/src/modules/market/market-invoice.js';
import type { BusinessRole } from '../packages/contracts/src/permissions.js';
import { assertLocalDevelopment } from './local-development.js';

// Fictional organizations and people for local testing and the recorded walkthrough.
const password = 'Nasj-Test-2026!';
const orgs = [
  {
    slug: 'nasj-team',
    name: 'NASJ',
    type: 'INTERNAL',
    region: 'Head office',
    description: 'The NASJ team.',
    representative: 'Sara Bennett',
    email: 'hello@nasj.example',
    status: 'APPROVED',
  },
  {
    slug: 'harbor-events',
    name: 'Harbor Events',
    type: 'BUYER_BUSINESS',
    region: 'Capital region',
    description: 'Corporate events and employee gifts for companies.',
    representative: 'Emma Clarke',
    email: 'emma@harbor-events.example',
    status: 'APPROVED',
  },
  {
    slug: 'golden-thread',
    name: 'Golden Thread Association',
    type: 'ASSOCIATION',
    region: 'Coastal region',
    description: 'Brings together women embroiderers and potters.',
    representative: 'Laura Hayes',
    email: 'laura@golden-thread.example',
    status: 'APPROVED',
  },
  {
    slug: 'green-hands',
    name: 'Green Hands Cooperative',
    type: 'PARTNER_COOPERATIVE',
    region: 'Northern region',
    description: 'A cooperative of women weavers and basket makers.',
    representative: 'Helen Moore',
    email: 'helen@green-hands.example',
    status: 'APPROVED',
  },
  {
    slug: 'bright-consulting',
    name: 'Bright Consulting',
    type: 'BUYER_BUSINESS',
    region: 'Eastern region',
    description: 'A consulting firm looking for end of year gifts for its clients.',
    representative: 'Daniel Reed',
    email: 'daniel@bright-consulting.example',
    status: 'PENDING_REVIEW',
  },
  {
    slug: 'silver-loom',
    name: 'Silver Loom Association',
    type: 'ASSOCIATION',
    region: 'Central region',
    description: 'Supports women carpet weavers in rural areas.',
    representative: 'Sophie Grant',
    email: 'sophie@silver-loom.example',
    status: 'PENDING_REVIEW',
  },
] as const;
type Slug = (typeof orgs)[number]['slug'];
const people: {
  key: string;
  name: string;
  email: string;
  org: Slug;
  roles: BusinessRole[];
  admin?: boolean;
  manager?: boolean;
  coordinator?: boolean;
}[] = [
  {
    key: 'admin',
    name: 'Sara Bennett',
    email: 'admin@nasj.example',
    org: 'nasj-team',
    roles: [],
    admin: true,
  },
  {
    key: 'operator',
    name: 'Oliver Stone',
    email: 'operator@nasj.example',
    org: 'nasj-team',
    roles: ['NASJ_OPERATOR'],
  },
  {
    key: 'coordinator',
    name: 'Nora Wells',
    email: 'coordinator@nasj.example',
    org: 'nasj-team',
    roles: ['INVENTORY_LOGISTICS_COORDINATOR'],
  },
  {
    key: 'finance',
    name: 'Julia Ford',
    email: 'finance@nasj.example',
    org: 'nasj-team',
    roles: ['FINANCE_MANAGER'],
  },
  {
    key: 'company',
    name: 'Emma Clarke',
    email: 'emma@harbor-events.example',
    org: 'harbor-events',
    roles: ['BUYER_REPRESENTATIVE'],
    manager: true,
  },
  {
    key: 'association',
    name: 'Laura Hayes',
    email: 'laura@golden-thread.example',
    org: 'golden-thread',
    roles: ['ASSOCIATION_COORDINATOR'],
    manager: true,
    coordinator: true,
  },
  {
    key: 'cooperative',
    name: 'Helen Moore',
    email: 'helen@green-hands.example',
    org: 'green-hands',
    roles: ['ASSOCIATION_COORDINATOR'],
    manager: true,
    coordinator: true,
  },
  {
    key: 'newcompany',
    name: 'Daniel Reed',
    email: 'daniel@bright-consulting.example',
    org: 'bright-consulting',
    roles: ['BUYER_REPRESENTATIVE'],
    manager: true,
  },
  {
    key: 'newassociation',
    name: 'Sophie Grant',
    email: 'sophie@silver-loom.example',
    org: 'silver-loom',
    roles: ['ASSOCIATION_COORDINATOR'],
    manager: true,
  },
];
const artisanes: {
  name: string;
  org: Slug;
  owner: string;
  region: string;
  id: string;
  skills: string[];
}[] = [
  {
    name: 'Maya Collins',
    org: 'golden-thread',
    owner: 'association',
    region: 'Coastal region',
    id: 'ID-48213',
    skills: ['Embroidery'],
  },
  {
    name: 'Anna Brooks',
    org: 'golden-thread',
    owner: 'association',
    region: 'Coastal region',
    id: 'ID-48391',
    skills: ['Embroidery', 'Crochet'],
  },
  {
    name: 'Clara Young',
    org: 'golden-thread',
    owner: 'association',
    region: 'Coastal region',
    id: 'ID-48522',
    skills: ['Pottery'],
  },
  {
    name: 'Rosa Bell',
    org: 'green-hands',
    owner: 'cooperative',
    region: 'Northern region',
    id: 'ID-51047',
    skills: ['Weaving'],
  },
  {
    name: 'Eva Lane',
    org: 'green-hands',
    owner: 'cooperative',
    region: 'Northern region',
    id: 'ID-51188',
    skills: ['Basket making', 'Weaving'],
  },
];
const products: {
  slug: string;
  name: string;
  description: string;
  craft: string;
  org: Slug;
  price: bigint;
  pay: bigint;
  lead: number;
  min: number;
  status?: string;
}[] = [
  {
    slug: 'embroidered-cushion',
    name: 'Embroidered cushion cover',
    description: 'Hand-embroidered cotton cover, 45 x 45 cm, in traditional patterns.',
    craft: 'Embroidery',
    org: 'golden-thread',
    price: 68000n,
    pay: 40000n,
    lead: 14,
    min: 10,
  },
  {
    slug: 'crochet-table',
    name: 'Crochet sun hat',
    description: 'Colourful crocheted cotton hat with a fabric flower.',
    craft: 'Crochet',
    org: 'golden-thread',
    price: 42000n,
    pay: 25000n,
    lead: 10,
    min: 10,
  },
  {
    slug: 'crochet-throw',
    name: 'Crochet throw',
    description: 'Soft multicolour throw, about 120 x 150 cm.',
    craft: 'Crochet',
    org: 'golden-thread',
    price: 145000n,
    pay: 90000n,
    lead: 21,
    min: 5,
  },
  {
    slug: 'ceramic-bowl',
    name: 'Handmade ceramic bowl',
    description: 'Wheel-thrown stoneware bowl, 16 cm, food safe glaze.',
    craft: 'Pottery',
    org: 'golden-thread',
    price: 38000n,
    pay: 21000n,
    lead: 12,
    min: 20,
  },
  {
    slug: 'blue-bowl',
    name: 'Painted serving bowl',
    description: 'White serving bowl with green hand-painted patterns, 22 cm.',
    craft: 'Pottery',
    org: 'golden-thread',
    price: 55000n,
    pay: 31000n,
    lead: 14,
    min: 10,
  },
  {
    slug: 'ceramic-mug',
    name: 'Hand-painted mug',
    description: 'Handmade 300 ml mug, painted by hand. A favourite for employee gifts.',
    craft: 'Pottery',
    org: 'golden-thread',
    price: 28000n,
    pay: 15000n,
    lead: 10,
    min: 25,
  },
  {
    slug: 'painted-plate',
    name: 'Hand-painted plate',
    description: 'Decorative plate, 30 cm, painted by hand.',
    craft: 'Pottery',
    org: 'golden-thread',
    price: 72000n,
    pay: 42000n,
    lead: 16,
    min: 10,
  },
  {
    slug: 'clay-vase',
    name: 'Clay vase',
    description: 'Rounded vase with a painted flower pattern, 24 cm.',
    craft: 'Pottery',
    org: 'golden-thread',
    price: 64000n,
    pay: 36000n,
    lead: 14,
    min: 10,
    status: 'PENDING_REVIEW',
  },
  {
    slug: 'kilim',
    name: 'Wool kilim rug',
    description: 'Flat-woven wool rug, 80 x 150 cm, in natural dyes.',
    craft: 'Weaving',
    org: 'green-hands',
    price: 320000n,
    pay: 210000n,
    lead: 30,
    min: 2,
  },
  {
    slug: 'kilim-runner',
    name: 'Small kilim runner',
    description: 'Narrow flat-woven runner in natural dyes, 60 x 180 cm.',
    craft: 'Weaving',
    org: 'green-hands',
    price: 150000n,
    pay: 45000n,
    lead: 21,
    min: 3,
    status: 'PENDING_REVIEW',
  },
  {
    slug: 'woven-throw',
    name: 'Woven plaid throw',
    description: 'Hand-woven wool blend throw, 130 x 170 cm.',
    craft: 'Weaving',
    org: 'green-hands',
    price: 165000n,
    pay: 100000n,
    lead: 21,
    min: 5,
  },
  {
    slug: 'gift-basket',
    name: 'Woven gift basket',
    description: 'Hand-woven natural fiber basket with handles, ideal for gift sets.',
    craft: 'Basket making',
    org: 'green-hands',
    price: 45000n,
    pay: 27000n,
    lead: 12,
    min: 15,
  },
  {
    slug: 'colour-baskets',
    name: 'Colourful basket trio',
    description: 'Three nesting baskets woven with dyed fibers.',
    craft: 'Basket making',
    org: 'green-hands',
    price: 78000n,
    pay: 47000n,
    lead: 14,
    min: 10,
  },
  {
    slug: 'storage-basket',
    name: 'Large storage basket',
    description: 'Oval lidded basket for home or office storage.',
    craft: 'Basket making',
    org: 'green-hands',
    price: 95000n,
    pay: 58000n,
    lead: 18,
    min: 5,
  },
];
const billing = {
  legalName: 'Harbor Events LLC',
  taxId: '1234567/A/M/000',
  billingAddress: '12 Harbor Street, Capital region',
  shippingAddress: '12 Harbor Street, Capital region',
  contactName: 'Emma Clarke',
  contactPhone: '+000 55 010 200',
  paymentMethod: 'DHMAD',
};
const samplePdf = (organization: string) =>
  renderLetter(
    'Mandate letter (sample)',
    `This sample letter states that the applicant represents ${organization}.`,
  );

assertLocalDevelopment(process.env);
logger.level = 'silent';
const config = validateEnvironment(process.env);
const app = await createApp(config);
try {
  const db = app.get(PrismaService);
  const auth = app.get(AuthService);
  if (process.argv.includes('--reset')) {
    const seededOrgs = orgs.map((org) => org.slug as string);
    const seededEmails = people.map((person) => person.email);
    const seededImages = products.map((product) => `/marketplace/${product.slug}.jpg`);
    await db.marketNotification.deleteMany();
    await db.marketOrder.deleteMany();
    await db.marketCartItem.deleteMany();
    await db.marketFile.deleteMany({
      where: { purpose: { in: ['ORDER_PHOTO', 'PAYMENT_PROOF', 'PRODUCT_IMAGE'] } },
    });
    await db.marketProduct.deleteMany({
      where: { OR: [{ imagePath: null }, { imagePath: { notIn: seededImages } }] },
    });
    await db.$executeRaw`ALTER SEQUENCE "MarketOrder_number_seq" RESTART WITH 1001`;
    // Audit history cannot be deleted, so anything created while testing is retired instead.
    const added = await db.organization.findMany({
      where: {
        type: { not: 'INTERNAL' },
        slug: { notIn: seededOrgs },
        NOT: { slug: { startsWith: 'demo-' } },
      },
    });
    for (const org of added) {
      await db.organization.update({
        where: { id: org.id },
        data: { slug: `demo-archived-${org.slug}`, approvalStatus: 'REJECTED' },
      });
      await db.organizationMember.updateMany({
        where: { organizationId: org.id },
        data: { status: 'LEFT' },
      });
      await db.marketBillingProfile.deleteMany({ where: { buyerOrgId: org.id } });
    }
    const extraUsers = await db.user.findMany({
      where: {
        email: { notIn: seededEmails },
        NOT: [{ email: { endsWith: '-demo.invalid' } }, { email: { startsWith: 'archived-' } }],
      },
      select: { id: true },
    });
    for (const user of extraUsers) {
      await db.organizationMember.updateMany({
        where: { userId: user.id },
        data: { status: 'LEFT' },
      });
      await db.user.update({
        where: { id: user.id },
        data: { email: `archived-${user.id}@example.invalid` },
      });
    }
    await db.invitation.deleteMany({
      where: { organization: { slug: { in: seededOrgs } } },
    });
    await db.artisanManagement.updateMany({
      where: {
        endedAt: null,
        artisan: { displayName: { notIn: artisanes.map((a) => a.name) } },
        organization: { slug: { in: seededOrgs } },
      },
      data: { endedAt: new Date() },
    });
    await db.organization.updateMany({
      where: { slug: { in: ['bright-consulting', 'silver-loom'] } },
      data: {
        approvalStatus: 'PENDING_REVIEW',
        approvedByUserId: null,
        approvedAt: null,
        approvalReason: null,
      },
    });
    await db.organizationMember.updateMany({
      where: { organization: { slug: { in: ['bright-consulting', 'silver-loom'] } } },
      data: { isCoordinator: false },
    });
    await db.session.deleteMany();
    await db.rateBucket.deleteMany();
  }
  const users = new Map<string, string>();
  for (const person of people) {
    if (!(await db.user.findUnique({ where: { email: person.email } })))
      await auth.auth.api.signUpEmail({
        body: { name: person.name, email: person.email, password },
      });
    const user = await db.user.update({
      where: { email: person.email },
      data: {
        name: person.name,
        emailVerified: true,
        status: 'ACTIVE',
        role: person.admin ? 'ADMIN' : 'USER',
      },
    });
    users.set(person.key, user.id);
  }
  const uid = (key: string) => users.get(key) as string;
  const orgIds = new Map<string, string>();
  for (const org of orgs) {
    const row = await db.organization.upsert({
      where: { slug: org.slug },
      update: {},
      create: {
        slug: org.slug,
        name: org.name,
        type: org.type,
        country: 'TN',
        region: org.region,
        description: org.description,
        representativeName: org.representative,
        contactEmail: org.email,
        approvalStatus: org.status,
        createdByUserId: uid('admin'),
        ...(org.status === 'APPROVED'
          ? {
              approvedByUserId: uid('admin'),
              approvedAt: new Date(),
              approvalReason: 'Proof reviewed.',
            }
          : {}),
      },
    });
    orgIds.set(org.slug, row.id);
  }
  const oid = (slug: string) => orgIds.get(slug) as string;
  for (const person of people) {
    const membership = await db.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: oid(person.org), userId: uid(person.key) },
      },
      update: {},
      create: {
        organizationId: oid(person.org),
        userId: uid(person.key),
        isManager: Boolean(person.manager),
        isCoordinator: Boolean(person.coordinator),
      },
    });
    for (const role of person.roles)
      await db.membershipRole.upsert({
        where: { membershipId_role: { membershipId: membership.id, role } },
        update: {},
        create: { membershipId: membership.id, role, assignedByUserId: uid('admin') },
      });
  }
  const skillIds = new Map<string, string>();
  for (const name of ['Embroidery', 'Crochet', 'Weaving', 'Basket making', 'Pottery']) {
    const skill = await db.craftSkill.upsert({
      where: { name },
      update: {},
      create: { name, category: 'Craft', description: name },
    });
    skillIds.set(name, skill.id);
  }
  const artisaneIds = new Map<string, string>();
  for (const artisane of artisanes) {
    const found = await db.artisanProfile.findFirst({ where: { displayName: artisane.name } });
    const profile =
      found ??
      (await db.artisanProfile.create({
        data: {
          createdById: uid(artisane.owner),
          displayName: artisane.name,
          region: artisane.region,
          preferredLanguage: 'ar',
          experienceDescription: `${artisane.skills.join(', ')} artisan.`,
          equipment: [],
        },
      }));
    artisaneIds.set(artisane.name, profile.id);
    await db.marketArtisanDetail.upsert({
      where: { artisanProfileId: profile.id },
      update: {},
      create: { artisanProfileId: profile.id, idNumber: artisane.id },
    });
    if (found) continue;
    await db.artisanManagement.create({
      data: {
        artisanProfileId: profile.id,
        organizationId: oid(artisane.org),
        recordedById: uid(artisane.owner),
        reason: 'Works with this association.',
      },
    });
    await db.artisanAssignment.create({
      data: {
        artisanProfileId: profile.id,
        organizationId: oid(artisane.org),
        coordinatorId: uid(artisane.owner),
        assignedById: uid('admin'),
        reason: 'Works with this association.',
      },
    });
    for (const skill of artisane.skills)
      await db.artisanSkill.create({
        data: {
          artisanProfileId: profile.id,
          craftSkillId: skillIds.get(skill) as string,
          proficiency: 'ADVANCED',
        },
      });
  }
  const productIds = new Map<string, string>();
  for (const product of products) {
    const existing = await db.marketProduct.findFirst({
      where: { imagePath: `/marketplace/${product.slug}.jpg` },
    });
    const data = {
      associationId: oid(product.org),
      name: product.name,
      description: product.description,
      craft: product.craft,
      priceMillimes: product.price,
      artisanPayMillimes: product.pay,
      leadTimeDays: product.lead,
      minQuantity: product.min,
      imagePath: `/marketplace/${product.slug}.jpg`,
      status: product.status ?? 'APPROVED',
      createdById: uid(product.org === 'golden-thread' ? 'association' : 'cooperative'),
    };
    const row = existing
      ? await db.marketProduct.update({ where: { id: existing.id }, data })
      : await db.marketProduct.create({ data });
    productIds.set(product.slug, row.id);
  }
  for (const org of ['bright-consulting', 'silver-loom'] as const) {
    if (
      await db.marketFile.findFirst({ where: { organizationId: oid(org), purpose: 'ORG_PROOF' } })
    )
      continue;
    const bytes = await samplePdf(orgs.find((item) => item.slug === org)?.name ?? '');
    await db.marketFile.create({
      data: {
        organizationId: oid(org),
        purpose: 'ORG_PROOF',
        filename: 'mandate-letter.pdf',
        mime: 'application/pdf',
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        uploadedById: uid(org === 'silver-loom' ? 'newassociation' : 'newcompany'),
      },
    });
  }
  await db.marketBillingProfile.upsert({
    where: { buyerOrgId: oid('harbor-events') },
    update: {},
    create: { ...billing, buyerOrgId: oid('harbor-events') },
  });
  if (!(await db.marketOrder.count({ where: { buyerOrgId: oid('harbor-events') } }))) {
    const dayMs = 24 * 60 * 60 * 1000;
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * dayMs);
    const isoDate = (daysAgo: number) => at(daysAgo).toISOString().slice(0, 10);
    const carrier = {
      carrier: 'Swift Courier',
      driverName: 'Tom Walsh',
      driverPhone: '+000 55 010 300',
    };
    const place = async (input: {
      slug: string;
      quantity: number;
      status: string;
      association: Slug;
      artisane?: string;
      quality?: string;
      accepted?: number;
      assigned?: number;
      finish?: number;
      almost?: number;
      toNasj?: number;
      shipped?: number;
      qr?: string;
      paid?: boolean;
      steps: [string, string, string, number][];
    }) => {
      const spec = products.find((item) => item.slug === input.slug);
      if (!spec) throw new Error('Unknown product');
      const owner = input.association === 'golden-thread' ? 'association' : 'cooperative';
      await db.marketOrder.create({
        data: {
          buyerOrgId: oid('harbor-events'),
          associationId: oid(input.association),
          kind: 'CATALOG',
          status: input.status,
          title: spec.name,
          quantity: input.quantity,
          billingSnapshot: billing,
          totalMillimes: spec.price * BigInt(input.quantity),
          artisanPayMillimes: spec.pay * BigInt(input.quantity),
          qualityStatus: input.quality ?? 'NOT_CHECKED',
          acceptedAt: input.accepted === undefined ? null : at(input.accepted),
          assignedAt: input.assigned === undefined ? null : at(input.assigned),
          estimatedFinishAt: input.finish === undefined ? null : at(input.finish),
          almostReadyAt: input.almost === undefined ? null : at(input.almost),
          associationDelivery:
            input.toNasj === undefined
              ? undefined
              : { ...carrier, expectedOn: isoDate(input.toNasj) },
          nasjDelivery:
            input.shipped === undefined
              ? undefined
              : { ...carrier, expectedOn: isoDate(input.shipped), tracking: 'SC-20418' },
          qrToken: input.qr,
          createdById: uid('company'),
          createdAt: at(input.steps[0]?.[3] ?? 0),
          items: {
            create: {
              productId: productIds.get(input.slug) as string,
              name: spec.name,
              quantity: input.quantity,
              unitPriceMillimes: spec.price,
              unitPayMillimes: spec.pay,
            },
          },
          events: {
            create: input.steps.map(([status, title, who, daysAgo]) => ({
              status,
              title,
              actorId: uid(who),
              actorName: people.find((person) => person.key === who)?.name ?? 'NASJ',
              createdAt: at(daysAgo),
            })),
          },
          ...(input.artisane
            ? {
                women: {
                  create: {
                    artisanProfileId: artisaneIds.get(input.artisane) as string,
                    recordedById: uid(owner),
                    payMillimes: spec.pay * BigInt(input.quantity),
                    paidRecordedAt: input.paid ? at(4) : null,
                  },
                },
              }
            : {}),
        },
      });
    };
    await place({
      slug: 'ceramic-mug',
      quantity: 50,
      status: 'DELIVERED',
      association: 'golden-thread',
      artisane: 'Clara Young',
      quality: 'PASSED',
      accepted: 22,
      assigned: 22,
      finish: 10,
      almost: 11,
      toNasj: 9,
      shipped: 6,
      qr: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      paid: true,
      steps: [
        ['SENT', 'Request sent', 'company', 24],
        ['AWAITING_APPROVAL', 'Sent to Golden Thread Association', 'coordinator', 23],
        ['WORKING', 'Accepted by the association', 'association', 22],
        ['WORKING', 'Artisanes assigned, work started', 'association', 22],
        ['WORKING', 'Almost ready', 'association', 11],
        ['WORKING', 'On the way to NASJ', 'association', 10],
        ['AT_NASJ', 'Delivered to NASJ', 'coordinator', 9],
        ['AT_NASJ', 'Quality check passed', 'coordinator', 8],
        ['ON_THE_WAY', 'Packed with its QR code and on the way', 'coordinator', 7],
        ['DELIVERED', 'Delivered, confirmed by the company', 'company', 5],
      ],
    });
    await place({
      slug: 'colour-baskets',
      quantity: 20,
      status: 'ON_THE_WAY',
      association: 'green-hands',
      artisane: 'Eva Lane',
      quality: 'PASSED',
      accepted: 16,
      assigned: 16,
      finish: 5,
      almost: 6,
      toNasj: 5,
      shipped: -2,
      qr: 'f0e1d2c3b4a5968778695a4b3c2d1e0f',
      steps: [
        ['SENT', 'Request sent', 'company', 18],
        ['AWAITING_APPROVAL', 'Sent to Green Hands Cooperative', 'coordinator', 17],
        ['WORKING', 'Accepted by the association', 'cooperative', 16],
        ['WORKING', 'Artisanes assigned, work started', 'cooperative', 16],
        ['WORKING', 'Almost ready', 'cooperative', 6],
        ['WORKING', 'On the way to NASJ', 'cooperative', 5],
        ['AT_NASJ', 'Delivered to NASJ', 'coordinator', 4],
        ['AT_NASJ', 'Quality check passed', 'coordinator', 3],
        ['ON_THE_WAY', 'Packed with its QR code and on the way', 'coordinator', 1],
      ],
    });
    await place({
      slug: 'gift-basket',
      quantity: 30,
      status: 'WORKING',
      association: 'green-hands',
      artisane: 'Rosa Bell',
      accepted: 4,
      assigned: 3,
      finish: -9,
      steps: [
        ['SENT', 'Request sent', 'company', 6],
        ['AWAITING_APPROVAL', 'Sent to Green Hands Cooperative', 'coordinator', 5],
        ['WORKING', 'Accepted by the association', 'cooperative', 4],
        ['WORKING', 'Artisanes assigned, work started', 'cooperative', 3],
      ],
    });
    await place({
      slug: 'embroidered-cushion',
      quantity: 20,
      status: 'AWAITING_APPROVAL',
      association: 'golden-thread',
      steps: [
        ['SENT', 'Request sent', 'company', 2],
        ['AWAITING_APPROVAL', 'Sent to Golden Thread Association', 'coordinator', 1],
      ],
    });
  }
  for (const payment of await db.marketOrderArtisan.findMany({
    where: { paidRecordedAt: { not: null }, paymentProofFileId: null },
    include: { order: { select: { associationId: true } } },
  })) {
    const bytes = await renderLetter(
      'Payment receipt (sample)',
      'This sample receipt shows that the artisane received her payment.',
    );
    const file = await db.marketFile.create({
      data: {
        organizationId: payment.order.associationId as string,
        purpose: 'PAYMENT_PROOF',
        filename: 'payment-receipt.pdf',
        mime: 'application/pdf',
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        uploadedById: payment.recordedById,
      },
    });
    await db.marketOrderArtisan.update({
      where: { id: payment.id },
      data: { paymentProofFileId: file.id },
    });
  }
  const credentials = new URL('../.local/test-accounts.json', import.meta.url);
  await writeFile(
    credentials,
    `${JSON.stringify(
      { password, accounts: people.map(({ key, name, email }) => ({ key, name, email })) },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await chmod(credentials, 0o600);
  console.log(`${people.length} accounts and ${products.length} products are ready.`);
} finally {
  await app.close();
}
