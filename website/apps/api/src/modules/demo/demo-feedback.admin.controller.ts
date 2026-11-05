import { Body, Controller, Get, Inject, Param, Patch, Query } from '@nestjs/common';
import * as C from '@nasj/contracts';
import { AdminOnly, CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { DemoFeedbackAdminService } from './demo-feedback.admin.js';

const rid = new ZodValidationPipe(C.resourceIdSchema);

/**
 * Team moderation of showroom feedback. `@AdminOnly()` plus PolicyService.requireAdmin are both
 * enforced, so a genuine synthetic showroom session — including the SUPPORT persona — is denied.
 */
@AdminOnly()
@Controller('api/v1/admin/demo-feedback')
export class DemoFeedbackAdminController {
  constructor(
    @Inject(DemoFeedbackAdminService) private readonly service: DemoFeedbackAdminService,
  ) {}

  @Get() list(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(C.demoFeedbackQuerySchema)) q: C.DemoFeedbackQuery,
  ) {
    return this.service.list(a, q);
  }

  @Get(':id') detail(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.service.detail(a, id);
  }

  @Patch(':id') decide(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.demoFeedbackDecisionSchema)) i: C.DemoFeedbackDecisionInput,
  ) {
    return this.service.decide(a, id, i);
  }
}
