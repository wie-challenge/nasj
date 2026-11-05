import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import * as C from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { InventoryService } from './inventory.service.js';
const rid = new ZodValidationPipe(C.resourceIdSchema);
@Controller('api/v1/inventory')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly service: InventoryService) {}
  @Get('organizations/:id') workspace(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.service.workspace(a, id);
  }
  @Get('my-handovers') mine(@CurrentUser() a: Actor) {
    return this.service.mine(a);
  }
  @Post('organizations/:id/lots') register(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialLotSchema)) b: C.MaterialLotInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.register(a, id, b, k);
  }
  @Post('lots/:id/reservations') reserve(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialReservationSchema)) b: C.MaterialReservationInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.reserve(a, id, b, k);
  }
  @Post('reservations/:id/release') release(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.inventoryReasonSchema)) b: { reason: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.release(a, id, b, k);
  }
  @Post('reservations/:id/handovers') handover(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialHandoverSchema)) b: C.MaterialHandoverInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.handover(a, id, b, k);
  }
  @Post('handovers/:id/receipts') receipt(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialReceiptSchema)) b: C.MaterialReceiptInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.receipt(a, id, b, k);
  }
  @Post('handovers/:id/reconcile') reconcile(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.inventoryReasonSchema)) b: { reason: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.reconcile(a, id, b, k);
  }
  @Post('handovers/:id/returns') returns(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialReturnSchema)) b: C.MaterialReturnInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.returnMaterial(a, id, b, k);
  }
  @Post('returns/:id/disposition') disposition(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialDispositionSchema)) b: C.MaterialDispositionInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.disposition(a, id, b, k);
  }
  @Post('handovers/:id/consumption') consume(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialConsumptionSchema)) b: C.MaterialConsumptionInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.consume(a, id, b, k);
  }
}
