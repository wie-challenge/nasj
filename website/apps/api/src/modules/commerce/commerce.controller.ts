import { Body, Controller, Get, Header, Headers, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  resourceIdSchema,
  rfqCreateSchema,
  rfqEditSchema,
  rfqActionSchema,
  offerCreateSchema,
  offerActionSchema,
  batchActionSchema,
  progressSchema,
  inspectionSchema,
  orderActionSchema,
  paymentCreateSchema,
  paymentActionSchema,
  type RfqCreate,
  type RfqEdit,
  type RfqAction,
  type OfferCreate,
  type OfferAction,
  type BatchAction,
  type ProgressInput,
  type InspectionInput,
  type OrderAction,
  type PaymentCreate,
  type PaymentAction,
} from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { CommerceService } from './commerce.service.js';
@Controller('api/v1/commerce')
export class CommerceController {
  constructor(@Inject(CommerceService) private readonly service: CommerceService) {}
  @Get('workspace') workspace(@CurrentUser() actor: Actor) {
    return this.service.workspace(actor);
  }
  @Get('catalog') catalog(@CurrentUser() actor: Actor) {
    return this.service.catalog(actor);
  }
  @Get('inbox') inbox(@CurrentUser() actor: Actor) {
    return this.service.inbox(actor);
  }
  @Get('orders/:id/report') report(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.service.report(actor, id);
  }
  @Get('orders/:id/report.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="synthetic-commerce.csv"')
  @Header('Cache-Control', 'no-store')
  reportCsv(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.service.reportCsv(actor, id);
  }
  @Post('rfqs') create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(rfqCreateSchema)) input: RfqCreate,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.createRfq(actor, input, key);
  }
  @Patch('rfqs/:id') edit(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(rfqEditSchema)) input: RfqEdit,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.editRfq(actor, id, input, key);
  }
  @Post('rfqs/:id/actions') rfqAction(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(rfqActionSchema)) input: RfqAction,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.rfqAction(actor, id, input, key);
  }
  @Post('offers') offer(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(offerCreateSchema)) input: OfferCreate,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.createOffer(actor, input, key);
  }
  @Post('offers/:id/actions') offerAction(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(offerActionSchema)) input: OfferAction,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.offerAction(actor, id, input, key);
  }
  @Post('batches/:id/actions') batchAction(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(batchActionSchema)) input: BatchAction,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.batchAction(actor, id, input, key);
  }
  @Post('batches/:id/progress') progress(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(progressSchema)) input: ProgressInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.progress(actor, id, input, key);
  }
  @Post('batches/:id/inspections') inspect(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(inspectionSchema)) input: InspectionInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.inspect(actor, id, input, key);
  }
  @Post('orders/:id/actions') orderAction(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(orderActionSchema)) input: OrderAction,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.orderAction(actor, id, input, key);
  }
  @Post('payments') payment(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(paymentCreateSchema)) input: PaymentCreate,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.createPayment(actor, input, key);
  }
  @Post('payments/:id/actions') paymentAction(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(paymentActionSchema)) input: PaymentAction,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.paymentAction(actor, id, input, key);
  }
}
