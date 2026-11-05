import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  formatTnd,
  marketTotals,
  parseTnd,
  type IdentityContext,
  type MarketAssociationOption,
  type MarketCounts,
  type MarketNotificationsView,
  type MarketBilling,
  type MarketCartView,
  type MarketCheckout,
  type MarketCustomOrder,
  type MarketDelivery,
  type MarketFileInput,
  type MarketOrderStatus,
  type MarketOrderView,
  type MarketOrganizationView,
  type MarketPaymentView,
  type MarketPriceStatus,
  type MarketProductCreate,
  type MarketProductImport,
  type MarketProductView,
  type MarketQualityStatus,
  type MarketRating,
  type MarketReview,
  type MarketTrackView,
  type MarketWoman,
  type MarketWomanView,
} from '@nasj/contracts';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { fail } from '../../common/errors.js';
import { logger } from '../../common/logging.js';
import type { Actor } from '../../common/identity.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AccessService, partnerTypes } from '../foundation/access.service.js';
import { audit } from '../foundation/audit.js';
import { MailService } from '../mail/mail.service.js';
import { renderInvoice } from './market-invoice.js';

const orderInclude = {
  buyerOrg: { select: { name: true } },
  association: { select: { name: true } },
  items: {
    include: { product: { select: { imagePath: true, imageFileId: true, imageUrl: true } } },
  },
  events: { orderBy: { createdAt: 'asc' } },
  women: { include: { artisanProfile: { select: { id: true, displayName: true } } } },
  ratings: true,
} satisfies Prisma.MarketOrderInclude;
type OrderRow = Prisma.MarketOrderGetPayload<{ include: typeof orderInclude }>;
type ProductRow = Prisma.MarketProductGetPayload<{
  include: { association: { select: { name: true; region: true } } };
}>;
const productInclude = { association: { select: { name: true, region: true } } } as const;
const fixtureFree = { NOT: { slug: { startsWith: 'demo-' } } };
const fileUrl = (id: string) => `/api/v1/market/files/${id}`;
const defaultImage = '/marketplace/default.jpg';
const imageOf = (row: {
  imagePath: string | null;
  imageFileId: string | null;
  imageUrl: string | null;
}) =>
  row.imageFileId ? fileUrl(row.imageFileId) : (row.imageUrl ?? row.imagePath ?? defaultImage);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDay = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const totalsView = (subtotal: bigint) => {
  const totals = marketTotals(subtotal);
  return {
    subtotal: formatTnd(totals.subtotal),
    tva: formatTnd(totals.tva),
    stamp: formatTnd(totals.stamp),
    total: formatTnd(totals.total),
  };
};
// A company deals with NASJ and its products. Who makes them stays between NASJ and the association.
const companyAuthored = [
  'Request sent',
  'Custom request sent',
  'Cancelled by the company',
  'Price accepted by the company',
  'Company asked for a new price',
  'Delivered, confirmed by the company',
];
const companyTitles: Record<string, string> = {
  'Accepted by the association': 'Approved, work has started',
  'Price proposed, NASJ finance is checking it': 'NASJ is checking the price',
  'Finance asked for a new price': 'NASJ is reviewing the price',
  'Price ready for the company': 'Your price is ready',
  'Artisanes assigned, work started': 'Your order is being made',
  'Quality check failed, back to the association': 'NASJ asked for a quality fix',
  'Association could not take it, NASJ is finding another': 'NASJ is arranging your request',
};
const companyHidden = ['Almost ready', 'On the way to NASJ'];
// An order only becomes a real invoice once it is approved. Before that it stays a pro forma.
const approvedStatuses = ['WORKING', 'AT_NASJ', 'ON_THE_WAY', 'DELIVERED'];
type Audience = 'company' | 'association' | 'operator' | 'coordinator' | 'finance';
const internalRoles = {
  operator: ['NASJ_OPERATOR'],
  coordinator: ['INVENTORY_LOGISTICS_COORDINATOR', 'PRODUCTION_MANAGER'],
  finance: ['FINANCE_MANAGER'],
} as const;
// Who hears about each step of an order. Company messages never name who is making it.
const journeyMessages: { match: string; send: [Audience, (order: string) => string][] }[] = [
  { match: 'Request sent', send: [['coordinator', (o) => `New request: ${o}`]] },
  { match: 'Custom request sent', send: [['coordinator', (o) => `New custom request: ${o}`]] },
  { match: 'Sent to ', send: [['association', (o) => `New request from NASJ: ${o}`]] },
  {
    match: 'Accepted by the association',
    send: [
      ['company', (o) => `NASJ is working on your request: ${o}`],
      ['coordinator', (o) => `The association accepted: ${o}`],
    ],
  },
  {
    match: 'Association could not take it',
    send: [['coordinator', (o) => `Declined, choose another association: ${o}`]],
  },
  { match: 'Price proposed', send: [['finance', (o) => `Price to check: ${o}`]] },
  { match: 'Finance asked', send: [['association', (o) => `NASJ asked for a new price: ${o}`]] },
  { match: 'Price ready', send: [['company', (o) => `Your price is ready: ${o}`]] },
  {
    match: 'Price accepted',
    send: [['association', (o) => `Price accepted, assign the artisanes: ${o}`]],
  },
  { match: 'Company asked', send: [['association', (o) => `A new price is needed: ${o}`]] },
  {
    match: 'Artisanes assigned',
    send: [
      ['company', (o) => `Your order is being made: ${o}`],
      ['coordinator', (o) => `Work has started: ${o}`],
    ],
  },
  { match: 'Almost ready', send: [['coordinator', (o) => `Almost ready: ${o}`]] },
  { match: 'On the way to NASJ', send: [['coordinator', (o) => `Coming to NASJ: ${o}`]] },
  { match: 'Delivered to NASJ', send: [['association', (o) => `NASJ received: ${o}`]] },
  {
    match: 'Quality check failed',
    send: [['association', (o) => `Quality fix needed: ${o}`]],
  },
  {
    match: 'Packed with its QR code',
    send: [
      ['company', (o) => `Your order is on the way: ${o}`],
      ['association', (o) => `On the way to the company: ${o}`],
    ],
  },
  {
    match: 'Delivered, confirmed',
    send: [
      ['association', (o) => `Delivered, please rate: ${o}`],
      ['coordinator', (o) => `Delivered: ${o}`],
      ['finance', (o) => `Delivered, invoice to check: ${o}`],
    ],
  },
  {
    match: 'Cancelled by the company',
    send: [
      ['coordinator', (o) => `Cancelled: ${o}`],
      ['association', (o) => `Cancelled: ${o}`],
    ],
  },
];
function companyEvent(event: { title: string; note: string | null; actorName: string }) {
  if (companyAuthored.includes(event.title)) return event;
  const title = event.title.startsWith('Sent to ')
    ? 'NASJ is arranging your request'
    : (companyTitles[event.title] ?? event.title);
  return { title, note: null, actorName: 'NASJ' };
}

@Injectable()
export class MarketService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private has(context: IdentityContext, ...personas: IdentityContext['personas']) {
    return personas.some((persona) => context.personas.includes(persona));
  }
  private async require(actor: Actor, ...personas: IdentityContext['personas']) {
    const context = await this.access.context(actor);
    if (!this.has(context, 'PLATFORM_ADMIN', ...personas))
      fail(403, 'FORBIDDEN', 'Your role does not include this action.');
    return context;
  }
  private buyerOrg(context: IdentityContext) {
    const org = context.organizations.find(
      (item) => item.type === 'BUYER_BUSINESS' && item.approvalStatus === 'APPROVED',
    );
    if (!org) fail(403, 'FORBIDDEN', 'An approved company membership is required.');
    return org.id;
  }
  private associationOrg(context: IdentityContext) {
    if (!context.coordinatorOrganizationId)
      fail(403, 'FORBIDDEN', 'An approved association membership is required.');
    return context.coordinatorOrganizationId;
  }

  private productView(row: ProductRow, internal: boolean): MarketProductView {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      craft: row.craft,
      price: formatTnd(row.priceMillimes),
      ...(internal
        ? {
            artisanPay: formatTnd(row.artisanPayMillimes),
            associationId: row.associationId,
            associationName: row.association.name,
            associationRegion: row.association.region,
          }
        : {}),
      leadTimeDays: row.leadTimeDays,
      minQuantity: row.minQuantity,
      imageUrl: imageOf(row),
      status: row.status as MarketProductView['status'],
      reviewNote: internal ? row.reviewNote : null,
    };
  }
  private isBuyer(row: { buyerOrgId: string }, context: IdentityContext) {
    return context.organizations.some((org) => org.id === row.buyerOrgId);
  }
  private isAssociation(row: { associationId: string | null }, context: IdentityContext) {
    return Boolean(row.associationId) && context.coordinatorOrganizationId === row.associationId;
  }
  private isNasj(context: IdentityContext) {
    return this.has(context, 'PLATFORM_ADMIN', 'NASJ_COORDINATOR', 'NASJ_FINANCE');
  }
  private canRead(
    row: { buyerOrgId: string; associationId: string | null },
    context: IdentityContext,
  ) {
    return this.isNasj(context) || this.isBuyer(row, context) || this.isAssociation(row, context);
  }
  private orderView(row: OrderRow, context: IdentityContext): MarketOrderView {
    const company = this.isBuyer(row, context) && !this.isNasj(context);
    const association = this.isAssociation(row, context);
    const nasj = this.isNasj(context);
    const ratingRole = company ? 'COMPANY' : association ? 'ASSOCIATION' : null;
    return {
      id: row.id,
      code: `NSJ-${row.number}`,
      kind: row.kind as MarketOrderView['kind'],
      status: row.status as MarketOrderStatus,
      title: row.title,
      description: row.description,
      note: row.note,
      neededBy: isoDay(row.neededBy),
      photoUrl: row.photoFileId ? fileUrl(row.photoFileId) : null,
      quantity: row.quantity,
      buyerName: row.buyerOrg.name,
      totals: row.totalMillimes === null ? null : totalsView(row.totalMillimes),
      priceStatus: row.priceStatus as MarketPriceStatus,
      qualityStatus: row.qualityStatus as MarketQualityStatus,
      invoiceAvailable:
        (company || nasj) &&
        row.status !== 'CANCELLED' &&
        row.totalMillimes !== null &&
        row.billingSnapshot !== null,
      invoiceFinal: approvedStatuses.includes(row.status),
      estimatedFinish: isoDay(row.estimatedFinishAt),
      nasjDelivery: row.nasjDelivery as MarketDelivery | null,
      packed: Boolean(row.qrToken),
      ...(company
        ? {}
        : {
            associationId: row.associationId,
            associationName: row.association?.name ?? null,
            artisanPay: row.artisanPayMillimes === null ? null : formatTnd(row.artisanPayMillimes),
            acceptedAt: row.acceptedAt?.toISOString() ?? null,
            assignedAt: row.assignedAt?.toISOString() ?? null,
            almostReadyAt: row.almostReadyAt?.toISOString() ?? null,
            associationDelivery: row.associationDelivery as MarketDelivery | null,
            women: row.women.map((woman) => ({
              id: woman.artisanProfile.id,
              name: woman.artisanProfile.displayName,
              pay: formatTnd(woman.payMillimes),
              paidRecorded: Boolean(woman.paidRecordedAt),
              paymentChecked: Boolean(woman.paymentCheckedAt),
              proofUrl: woman.paymentProofFileId ? fileUrl(woman.paymentProofFileId) : null,
            })),
          }),
      ...(company || association
        ? {}
        : {
            invoiceCheckedAt: row.invoiceCheckedAt?.toISOString() ?? null,
          }),
      ...(company || nasj ? { billing: row.billingSnapshot as MarketBilling | null } : {}),
      items: row.items.map((item) => ({
        id: item.id,
        name: item.name,
        imageUrl: imageOf(item.product),
        quantity: item.quantity,
        unitPrice: formatTnd(item.unitPriceMillimes),
        ...(company ? {} : { unitPay: formatTnd(item.unitPayMillimes) }),
      })),
      ratings: row.ratings
        .filter((rating) => nasj || rating.role === ratingRole)
        .map((rating) => ({
          role: rating.role as 'COMPANY' | 'ASSOCIATION',
          stars: rating.stars,
          qualityStars: rating.qualityStars,
          comment: rating.comment,
        })),
      canRate:
        row.status === 'DELIVERED' &&
        ratingRole !== null &&
        !row.ratings.some((rating) => rating.role === ratingRole),
      events: row.events
        .filter((event) => !company || !companyHidden.includes(event.title))
        .map((event) => {
          const shown = company ? companyEvent(event) : event;
          return {
            id: event.id,
            status: event.status as MarketOrderStatus,
            title: shown.title,
            note: shown.note,
            actor: shown.actorName,
            at: event.createdAt.toISOString(),
          };
        }),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // Files
  async uploadFile(actor: Actor, input: MarketFileInput) {
    const context = await this.access.context(actor);
    if (!context.organizations.some((org) => org.id === input.organizationId))
      fail(403, 'FORBIDDEN', 'You can only upload files for your own organization.');
    if (input.purpose === 'ORG_PROOF' && input.mime !== 'application/pdf')
      fail(400, 'FILE_TYPE_REJECTED', 'Your proof must be a PDF file.');
    if (!['ORG_PROOF', 'PAYMENT_PROOF'].includes(input.purpose) && input.mime === 'application/pdf')
      fail(400, 'FILE_TYPE_REJECTED', 'Upload a PNG, JPEG or WebP image.');
    const bytes = Buffer.from(input.base64, 'base64');
    if (!bytes.length) fail(400, 'FILE_EMPTY', 'This file is empty.');
    if (input.mime === 'application/pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
      fail(400, 'FILE_TYPE_REJECTED', 'This file is not a valid PDF.');
    const file = await this.db.marketFile.create({
      data: {
        organizationId: input.organizationId,
        purpose: input.purpose,
        filename: input.filename,
        mime: input.mime,
        bytes,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        uploadedById: actor.id,
      },
      select: { id: true, filename: true },
    });
    if (input.purpose === 'ORG_PROOF')
      await this.notify('operator', null, 'A new application is waiting', '/nasj/organizations');
    return { ...file, url: fileUrl(file.id) };
  }
  async readFile(actor: Actor, id: string) {
    const context = await this.access.context(actor);
    const file = await this.db.marketFile.findUnique({ where: { id } });
    if (!file) fail(404, 'NOT_FOUND', 'File not found.');
    const own = context.organizations.some((org) => org.id === file.organizationId);
    let allowed = own || this.has(context, 'PLATFORM_ADMIN');
    if (!allowed && file.purpose === 'ORG_PROOF') allowed = this.has(context, 'NASJ_OPERATOR');
    if (!allowed && file.purpose === 'PRODUCT_IMAGE') allowed = true;
    if (!allowed && file.purpose === 'PAYMENT_PROOF') allowed = this.has(context, 'NASJ_FINANCE');
    if (!allowed && file.purpose === 'ORDER_PHOTO') {
      const order = await this.db.marketOrder.findFirst({ where: { photoFileId: id } });
      allowed = Boolean(order && this.canRead(order, context));
    }
    if (!allowed) fail(403, 'FORBIDDEN', 'You do not have access to this file.');
    return file;
  }

  // Products
  async listProducts(actor: Actor, query: { q?: string; craft?: string }) {
    await this.access.context(actor);
    const rows = await this.db.marketProduct.findMany({
      where: {
        status: 'APPROVED',
        ...(query.craft ? { craft: query.craft } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: [{ craft: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    return rows.map((row) => this.productView(row, false));
  }
  async myProducts(actor: Actor) {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const rows = await this.db.marketProduct.findMany({
      where: {
        associationId: this.associationOrg(context),
        status: { not: 'ARCHIVED' },
      },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((row) => this.productView(row, true));
  }
  private productData(
    associationId: string,
    actor: Actor,
    input: MarketProductImport['rows'][number],
  ) {
    const price = parseTnd(input.price);
    const pay = parseTnd(input.artisanPay);
    if (pay > price)
      fail(400, 'PAY_ABOVE_PRICE', `The artisanes' pay for ${input.name} is above its price.`);
    return {
      associationId,
      name: input.name,
      description: input.description,
      craft: input.craft,
      priceMillimes: price,
      artisanPayMillimes: pay,
      leadTimeDays: input.leadTimeDays,
      minQuantity: input.minQuantity,
      imageUrl: input.imageUrl ?? null,
      createdById: actor.id,
    };
  }
  private async checkImage(associationId: string, id?: string) {
    if (!id) return;
    const file = await this.db.marketFile.findFirst({
      where: { id, organizationId: associationId, purpose: 'PRODUCT_IMAGE' },
    });
    if (!file) fail(404, 'NOT_FOUND', 'Upload the product photo again.');
  }
  async createProduct(actor: Actor, input: MarketProductCreate) {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const associationId = this.associationOrg(context);
    await this.checkImage(associationId, input.imageFileId);
    const row = await this.db.marketProduct.create({
      data: { ...this.productData(associationId, actor, input), imageFileId: input.imageFileId },
      include: productInclude,
    });
    await this.notify('finance', null, `New product to check: ${row.name}`, '/nasj/finance');
    await audit(this.db, actor, {
      action: 'market.product.create',
      targetType: 'MarketProduct',
      targetId: row.id,
      organizationId: associationId,
    });
    return this.productView(row, true);
  }
  // Any change goes back through finance before it reaches the catalog again.
  async updateProduct(actor: Actor, id: string, input: MarketProductCreate) {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const associationId = this.associationOrg(context);
    const product = await this.db.marketProduct.findFirst({ where: { id, associationId } });
    if (!product) fail(404, 'NOT_FOUND', 'Product not found.');
    await this.checkImage(associationId, input.imageFileId);
    const { createdById: _createdBy, ...data } = this.productData(associationId, actor, input);
    const row = await this.db.marketProduct.update({
      where: { id },
      data: {
        ...data,
        ...(input.imageFileId ? { imageFileId: input.imageFileId, imageUrl: null } : {}),
        ...(input.imageUrl ? { imageFileId: null } : {}),
        ...(!input.imageFileId && !input.imageUrl
          ? { imageFileId: product.imageFileId, imageUrl: product.imageUrl }
          : {}),
        status: 'PENDING_REVIEW',
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
      include: productInclude,
    });
    await this.notify(
      'finance',
      null,
      `Product changed, please check: ${row.name}`,
      '/nasj/finance',
    );
    await audit(this.db, actor, {
      action: 'market.product.update',
      targetType: 'MarketProduct',
      targetId: id,
      organizationId: associationId,
    });
    return this.productView(row, true);
  }
  async archiveProduct(actor: Actor, id: string) {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const associationId = this.associationOrg(context);
    const moved = await this.db.marketProduct.updateMany({
      where: { id, associationId },
      data: { status: 'ARCHIVED' },
    });
    if (moved.count !== 1) fail(404, 'NOT_FOUND', 'Product not found.');
    await this.db.marketCartItem.deleteMany({ where: { productId: id } });
    return { archived: true };
  }
  async importProducts(actor: Actor, input: MarketProductImport) {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const associationId = this.associationOrg(context);
    const data = input.rows.map((row) => this.productData(associationId, actor, row));
    const result = await this.db.marketProduct.createMany({ data });
    await this.notify('finance', null, `${result.count} new products to check`, '/nasj/finance');
    await audit(this.db, actor, {
      action: 'market.product.import',
      targetType: 'Organization',
      targetId: associationId,
      organizationId: associationId,
      after: { count: result.count },
    });
    return { imported: result.count };
  }
  async productsForReview(actor: Actor) {
    await this.require(actor, 'NASJ_FINANCE');
    const rows = await this.db.marketProduct.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
      include: productInclude,
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((row) => this.productView(row, true));
  }
  async reviewProduct(actor: Actor, id: string, input: MarketReview) {
    await this.require(actor, 'NASJ_FINANCE');
    const product = await this.db.marketProduct.findUnique({ where: { id } });
    if (!product) fail(404, 'NOT_FOUND', 'Product not found.');
    const row = await this.db.marketProduct.update({
      where: { id },
      data: {
        status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewNote: input.note || null,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      include: productInclude,
    });
    await audit(this.db, actor, {
      action: `market.product.${input.decision.toLowerCase()}`,
      targetType: 'MarketProduct',
      targetId: id,
      organizationId: product.associationId,
      reason: input.note || undefined,
    });
    return this.productView(row, true);
  }

  // Billing details
  private async billingOf(buyerOrgId: string): Promise<MarketBilling | null> {
    const row = await this.db.marketBillingProfile.findUnique({ where: { buyerOrgId } });
    if (!row) return null;
    return {
      legalName: row.legalName,
      taxId: row.taxId,
      billingAddress: row.billingAddress,
      shippingAddress: row.shippingAddress,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      paymentMethod: row.paymentMethod as MarketBilling['paymentMethod'],
    };
  }
  async saveBilling(actor: Actor, input: MarketBilling) {
    const context = await this.require(actor, 'BUYER_REPRESENTATIVE');
    const buyerOrgId = this.buyerOrg(context);
    await this.db.marketBillingProfile.upsert({
      where: { buyerOrgId },
      update: input,
      create: { ...input, buyerOrgId },
    });
    return this.cart(actor);
  }

  // Cart
  async cart(actor: Actor): Promise<MarketCartView> {
    const context = await this.require(actor, 'BUYER_REPRESENTATIVE');
    const buyerOrgId = this.buyerOrg(context);
    const lines = await this.db.marketCartItem.findMany({
      where: { buyerOrgId, product: { status: 'APPROVED' } },
      include: { product: { include: productInclude } },
      orderBy: { updatedAt: 'desc' },
    });
    let subtotal = 0n;
    const views = lines.map((line) => {
      const lineTotal = line.product.priceMillimes * BigInt(line.quantity);
      subtotal += lineTotal;
      return {
        product: this.productView(line.product, false),
        quantity: line.quantity,
        lineTotal: formatTnd(lineTotal),
      };
    });
    return {
      lines: views,
      totals: totalsView(subtotal),
      deliveries: new Set(lines.map((line) => line.product.associationId)).size,
      billing: await this.billingOf(buyerOrgId),
    };
  }
  async setCart(actor: Actor, productId: string, quantity: number) {
    const context = await this.require(actor, 'BUYER_REPRESENTATIVE');
    const buyerOrgId = this.buyerOrg(context);
    if (quantity === 0) {
      await this.db.marketCartItem.deleteMany({ where: { buyerOrgId, productId } });
      return this.cart(actor);
    }
    const product = await this.db.marketProduct.findFirst({
      where: { id: productId, status: 'APPROVED' },
    });
    if (!product) fail(404, 'NOT_FOUND', 'This product is no longer available.');
    if (quantity < product.minQuantity)
      fail(
        400,
        'BELOW_MINIMUM',
        `The minimum order for ${product.name} is ${product.minQuantity}.`,
      );
    await this.db.marketCartItem.upsert({
      where: { buyerOrgId_productId: { buyerOrgId, productId } },
      update: { quantity },
      create: { buyerOrgId, productId, quantity },
    });
    return this.cart(actor);
  }
  async cartInvoice(actor: Actor) {
    const context = await this.require(actor, 'BUYER_REPRESENTATIVE');
    const buyerOrgId = this.buyerOrg(context);
    const billing = await this.billingOf(buyerOrgId);
    if (!billing) fail(409, 'BILLING_REQUIRED', 'Add your billing and delivery details first.');
    const lines = await this.db.marketCartItem.findMany({
      where: { buyerOrgId, product: { status: 'APPROVED' } },
      include: { product: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!lines.length) fail(409, 'CART_EMPTY', 'Your cart is empty.');
    const now = new Date();
    const number = `PF-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(2).toString('hex').toUpperCase()}`;
    return {
      number,
      pdf: await renderInvoice({
        kind: 'PRO FORMA INVOICE',
        number,
        date: now,
        billing,
        lines: lines.map((line) => ({
          name: line.product.name,
          quantity: line.quantity,
          unitMillimes: line.product.priceMillimes,
        })),
      }),
    };
  }
  async orderInvoice(actor: Actor, id: string) {
    const { row, context } = await this.loadOrder(actor, id);
    if (!this.isBuyer(row, context) && !this.isNasj(context))
      fail(403, 'FORBIDDEN', 'You do not have access to this invoice.');
    const billing = row.billingSnapshot as MarketBilling | null;
    if (!billing || row.totalMillimes === null)
      fail(409, 'INVOICE_UNAVAILABLE', 'This invoice is not available yet.');
    const final = approvedStatuses.includes(row.status);
    const number = `${final ? 'INV' : 'PF'}-${row.number}`;
    const lines = row.items.length
      ? row.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitMillimes: item.unitPriceMillimes,
        }))
      : [{ name: row.title, quantity: 1, unitMillimes: row.totalMillimes }];
    return {
      number,
      pdf: await renderInvoice({
        kind: final ? 'INVOICE' : 'PRO FORMA INVOICE',
        number,
        date: row.createdAt,
        billing,
        lines,
      }),
    };
  }
  // One order per association, so each delivery is tracked on its own.
  async checkout(actor: Actor, input: MarketCheckout, actorName: string) {
    const context = await this.require(actor, 'BUYER_REPRESENTATIVE');
    const buyerOrgId = this.buyerOrg(context);
    const billing = await this.billingOf(buyerOrgId);
    if (!billing)
      fail(409, 'BILLING_REQUIRED', 'Add your billing and delivery details before sending.');
    const created = await this.db.$transaction(async (tx) => {
      const lines = await tx.marketCartItem.findMany({
        where: { buyerOrgId, product: { status: 'APPROVED' } },
        include: { product: true },
      });
      if (!lines.length) fail(409, 'CART_EMPTY', 'Your cart is empty.');
      const groups = new Map<string, typeof lines>();
      for (const line of lines)
        groups.set(line.product.associationId, [
          ...(groups.get(line.product.associationId) ?? []),
          line,
        ]);
      const ids: string[] = [];
      for (const [associationId, group] of groups) {
        const first = group[0]?.product.name ?? 'Order';
        const quantity = group.reduce((sum, line) => sum + line.quantity, 0);
        const order = await tx.marketOrder.create({
          data: {
            buyerOrgId,
            associationId,
            kind: 'CATALOG',
            title: group.length > 1 ? `${first} and ${group.length - 1} more` : first,
            note: input.note || null,
            neededBy: input.neededBy ? day(input.neededBy) : null,
            quantity,
            billingSnapshot: billing,
            totalMillimes: group.reduce(
              (sum, line) => sum + line.product.priceMillimes * BigInt(line.quantity),
              0n,
            ),
            artisanPayMillimes: group.reduce(
              (sum, line) => sum + line.product.artisanPayMillimes * BigInt(line.quantity),
              0n,
            ),
            createdById: actor.id,
            items: {
              create: group.map((line) => ({
                productId: line.productId,
                name: line.product.name,
                quantity: line.quantity,
                unitPriceMillimes: line.product.priceMillimes,
                unitPayMillimes: line.product.artisanPayMillimes,
              })),
            },
            events: {
              create: { status: 'SENT', title: 'Request sent', actorId: actor.id, actorName },
            },
          },
        });
        ids.push(order.id);
      }
      await tx.marketCartItem.deleteMany({ where: { buyerOrgId } });
      return ids;
    });
    for (const id of created) await this.announce(id, 'Request sent');
    return { orderIds: created };
  }

  // Orders
  async createCustomOrder(actor: Actor, input: MarketCustomOrder, actorName: string) {
    const context = await this.require(actor, 'BUYER_REPRESENTATIVE');
    const buyerOrgId = this.buyerOrg(context);
    const billing = await this.billingOf(buyerOrgId);
    if (!billing)
      fail(409, 'BILLING_REQUIRED', 'Add your billing and delivery details before sending.');
    const photo = await this.db.marketFile.findFirst({
      where: { id: input.photoFileId, organizationId: buyerOrgId, purpose: 'ORDER_PHOTO' },
    });
    if (!photo) fail(404, 'NOT_FOUND', 'Upload the photo again.');
    const order = await this.db.marketOrder.create({
      data: {
        buyerOrgId,
        kind: 'CUSTOM',
        title: input.title,
        description: input.description,
        neededBy: input.neededBy ? day(input.neededBy) : null,
        photoFileId: input.photoFileId,
        quantity: input.quantity,
        billingSnapshot: billing,
        priceStatus: 'WAITING_FOR_ASSOCIATION',
        createdById: actor.id,
        events: {
          create: { status: 'SENT', title: 'Custom request sent', actorId: actor.id, actorName },
        },
      },
    });
    await this.announce(order.id, 'Custom request sent');
    return { id: order.id };
  }
  async listOrders(actor: Actor) {
    const context = await this.access.context(actor);
    const where: Prisma.MarketOrderWhereInput = this.isNasj(context)
      ? {}
      : {
          OR: [
            { buyerOrgId: { in: context.organizations.map((org) => org.id) } },
            ...(context.coordinatorOrganizationId
              ? [{ associationId: context.coordinatorOrganizationId }]
              : []),
          ],
        };
    const rows = await this.db.marketOrder.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.orderView(row, context));
  }
  private async loadOrder(actor: Actor, id: string) {
    const context = await this.access.context(actor);
    const row = await this.db.marketOrder.findUnique({ where: { id }, include: orderInclude });
    if (!row || !this.canRead(row, context)) fail(404, 'NOT_FOUND', 'Order not found.');
    return { row, context };
  }
  async getOrder(actor: Actor, id: string) {
    const { row, context } = await this.loadOrder(actor, id);
    return this.orderView(row, context);
  }
  // Moves an order only if it is still in the state the action expects, so double clicks are safe.
  private async transition(
    actor: Actor,
    actorName: string,
    id: string,
    from: MarketOrderStatus[],
    data: Prisma.MarketOrderUncheckedUpdateManyInput,
    event: { status: MarketOrderStatus; title: string; note?: string | null },
    extra?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    await this.db.$transaction(async (tx) => {
      const moved = await tx.marketOrder.updateMany({
        where: { id, status: { in: from } },
        data: { ...data, status: event.status },
      });
      if (moved.count !== 1)
        fail(
          409,
          'ORDER_STATE_CHANGED',
          'This order has moved on. Refresh to see where it is now.',
        );
      await tx.marketOrderEvent.create({
        data: {
          orderId: id,
          status: event.status,
          title: event.title,
          note: event.note || null,
          actorId: actor.id,
          actorName,
        },
      });
      await extra?.(tx);
    });
    await this.announce(id, event.title);
    return this.getOrder(actor, id);
  }
  async cancel(actor: Actor, id: string, reason: string, actorName: string) {
    const { row, context } = await this.loadOrder(actor, id);
    if (!this.isBuyer(row, context))
      fail(403, 'FORBIDDEN', 'Only the company can cancel its order.');
    return this.transition(
      actor,
      actorName,
      id,
      ['SENT', 'AWAITING_APPROVAL'],
      {},
      { status: 'CANCELLED', title: 'Cancelled by the company', note: reason },
    );
  }
  async route(actor: Actor, id: string, associationId: string, note: string, actorName: string) {
    await this.require(actor, 'NASJ_COORDINATOR');
    const association = await this.db.organization.findFirst({
      where: {
        id: associationId,
        type: { in: partnerTypes as never },
        approvalStatus: 'APPROVED',
      },
    });
    if (!association) fail(404, 'NOT_FOUND', 'Choose an approved association.');
    return this.transition(
      actor,
      actorName,
      id,
      ['SENT'],
      { associationId },
      { status: 'AWAITING_APPROVAL', title: `Sent to ${association.name}`, note },
    );
  }
  async associations(actor: Actor): Promise<MarketAssociationOption[]> {
    await this.require(actor, 'NASJ_COORDINATOR');
    const rows = await this.db.organization.findMany({
      where: { type: { in: partnerTypes as never }, approvalStatus: 'APPROVED', ...fixtureFree },
      select: {
        id: true,
        name: true,
        region: true,
        marketProducts: { where: { status: 'APPROVED' }, select: { craft: true } },
        marketAssociationOrders: {
          select: { ratings: { where: { role: 'COMPANY' }, select: { stars: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => {
      const stars = row.marketAssociationOrders.flatMap((order) =>
        order.ratings.map((rating) => rating.stars),
      );
      return {
        id: row.id,
        name: row.name,
        region: row.region,
        crafts: [...new Set(row.marketProducts.map((product) => product.craft))],
        rating: stars.length
          ? Math.round((stars.reduce((sum, value) => sum + value, 0) / stars.length) * 10) / 10
          : null,
      };
    });
  }

  // Notifications and the counts next to the menu
  private async recipients(audience: Audience, organizationId: string | null) {
    if (audience === 'company' || audience === 'association') {
      if (!organizationId) return [];
      const members = await this.db.organizationMember.findMany({
        where: { organizationId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
        select: { user: { select: { id: true, email: true } } },
      });
      return members.map((member) => member.user);
    }
    const [staff, admins] = await Promise.all([
      this.db.organizationMember.findMany({
        where: {
          status: 'ACTIVE',
          organization: { type: 'INTERNAL', ...fixtureFree },
          roles: { some: { role: { in: [...internalRoles[audience]] } } },
        },
        select: { user: { select: { id: true, email: true } } },
      }),
      this.db.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE', email: { endsWith: '@nasj.example' } },
        select: { id: true, email: true },
      }),
    ]);
    return [...new Map([...staff.map((m) => m.user), ...admins].map((u) => [u.id, u])).values()];
  }
  // A failed notification must never undo or block the work it describes.
  private async notify(
    audience: Audience,
    organizationId: string | null,
    title: string,
    link: string,
    email = audience === 'company' || audience === 'association',
  ) {
    try {
      const people = await this.recipients(audience, organizationId);
      if (!people.length) return;
      await this.db.marketNotification.createMany({
        data: people.map((person) => ({ userId: person.id, title, link })),
      });
      if (!email) return;
      const url = new URL(link, this.config.PUBLIC_APP_URL).toString();
      for (const person of people)
        this.mail.sendAction(person.email, title, {
          title,
          intro: 'There is an update on NASJ.',
          label: 'Open NASJ',
          url,
        });
    } catch (error) {
      logger.warn({ category: 'MARKET_NOTIFICATION', error: String(error) }, 'Notification failed');
    }
  }
  private async announce(id: string, event: string) {
    const entry = journeyMessages.find((item) => event.startsWith(item.match));
    if (!entry) return;
    const order = await this.db.marketOrder.findUnique({ where: { id } });
    if (!order) return;
    for (const [audience, message] of entry.send) {
      const organizationId =
        audience === 'company'
          ? order.buyerOrgId
          : audience === 'association'
            ? order.associationId
            : null;
      await this.notify(audience, organizationId, message(order.title), `/orders/${id}`);
    }
  }
  async notifications(actor: Actor): Promise<MarketNotificationsView> {
    await this.access.context(actor);
    const [rows, unread] = await Promise.all([
      this.db.marketNotification.findMany({
        where: { userId: actor.id },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      this.db.marketNotification.count({ where: { userId: actor.id, readAt: null } }),
    ]);
    return {
      unread,
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        link: row.link,
        at: row.createdAt.toISOString(),
        unread: !row.readAt,
      })),
    };
  }
  async markNotificationsRead(actor: Actor) {
    await this.db.marketNotification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }
  async counts(actor: Actor): Promise<MarketCounts> {
    const context = await this.access.context(actor);
    const admin = this.has(context, 'PLATFORM_ADMIN');
    const company = context.organizations.find(
      (org) => org.type === 'BUYER_BUSINESS' && org.approvalStatus === 'APPROVED',
    );
    const result: MarketCounts = { requests: 0, finance: 0, organizations: 0, orders: 0, cart: 0 };
    if (admin || this.has(context, 'NASJ_COORDINATOR'))
      result.requests = await this.db.marketOrder.count({
        where: {
          OR: [
            { status: { in: ['SENT', 'AT_NASJ'] } },
            { status: 'WORKING', NOT: { associationDelivery: { equals: Prisma.DbNull } } },
          ],
        },
      });
    else if (context.coordinatorOrganizationId)
      result.requests = await this.db.marketOrder.count({
        where: {
          associationId: context.coordinatorOrganizationId,
          OR: [
            { status: 'AWAITING_APPROVAL', acceptedAt: null },
            { status: 'AWAITING_APPROVAL', priceStatus: 'WAITING_FOR_ASSOCIATION' },
            { status: 'WORKING', associationDelivery: { equals: Prisma.DbNull } },
          ],
        },
      });
    if (admin || this.has(context, 'NASJ_FINANCE')) {
      const [products, prices, payments] = await Promise.all([
        this.db.marketProduct.count({ where: { status: 'PENDING_REVIEW' } }),
        this.db.marketOrder.count({ where: { priceStatus: 'FINANCE_REVIEW' } }),
        this.db.marketOrderArtisan.count({
          where: { paidRecordedAt: { not: null }, paymentCheckedAt: null },
        }),
      ]);
      result.finance = products + prices + payments;
    }
    if (admin || this.has(context, 'NASJ_OPERATOR'))
      result.organizations = await this.db.organization.count({
        where: { approvalStatus: 'PENDING_REVIEW', type: { not: 'INTERNAL' }, ...fixtureFree },
      });
    if (company) {
      const [orders, cart] = await Promise.all([
        this.db.marketOrder.count({
          where: {
            buyerOrgId: company.id,
            OR: [{ priceStatus: 'COMPANY_REVIEW' }, { status: 'ON_THE_WAY' }],
          },
        }),
        this.db.marketCartItem.count({
          where: { buyerOrgId: company.id, product: { status: 'APPROVED' } },
        }),
      ]);
      result.orders = orders;
      result.cart = cart;
    }
    return result;
  }

  // The artisanes
  async crafts(actor: Actor) {
    await this.access.context(actor);
    return this.db.craftSkill.findMany({
      where: { isActive: true, NOT: { name: { startsWith: 'DEMO' } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  async women(actor: Actor): Promise<MarketWomanView[]> {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const rows = await this.db.artisanProfile.findMany({
      where: {
        managements: { some: { organizationId: this.associationOrg(context), endedAt: null } },
      },
      select: {
        id: true,
        displayName: true,
        region: true,
        marketDetail: { select: { idNumber: true, phone: true } },
        skills: { select: { craftSkillId: true, craftSkill: { select: { name: true } } } },
        marketOrders: {
          select: {
            payMillimes: true,
            paidRecordedAt: true,
            order: { select: { status: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
      take: 300,
    });
    return rows.map((row) => {
      const live = row.marketOrders.filter((item) => item.order.status !== 'CANCELLED');
      const sum = (paid: boolean) =>
        live
          .filter((item) => Boolean(item.paidRecordedAt) === paid)
          .reduce((total, item) => total + item.payMillimes, 0n);
      return {
        id: row.id,
        name: row.displayName,
        region: row.region,
        idNumber: row.marketDetail?.idNumber ?? '',
        phone: row.marketDetail?.phone ?? '',
        skills: row.skills.map((skill) => skill.craftSkill.name),
        craftIds: row.skills.map((skill) => skill.craftSkillId),
        activeOrders: live.filter((item) =>
          ['WORKING', 'AT_NASJ', 'ON_THE_WAY'].includes(item.order.status),
        ).length,
        owed: formatTnd(sum(false)),
        paid: formatTnd(sum(true)),
      };
    });
  }
  async addWoman(actor: Actor, input: MarketWoman) {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const organizationId = this.associationOrg(context);
    const profile = await this.db.$transaction(async (tx) => {
      const row = await tx.artisanProfile.create({
        data: {
          createdById: actor.id,
          displayName: input.name,
          region: input.region,
          preferredLanguage: 'ar',
          experienceDescription: '',
          equipment: [],
        },
      });
      await tx.marketArtisanDetail.create({
        data: { artisanProfileId: row.id, idNumber: input.idNumber, phone: input.phone || null },
      });
      await tx.artisanManagement.create({
        data: {
          artisanProfileId: row.id,
          organizationId,
          recordedById: actor.id,
          reason: 'Added by her association.',
        },
      });
      await tx.artisanAssignment.create({
        data: {
          artisanProfileId: row.id,
          organizationId,
          coordinatorId: actor.id,
          assignedById: actor.id,
          reason: 'Added by her association.',
        },
      });
      if (input.craftIds.length)
        await tx.artisanSkill.createMany({
          data: input.craftIds.map((craftSkillId) => ({
            artisanProfileId: row.id,
            craftSkillId,
            proficiency: 'ADVANCED',
          })),
        });
      await audit(tx, actor, {
        action: 'market.woman.add',
        targetType: 'ArtisanProfile',
        targetId: row.id,
        organizationId,
        reason: 'The association confirmed that she agreed to join.',
      });
      return row;
    });
    return { id: profile.id };
  }
  async updateWoman(actor: Actor, id: string, input: MarketWoman) {
    const context = await this.require(actor, 'ASSOCIATION_COORDINATOR');
    const organizationId = this.associationOrg(context);
    const managed = await this.db.artisanManagement.findFirst({
      where: { artisanProfileId: id, organizationId, endedAt: null },
    });
    if (!managed) fail(404, 'NOT_FOUND', 'This artisane does not work with your association.');
    await this.db.$transaction(async (tx) => {
      await tx.artisanProfile.update({
        where: { id },
        data: { displayName: input.name, region: input.region },
      });
      await tx.marketArtisanDetail.upsert({
        where: { artisanProfileId: id },
        update: { idNumber: input.idNumber, phone: input.phone || null },
        create: { artisanProfileId: id, idNumber: input.idNumber, phone: input.phone || null },
      });
      await tx.artisanSkill.deleteMany({
        where: { artisanProfileId: id, craftSkillId: { notIn: input.craftIds } },
      });
      await tx.artisanSkill.createMany({
        data: input.craftIds.map((craftSkillId) => ({
          artisanProfileId: id,
          craftSkillId,
          proficiency: 'ADVANCED',
        })),
        skipDuplicates: true,
      });
      await audit(tx, actor, {
        action: 'market.woman.update',
        targetType: 'ArtisanProfile',
        targetId: id,
        organizationId,
      });
    });
    return { id };
  }

  // The association's steps
  private async associationOrder(actor: Actor, id: string) {
    const { row, context } = await this.loadOrder(actor, id);
    if (!this.isAssociation(row, context))
      fail(403, 'FORBIDDEN', 'This request belongs to another association.');
    return row;
  }
  async accept(actor: Actor, id: string, actorName: string) {
    const row = await this.associationOrder(actor, id);
    if (row.acceptedAt) fail(409, 'ORDER_STATE_CHANGED', 'You already accepted this request.');
    const custom = row.kind === 'CUSTOM';
    return this.transition(
      actor,
      actorName,
      id,
      ['AWAITING_APPROVAL'],
      { acceptedAt: new Date() },
      {
        status: custom ? 'AWAITING_APPROVAL' : 'WORKING',
        title: 'Accepted by the association',
      },
    );
  }
  async decline(actor: Actor, id: string, reason: string, actorName: string) {
    await this.associationOrder(actor, id);
    return this.transition(
      actor,
      actorName,
      id,
      ['AWAITING_APPROVAL'],
      { associationId: null, acceptedAt: null },
      {
        status: 'SENT',
        title: 'Association could not take it, NASJ is finding another',
        note: reason,
      },
    );
  }
  async proposePrice(
    actor: Actor,
    id: string,
    input: { total: string; artisanPay: string; note: string },
    actorName: string,
  ) {
    const row = await this.associationOrder(actor, id);
    if (row.kind !== 'CUSTOM') fail(409, 'NOT_CUSTOM', 'Catalog items already have a price.');
    if (!row.acceptedAt) fail(409, 'NOT_ACCEPTED', 'Accept the request first.');
    if (row.priceStatus !== 'WAITING_FOR_ASSOCIATION')
      fail(409, 'ORDER_STATE_CHANGED', 'This price is already being reviewed.');
    const total = parseTnd(input.total);
    const pay = parseTnd(input.artisanPay);
    if (pay > total)
      fail(400, 'PAY_ABOVE_PRICE', "The artisanes' pay cannot be above the total price.");
    return this.transition(
      actor,
      actorName,
      id,
      ['AWAITING_APPROVAL'],
      { totalMillimes: total, artisanPayMillimes: pay, priceStatus: 'FINANCE_REVIEW' },
      {
        status: 'AWAITING_APPROVAL',
        title: 'Price proposed, NASJ finance is checking it',
        note: input.note,
      },
    );
  }
  async financePrice(actor: Actor, id: string, input: MarketReview, actorName: string) {
    await this.require(actor, 'NASJ_FINANCE');
    const row = await this.db.marketOrder.findUnique({ where: { id } });
    if (row?.priceStatus !== 'FINANCE_REVIEW')
      fail(409, 'ORDER_STATE_CHANGED', 'No price is waiting for review.');
    const approved = input.decision === 'APPROVE';
    return this.transition(
      actor,
      actorName,
      id,
      ['AWAITING_APPROVAL'],
      {
        priceStatus: approved ? 'COMPANY_REVIEW' : 'WAITING_FOR_ASSOCIATION',
        ...(approved ? {} : { totalMillimes: null, artisanPayMillimes: null }),
      },
      {
        status: 'AWAITING_APPROVAL',
        title: approved ? 'Price ready for the company' : 'Finance asked for a new price',
        note: input.note,
      },
    );
  }
  async companyPrice(actor: Actor, id: string, accept: boolean, note: string, actorName: string) {
    const { row, context } = await this.loadOrder(actor, id);
    if (!this.isBuyer(row, context))
      fail(403, 'FORBIDDEN', 'Only the company can answer this price.');
    if (row.priceStatus !== 'COMPANY_REVIEW')
      fail(409, 'ORDER_STATE_CHANGED', 'No price is waiting for you.');
    return this.transition(
      actor,
      actorName,
      id,
      ['AWAITING_APPROVAL'],
      {
        priceStatus: accept ? 'ACCEPTED' : 'WAITING_FOR_ASSOCIATION',
        ...(accept ? {} : { totalMillimes: null, artisanPayMillimes: null }),
      },
      {
        status: accept ? 'WORKING' : 'AWAITING_APPROVAL',
        title: accept ? 'Price accepted by the company' : 'Company asked for a new price',
        note,
      },
    );
  }
  // Assigning records which artisanes agreed: the association does not accept work on their behalf.
  async assign(
    actor: Actor,
    id: string,
    input: { artisanIds: string[]; estimatedFinish: string; note: string },
    actorName: string,
  ) {
    const row = await this.associationOrder(actor, id);
    if (row.assignedAt) fail(409, 'ORDER_STATE_CHANGED', 'Artisanes are already assigned.');
    const ids = [...new Set(input.artisanIds)];
    const managed = await this.db.artisanManagement.count({
      where: {
        artisanProfileId: { in: ids },
        organizationId: row.associationId as string,
        endedAt: null,
      },
    });
    if (managed !== ids.length)
      fail(400, 'ARTISAN_NOT_MANAGED', 'Choose artisanes who work with your association.');
    const pay = row.artisanPayMillimes ?? 0n;
    const share = pay / BigInt(ids.length);
    const remainder = pay - share * BigInt(ids.length);
    return this.transition(
      actor,
      actorName,
      id,
      ['WORKING'],
      { assignedAt: new Date(), estimatedFinishAt: day(input.estimatedFinish) },
      { status: 'WORKING', title: 'Artisanes assigned, work started', note: input.note },
      (tx) =>
        tx.marketOrderArtisan.createMany({
          data: ids.map((artisanProfileId, index) => ({
            orderId: id,
            artisanProfileId,
            recordedById: actor.id,
            payMillimes: share + (index === 0 ? remainder : 0n),
          })),
        }),
    );
  }
  async almostReady(actor: Actor, id: string, actorName: string) {
    const row = await this.associationOrder(actor, id);
    if (!row.assignedAt) fail(409, 'NOT_ASSIGNED', 'Assign the artisanes first.');
    return this.transition(
      actor,
      actorName,
      id,
      ['WORKING'],
      { almostReadyAt: new Date() },
      { status: 'WORKING', title: 'Almost ready' },
    );
  }
  async sendToNasj(actor: Actor, id: string, delivery: MarketDelivery, actorName: string) {
    const row = await this.associationOrder(actor, id);
    if (!row.assignedAt) fail(409, 'NOT_ASSIGNED', 'Assign the artisanes first.');
    return this.transition(
      actor,
      actorName,
      id,
      ['WORKING'],
      { associationDelivery: delivery, almostReadyAt: row.almostReadyAt ?? new Date() },
      {
        status: 'WORKING',
        title: 'On the way to NASJ',
        note: `${delivery.carrier}, ${delivery.driverName}, ${delivery.driverPhone}`,
      },
    );
  }

  // The coordinator's steps
  async arrived(actor: Actor, id: string, note: string, actorName: string) {
    await this.require(actor, 'NASJ_COORDINATOR');
    const row = await this.db.marketOrder.findUnique({ where: { id } });
    if (!row?.associationDelivery)
      fail(409, 'NOT_SENT', 'The association has not sent this order to NASJ yet.');
    return this.transition(
      actor,
      actorName,
      id,
      ['WORKING'],
      { qualityStatus: 'NOT_CHECKED' },
      { status: 'AT_NASJ', title: 'Delivered to NASJ', note },
    );
  }
  async quality(actor: Actor, id: string, passed: boolean, note: string, actorName: string) {
    await this.require(actor, 'NASJ_COORDINATOR');
    if (passed)
      return this.transition(
        actor,
        actorName,
        id,
        ['AT_NASJ'],
        { qualityStatus: 'PASSED' },
        { status: 'AT_NASJ', title: 'Quality check passed', note },
      );
    return this.transition(
      actor,
      actorName,
      id,
      ['AT_NASJ'],
      { qualityStatus: 'FAILED', associationDelivery: Prisma.DbNull, almostReadyAt: null },
      { status: 'WORKING', title: 'Quality check failed, back to the association', note },
    );
  }
  async pack(actor: Actor, id: string, delivery: MarketDelivery, actorName: string) {
    await this.require(actor, 'NASJ_COORDINATOR');
    const row = await this.db.marketOrder.findUnique({ where: { id } });
    if (row?.qualityStatus !== 'PASSED')
      fail(409, 'QUALITY_REQUIRED', 'Pass the quality check first.');
    return this.transition(
      actor,
      actorName,
      id,
      ['AT_NASJ'],
      { nasjDelivery: delivery, qrToken: row.qrToken ?? randomBytes(16).toString('hex') },
      { status: 'ON_THE_WAY', title: 'Packed with its QR code and on the way' },
    );
  }
  async qr(actor: Actor, id: string) {
    const { row } = await this.loadOrder(actor, id);
    if (!row.qrToken) fail(404, 'NOT_FOUND', 'This order has no QR code yet.');
    return QRCode.toBuffer(
      new URL(`/track/${row.qrToken}`, this.config.PUBLIC_APP_URL).toString(),
      {
        width: 480,
        margin: 2,
        color: { dark: '#244C3A', light: '#FFFFFF' },
      },
    );
  }
  async track(token: string): Promise<MarketTrackView> {
    const row = await this.db.marketOrder.findUnique({
      where: { qrToken: token },
      include: { items: { include: { product: { select: { craft: true } } } } },
    });
    if (!row) fail(404, 'NOT_FOUND', 'This code is not recognised.');
    return {
      title: row.title,
      craft: row.items[0]?.product.craft ?? null,
      status: row.status as MarketOrderStatus,
      madeBy: 'Made by hand by women artisans, and checked for quality by NASJ.',
    };
  }
  async confirmDelivered(actor: Actor, id: string, note: string, actorName: string) {
    const { row, context } = await this.loadOrder(actor, id);
    if (!this.isBuyer(row, context))
      fail(403, 'FORBIDDEN', 'Only the company can confirm delivery.');
    return this.transition(
      actor,
      actorName,
      id,
      ['ON_THE_WAY'],
      {},
      { status: 'DELIVERED', title: 'Delivered, confirmed by the company', note },
    );
  }
  async rate(actor: Actor, id: string, input: MarketRating) {
    const { row, context } = await this.loadOrder(actor, id);
    const role = this.isBuyer(row, context)
      ? 'COMPANY'
      : this.isAssociation(row, context)
        ? 'ASSOCIATION'
        : null;
    if (!role) fail(403, 'FORBIDDEN', 'Only the company and the association can rate this order.');
    if (row.status !== 'DELIVERED')
      fail(409, 'NOT_DELIVERED', 'You can rate an order once it is delivered.');
    await this.db.marketOrderRating.create({
      data: {
        orderId: id,
        role,
        stars: input.stars,
        qualityStars: role === 'COMPANY' ? (input.qualityStars ?? input.stars) : null,
        comment: input.comment,
        createdById: actor.id,
      },
    });
    return this.getOrder(actor, id);
  }

  // Finance
  async checkInvoice(actor: Actor, id: string) {
    await this.require(actor, 'NASJ_FINANCE');
    const row = await this.db.marketOrder.findUnique({ where: { id } });
    if (!row) fail(404, 'NOT_FOUND', 'Order not found.');
    if (row.totalMillimes === null) fail(409, 'NO_PRICE', 'This order has no price yet.');
    await this.db.marketOrder.update({
      where: { id },
      data: { invoiceCheckedAt: new Date(), invoiceCheckedById: actor.id },
    });
    await audit(this.db, actor, {
      action: 'market.invoice.check',
      targetType: 'MarketOrder',
      targetId: id,
    });
    return this.getOrder(actor, id);
  }
  async recordPayment(actor: Actor, id: string, artisanId: string, proofFileId: string) {
    const row = await this.associationOrder(actor, id);
    const proof = await this.db.marketFile.findFirst({
      where: {
        id: proofFileId,
        organizationId: row.associationId as string,
        purpose: 'PAYMENT_PROOF',
      },
    });
    if (!proof) fail(404, 'NOT_FOUND', 'Upload the payment proof again.');
    const moved = await this.db.marketOrderArtisan.updateMany({
      where: { orderId: id, artisanProfileId: artisanId },
      data: { paidRecordedAt: new Date(), paymentProofFileId: proofFileId },
    });
    if (moved.count !== 1) fail(404, 'NOT_FOUND', 'This artisane is not on this order.');
    await this.notify('finance', null, 'An artisane payment is ready to check', '/nasj/finance');
    await audit(this.db, actor, {
      action: 'market.artisan.payment.record',
      targetType: 'MarketOrder',
      targetId: id,
      organizationId: row.associationId ?? undefined,
    });
    return this.getOrder(actor, id);
  }
  async payments(actor: Actor): Promise<MarketPaymentView[]> {
    await this.require(actor, 'NASJ_FINANCE');
    const rows = await this.db.marketOrderArtisan.findMany({
      where: { order: { status: { not: 'CANCELLED' } } },
      include: {
        artisanProfile: { select: { displayName: true } },
        order: {
          select: { number: true, association: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((row) => ({
      orderId: row.orderId,
      code: `NSJ-${row.order.number}`,
      associationName: row.order.association?.name ?? '',
      artisanId: row.artisanProfileId,
      artisanName: row.artisanProfile.displayName,
      pay: formatTnd(row.payMillimes),
      paidRecorded: Boolean(row.paidRecordedAt),
      paymentChecked: Boolean(row.paymentCheckedAt),
      proofUrl: row.paymentProofFileId ? fileUrl(row.paymentProofFileId) : null,
    }));
  }
  async checkPayment(actor: Actor, id: string, artisanId: string) {
    await this.require(actor, 'NASJ_FINANCE');
    const moved = await this.db.marketOrderArtisan.updateMany({
      where: { orderId: id, artisanProfileId: artisanId, paidRecordedAt: { not: null } },
      data: { paymentCheckedAt: new Date(), paymentCheckedById: actor.id },
    });
    if (moved.count !== 1)
      fail(409, 'NOT_RECORDED', 'The association has not recorded this payment yet.');
    await audit(this.db, actor, {
      action: 'market.artisan.payment.check',
      targetType: 'MarketOrder',
      targetId: id,
    });
    return { checked: true };
  }

  // Organizations: the operator's side of NASJ
  async organizations(actor: Actor, status: string): Promise<MarketOrganizationView[]> {
    await this.require(actor, 'NASJ_OPERATOR');
    const rows = await this.db.organization.findMany({
      where: { approvalStatus: status as never, type: { not: 'INTERNAL' }, ...fixtureFree },
      include: {
        members: {
          where: { status: 'ACTIVE' },
          select: { isManager: true, user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const proofs = await this.db.marketFile.findMany({
      where: { organizationId: { in: rows.map((row) => row.id) }, purpose: 'ORG_PROOF' },
      select: { id: true, filename: true, organizationId: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => {
      const proof = proofs.find((file) => file.organizationId === row.id);
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        region: row.region,
        description: row.description,
        representativeName: row.representativeName,
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        approvalStatus: row.approvalStatus,
        approvalReason: row.approvalReason,
        createdAt: row.createdAt.toISOString(),
        proof: proof ? { id: proof.id, filename: proof.filename, url: fileUrl(proof.id) } : null,
        people: row.members.map((member) => ({
          name: member.user.name,
          email: member.user.email,
          manager: member.isManager,
        })),
      };
    });
  }
  async reviewOrganization(actor: Actor, id: string, input: MarketReview) {
    await this.require(actor, 'NASJ_OPERATOR');
    const org = await this.db.organization.findUnique({ where: { id } });
    if (!org || org.type === 'INTERNAL') fail(404, 'NOT_FOUND', 'Organization not found.');
    if (org.approvalStatus !== 'PENDING_REVIEW')
      fail(409, 'INVALID_TRANSITION', 'This organization is not waiting for review.');
    const approved = input.decision === 'APPROVE';
    if (approved) {
      const proof = await this.db.marketFile.count({
        where: { organizationId: id, purpose: 'ORG_PROOF' },
      });
      if (!proof) fail(409, 'PROOF_REQUIRED', 'This organization has not uploaded its proof yet.');
    }
    await this.db.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: {
          approvalStatus: approved ? 'APPROVED' : 'REJECTED',
          approvedByUserId: actor.id,
          approvedAt: new Date(),
          approvalReason: input.note || (approved ? 'Representative proof reviewed.' : null),
        },
      });
      // The person who registered an association represents it from the moment it is accepted.
      if (approved && partnerTypes.includes(org.type))
        await tx.organizationMember.updateMany({
          where: { organizationId: id, isManager: true, status: 'ACTIVE' },
          data: { isCoordinator: true },
        });
      await audit(tx, actor, {
        action: approved ? 'organization.approved' : 'organization.rejected',
        targetType: 'Organization',
        targetId: id,
        organizationId: id,
        reason: input.note || undefined,
        before: { approvalStatus: org.approvalStatus },
        after: { approvalStatus: approved ? 'APPROVED' : 'REJECTED' },
      });
    });
    await this.notify(
      'company',
      id,
      approved ? `Welcome to NASJ, ${org.name}` : `We could not accept ${org.name} yet`,
      '/welcome',
      false,
    );
    const url = new URL('/auth/login', this.config.PUBLIC_APP_URL).toString();
    if (approved)
      this.mail.sendAction(org.contactEmail, `Welcome to NASJ, ${org.name}`, {
        title: `Welcome to NASJ, ${org.name}`,
        intro: `Hello ${org.representativeName}, good news: ${org.name} has been accepted and is now part of NASJ.`,
        label: 'Sign in to get started',
        url,
      });
    else
      this.mail.sendAction(org.contactEmail, `Your NASJ application for ${org.name}`, {
        title: 'We could not accept your application yet',
        intro: `Hello ${org.representativeName}, we could not accept ${org.name} yet. Reason: ${input.note}`,
        label: 'Update and apply again',
        url,
      });
    return { status: approved ? 'APPROVED' : 'REJECTED' };
  }
}
