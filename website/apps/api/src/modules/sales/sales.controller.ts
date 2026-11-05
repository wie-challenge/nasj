import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import * as C from '@nasj/contracts';
import type { z } from 'zod';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { SalesService } from './sales.service.js';
const rid = new ZodValidationPipe(C.resourceIdSchema);
@Controller('api/v1/sales')
export class SalesController {
  constructor(@Inject(SalesService) private readonly service: SalesService) {}
  @Get() workspace(@CurrentUser() a: Actor) {
    return this.service.workspace(a);
  }
  @Post('prospects') create(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.prospectCreateSchema)) i: z.infer<typeof C.prospectCreateSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.create(a, i, k);
  }
  @Post('prospects/:id') update(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.prospectUpdateSchema)) i: z.infer<typeof C.prospectUpdateSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.update(a, id, i, k);
  }
  @Post('prospects/:id/proposals') propose(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.pilotProposalSchema)) i: z.infer<typeof C.pilotProposalSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.propose(a, id, i, k);
  }
}
