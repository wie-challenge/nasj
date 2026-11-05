import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import * as C from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { IntelligenceService } from './intelligence.service.js';

@Controller('api/v1/intelligence')
export class IntelligenceController {
  constructor(@Inject(IntelligenceService) private readonly intelligence: IntelligenceService) {}

  @Get() workspace(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(C.intelligencePeriodSchema)) q: z.infer<
      typeof C.intelligencePeriodSchema
    >,
  ) {
    return this.intelligence.workspace(a, q.month);
  }
  @Post('batches/:id/forecasts') forecast(
    @CurrentUser() a: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(C.forecastSnapshotSchema)) i: z.infer<
      typeof C.forecastSnapshotSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.intelligence.saveForecast(a, id, i, k);
  }
  @Post('batches/:id/time-records') time(
    @CurrentUser() a: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(C.productionTimeSchema)) i: z.infer<typeof C.productionTimeSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.intelligence.reportTime(a, id, i, k);
  }
  @Get('batches/:id/time-records') timeHistory(@CurrentUser() a: Actor, @Param('id') id: string) {
    return this.intelligence.timeHistory(a, id);
  }
  @Get('batches/:id/earnings') earnings(@CurrentUser() a: Actor, @Param('id') id: string) {
    return this.intelligence.earnings(a, id);
  }
  @Post('alerts/evaluate') evaluate(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.intelligencePeriodSchema)) i: z.infer<
      typeof C.intelligencePeriodSchema
    >,
  ) {
    return this.intelligence.evaluateAlerts(a, i.month);
  }
  @Post('alerts/:id/decision') alert(
    @CurrentUser() a: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(C.alertDecisionSchema)) i: z.infer<typeof C.alertDecisionSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.intelligence.decideAlert(a, id, i, k);
  }
  @Post('reporting-policy/review') policy(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.reportingPolicySchema)) i: z.infer<
      typeof C.reportingPolicySchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.intelligence.reviewPolicy(a, i, k);
  }
  @Post('ranking-audit/findings') finding(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.rankingAuditFindingSchema)) i: z.infer<
      typeof C.rankingAuditFindingSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.intelligence.recordFinding(a, i, k);
  }

  @Get('association-outcomes') outcomes(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(C.associationOutcomeQuerySchema)) q: z.infer<
      typeof C.associationOutcomeQuerySchema
    >,
  ) {
    return this.intelligence.associationOutcomes(a, q.from, q.to);
  }
}
