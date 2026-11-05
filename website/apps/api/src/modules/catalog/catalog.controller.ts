import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import * as C from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { ProductCatalogService } from './catalog.service.js';

const rid = new ZodValidationPipe(C.resourceIdSchema);

@Controller('api/v1/catalog')
export class ProductCatalogController {
  constructor(@Inject(ProductCatalogService) private readonly catalog: ProductCatalogService) {}

  @Get() workspace(@CurrentUser() a: Actor) {
    return this.catalog.workspace(a);
  }

  @Post('specifications') create(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.specificationCreateSchema)) i: C.SpecificationCreateInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.createSpecification(a, i, k);
  }

  @Post('specifications/:id/revisions') revise(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.specificationRevisionSchema)) i: C.SpecificationRevisionInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.reviseSpecification(a, id, i, k);
  }

  @Post('specification-revisions/:id/submit') submit(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementVersionSchema)) i: { version: number },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.submitSpecification(a, id, i, k);
  }

  @Post('specification-revisions/:id/decision') decide(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.specificationDecisionSchema)) i: z.infer<
      typeof C.specificationDecisionSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.decideSpecification(a, id, i, k);
  }

  @Post('samples') request(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.sampleRequestSchema)) i: C.SampleRequestInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.requestSample(a, i, k);
  }

  @Post('samples/:id/terms') terms(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.sampleTermsSchema)) i: C.SampleTermsInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.agreeTerms(a, id, i, k);
  }

  @Post('samples/:id/accept') acceptTerms(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(
      new ZodValidationPipe(z.object({ termsSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()),
    )
    i: { termsSha256: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.acceptTerms(a, id, i, k);
  }

  @Post('orders/:id/binding') bind(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.bindRevisionSchema)) i: z.infer<typeof C.bindRevisionSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.bindOrderRevision(a, id, i.catalogueRevisionId, k);
  }

  @Post('samples/:id/work') work(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.sampleWorkSchema)) i: C.SampleWorkInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.recordWork(a, id, i, k);
  }

  @Post('samples/:id/evaluations') evaluate(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.sampleEvaluationSchema)) i: C.SampleEvaluationInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.evaluate(a, id, i, k);
  }

  @Post('samples/:id/approval') approve(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.sampleApprovalSchema)) i: C.SampleApprovalInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.catalog.approve(a, id, i, k);
  }
}
