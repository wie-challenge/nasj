import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  marketAssignSchema,
  marketBillingSchema,
  marketCartSetSchema,
  marketCheckoutSchema,
  marketCustomOrderSchema,
  marketDeliverySchema,
  marketFileSchema,
  marketNoteSchema,
  marketOrgQuerySchema,
  marketPaymentSchema,
  marketPriceDecisionSchema,
  marketPriceSchema,
  marketProductCreateSchema,
  marketProductImportSchema,
  marketProductQuerySchema,
  marketQualitySchema,
  marketRatingSchema,
  marketReasonSchema,
  marketReviewSchema,
  marketRouteSchema,
  marketWomanSchema,
  resourceIdSchema,
} from '@nasj/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MarketService } from './market.service.js';

const rid = new ZodValidationPipe(resourceIdSchema);
const qrToken = new ZodValidationPipe(z.string().regex(/^[a-f0-9]{32}$/));
function sendPdf(res: Response, name: string, pdf: Buffer) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
}
@Controller('api/v1/market')
export class MarketController {
  constructor(
    @Inject(MarketService) private readonly market: MarketService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}
  // Timeline entries name the person who acted.
  private async who(actor: Actor) {
    const user = await this.db.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    return user?.name ?? 'NASJ';
  }

  @Post('files') upload(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(marketFileSchema)) i: z.infer<typeof marketFileSchema>,
  ) {
    return this.market.uploadFile(a, i);
  }
  @Get('files/:id') async file(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Res() res: Response,
  ) {
    const file = await this.market.readFile(a, id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.filename.replace(/[^a-zA-Z0-9_. -]/g, '_')}"`,
    );
    res.send(Buffer.from(file.bytes));
  }

  @Get('products') products(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(marketProductQuerySchema))
    q: z.infer<typeof marketProductQuerySchema>,
  ) {
    return this.market.listProducts(a, q);
  }
  @Get('products/mine') mine(@CurrentUser() a: Actor) {
    return this.market.myProducts(a);
  }
  @Get('products/review') forReview(@CurrentUser() a: Actor) {
    return this.market.productsForReview(a);
  }
  @Post('products') create(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(marketProductCreateSchema))
    i: z.infer<typeof marketProductCreateSchema>,
  ) {
    return this.market.createProduct(a, i);
  }
  @Post('products/import') importSheet(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(marketProductImportSchema))
    i: z.infer<typeof marketProductImportSchema>,
  ) {
    return this.market.importProducts(a, i);
  }
  @Put('products/:id') updateProduct(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketProductCreateSchema))
    i: z.infer<typeof marketProductCreateSchema>,
  ) {
    return this.market.updateProduct(a, id, i);
  }
  @Post('products/:id/archive') @HttpCode(200) archive(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.market.archiveProduct(a, id);
  }
  @Post('products/:id/review') @HttpCode(200) reviewProduct(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketReviewSchema)) i: z.infer<typeof marketReviewSchema>,
  ) {
    return this.market.reviewProduct(a, id, i);
  }

  @Get('cart') cart(@CurrentUser() a: Actor) {
    return this.market.cart(a);
  }
  @Put('billing') billing(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(marketBillingSchema)) i: z.infer<typeof marketBillingSchema>,
  ) {
    return this.market.saveBilling(a, i);
  }
  @Get('cart/invoice.pdf') async cartInvoice(@CurrentUser() a: Actor, @Res() res: Response) {
    const { number, pdf } = await this.market.cartInvoice(a);
    sendPdf(res, number, pdf);
  }
  @Put('cart/:productId') setCart(
    @CurrentUser() a: Actor,
    @Param('productId', rid) id: string,
    @Body(new ZodValidationPipe(marketCartSetSchema)) i: z.infer<typeof marketCartSetSchema>,
  ) {
    return this.market.setCart(a, id, i.quantity);
  }
  @Post('cart/checkout') async checkout(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(marketCheckoutSchema)) i: z.infer<typeof marketCheckoutSchema>,
  ) {
    return this.market.checkout(a, i, await this.who(a));
  }

  @Get('orders') orders(@CurrentUser() a: Actor) {
    return this.market.listOrders(a);
  }
  @Post('orders/custom') async custom(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(marketCustomOrderSchema))
    i: z.infer<typeof marketCustomOrderSchema>,
  ) {
    return this.market.createCustomOrder(a, i, await this.who(a));
  }
  @Get('orders/:id') order(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.market.getOrder(a, id);
  }
  @Get('orders/:id/invoice.pdf') async orderInvoice(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Res() res: Response,
  ) {
    const { number, pdf } = await this.market.orderInvoice(a, id);
    sendPdf(res, number, pdf);
  }
  @Get('orders/:id/qr.png') async qr(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Res() res: Response,
  ) {
    const image = await this.market.qr(a, id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(image);
  }
  @Post('orders/:id/cancel') @HttpCode(200) async cancel(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketReasonSchema)) i: z.infer<typeof marketReasonSchema>,
  ) {
    return this.market.cancel(a, id, i.reason, await this.who(a));
  }
  @Post('orders/:id/route') @HttpCode(200) async route(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketRouteSchema)) i: z.infer<typeof marketRouteSchema>,
  ) {
    return this.market.route(a, id, i.associationId, i.note, await this.who(a));
  }
  @Post('orders/:id/accept') @HttpCode(200) async accept(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.market.accept(a, id, await this.who(a));
  }
  @Post('orders/:id/decline') @HttpCode(200) async decline(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketReasonSchema)) i: z.infer<typeof marketReasonSchema>,
  ) {
    return this.market.decline(a, id, i.reason, await this.who(a));
  }
  @Post('orders/:id/price') @HttpCode(200) async price(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketPriceSchema)) i: z.infer<typeof marketPriceSchema>,
  ) {
    return this.market.proposePrice(a, id, i, await this.who(a));
  }
  @Post('orders/:id/finance-price') @HttpCode(200) async financePrice(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketReviewSchema)) i: z.infer<typeof marketReviewSchema>,
  ) {
    return this.market.financePrice(a, id, i, await this.who(a));
  }
  @Post('orders/:id/company-price') @HttpCode(200) async companyPrice(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketPriceDecisionSchema))
    i: z.infer<typeof marketPriceDecisionSchema>,
  ) {
    return this.market.companyPrice(a, id, i.decision === 'ACCEPT', i.note, await this.who(a));
  }
  @Post('orders/:id/assign') @HttpCode(200) async assign(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketAssignSchema)) i: z.infer<typeof marketAssignSchema>,
  ) {
    return this.market.assign(a, id, i, await this.who(a));
  }
  @Post('orders/:id/almost-ready') @HttpCode(200) async almostReady(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.market.almostReady(a, id, await this.who(a));
  }
  @Post('orders/:id/send-to-nasj') @HttpCode(200) async sendToNasj(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketDeliverySchema)) i: z.infer<typeof marketDeliverySchema>,
  ) {
    return this.market.sendToNasj(a, id, i, await this.who(a));
  }
  @Post('orders/:id/arrived') @HttpCode(200) async arrived(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketNoteSchema)) i: z.infer<typeof marketNoteSchema>,
  ) {
    return this.market.arrived(a, id, i.note, await this.who(a));
  }
  @Post('orders/:id/quality') @HttpCode(200) async quality(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketQualitySchema)) i: z.infer<typeof marketQualitySchema>,
  ) {
    return this.market.quality(a, id, i.passed, i.note, await this.who(a));
  }
  @Post('orders/:id/pack') @HttpCode(200) async pack(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketDeliverySchema)) i: z.infer<typeof marketDeliverySchema>,
  ) {
    return this.market.pack(a, id, i, await this.who(a));
  }
  @Post('orders/:id/confirm') @HttpCode(200) async confirm(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketNoteSchema)) i: z.infer<typeof marketNoteSchema>,
  ) {
    return this.market.confirmDelivered(a, id, i.note, await this.who(a));
  }
  @Post('orders/:id/rate') @HttpCode(200) rate(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketRatingSchema)) i: z.infer<typeof marketRatingSchema>,
  ) {
    return this.market.rate(a, id, i);
  }
  @Post('orders/:id/invoice-check') @HttpCode(200) invoice(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.market.checkInvoice(a, id);
  }
  @Post('orders/:id/artisanes/:artisanId/paid') @HttpCode(200) paid(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('artisanId', rid) artisanId: string,
    @Body(new ZodValidationPipe(marketPaymentSchema)) i: z.infer<typeof marketPaymentSchema>,
  ) {
    return this.market.recordPayment(a, id, artisanId, i.proofFileId);
  }
  @Post('orders/:id/artisanes/:artisanId/payment-check') @HttpCode(200) paymentCheck(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('artisanId', rid) artisanId: string,
  ) {
    return this.market.checkPayment(a, id, artisanId);
  }
  @Get('payments') payments(@CurrentUser() a: Actor) {
    return this.market.payments(a);
  }
  @Public() @Get('track/:token') track(@Param('token', qrToken) token: string) {
    return this.market.track(token);
  }

  @Get('counts') counts(@CurrentUser() a: Actor) {
    return this.market.counts(a);
  }
  @Get('notifications') notifications(@CurrentUser() a: Actor) {
    return this.market.notifications(a);
  }
  @Post('notifications/read') @HttpCode(200) markRead(@CurrentUser() a: Actor) {
    return this.market.markNotificationsRead(a);
  }
  @Get('associations') associations(@CurrentUser() a: Actor) {
    return this.market.associations(a);
  }
  @Get('women') women(@CurrentUser() a: Actor) {
    return this.market.women(a);
  }
  @Post('women') addWoman(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(marketWomanSchema)) i: z.infer<typeof marketWomanSchema>,
  ) {
    return this.market.addWoman(a, i);
  }
  @Put('women/:id') updateWoman(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketWomanSchema)) i: z.infer<typeof marketWomanSchema>,
  ) {
    return this.market.updateWoman(a, id, i);
  }
  @Get('crafts') crafts(@CurrentUser() a: Actor) {
    return this.market.crafts(a);
  }
  @Get('organizations') organizations(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(marketOrgQuerySchema)) q: z.infer<typeof marketOrgQuerySchema>,
  ) {
    return this.market.organizations(a, q.status);
  }
  @Post('organizations/:id/review') @HttpCode(200) reviewOrganization(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(marketReviewSchema)) i: z.infer<typeof marketReviewSchema>,
  ) {
    return this.market.reviewOrganization(a, id, i);
  }
}
