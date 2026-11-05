import { Body, Controller, Get, Header, Headers, Inject, Param, Post } from '@nestjs/common';
import * as C from '@nasj/contracts';
import { CurrentUser, Public, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { LogisticsService } from './logistics.js';

const rid = new ZodValidationPipe(C.resourceIdSchema);
@Controller('api/v1/procurement')
export class LogisticsController {
  constructor(@Inject(LogisticsService) private readonly logistics: LogisticsService) {}
  @Get('orders/:id/shipments') shipments(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.logistics.shipments(actor, id);
  }
  @Post('orders/:id/shipments') createShipment(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.shipmentCreateSchema)) input: C.ShipmentCreateInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.createShipment(actor, id, input, key);
  }
  @Get('shipments/:id') shipment(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.logistics.shipment(actor, id);
  }
  @Post('shipments/:id/cancel') cancel(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.shipmentCancelSchema)) input: C.ShipmentCancelInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.cancel(actor, id, input, key);
  }
  @Post('shipments/:id/pickups') schedule(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.pickupSchema)) input: C.PickupInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.schedule(actor, id, input, key);
  }
  @Post('shipments/:id/handovers') handover(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.handoverSchema)) input: C.HandoverInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.handover(actor, id, input, key);
  }
  @Post('shipments/:id/delivery-reports') report(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.deliveryReportSchema)) input: C.DeliveryReportInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.reportDelivery(actor, id, input, key);
  }
  @Post('shipments/:id/buyer-confirmations') confirm(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.buyerConfirmationSchema)) input: C.BuyerConfirmationInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.confirmDelivery(actor, id, input, key);
  }
  @Get('pickups') pickups(@CurrentUser() actor: Actor) {
    return this.logistics.pickups(actor);
  }
  @Get('orders/:id/traceability') traceability(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.logistics.traceability(actor, id);
  }
  @Post('orders/:id/traceability') draft(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.traceabilityDraftSchema)) input: C.TraceabilityDraftInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.draftTraceability(actor, id, input, key);
  }
  @Post('traceability/:id/submit-review') submit(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.traceabilityReasonSchema)) input: { reason: string },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.submitReview(actor, id, input, key);
  }
  @Post('traceability/:id/publish') publish(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.traceabilityReasonSchema)) input: { reason: string },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.publish(actor, id, input, key);
  }
  @Post('traceability/:id/revoke') revoke(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.traceabilityReasonSchema)) input: { reason: string },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.revoke(actor, id, input, key);
  }
  @Post('traceability/:id/corrections') correct(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.traceabilityDraftSchema)) input: C.TraceabilityDraftInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.correct(actor, id, input, key);
  }
  @Get('orders/:id/financial-summary') summary(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.logistics.financialSummary(actor, id);
  }
  @Get('my-compensation') mine(@CurrentUser() actor: Actor) {
    return this.logistics.myCompensation(actor);
  }
  @Get('artisans/:id/compensation') compensation(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.logistics.compensation(actor, id);
  }
  @Post('orders/:id/payables/reconcile') reconcile(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.payableReconcileSchema)) input: C.PayableReconcileInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.reconcile(actor, id, input, key);
  }
  @Get('orders/:id/payables') payables(@CurrentUser() actor: Actor, @Param('id', rid) id: string) {
    return this.logistics.payables(actor, id);
  }
  @Get('orders/:id/payment-simulations') simulations(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.logistics.simulations(actor, id);
  }
  @Post('orders/:id/payment-simulations') simulate(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.simulationSchema)) input: C.SimulationInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.simulate(actor, id, input, key);
  }
  @Post('payment-simulations/:id/advance') advance(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.simulationAdvanceSchema)) input: C.SimulationAdvanceInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.logistics.advance(actor, id, input, key);
  }
}

@Controller('api/v1/public')
export class PublicTraceController {
  constructor(@Inject(LogisticsService) private readonly logistics: LogisticsService) {}
  // nosemgrep: nasj-public-route -- Anonymous QR read by design; service permits only published privacy-safe snapshots and revocations, never private worker or finance data.
  @Public()
  @Get('traceability/:token')
  @Header('Cache-Control', 'no-store')
  trace(@Param('token') token: string) {
    return this.logistics.publicTrace(token);
  }
}
