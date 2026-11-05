import { Body, Controller, Get, Header, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import * as C from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { CommerceService } from '../commerce/commerce.service.js';
import { ProcurementService } from './procurement.service.js';
import { ProductionOfferService } from './production-offers.js';
import { ProductionExecutionService } from './execution.js';
import { ProductionPlanningService } from './planning.js';
const rid = new ZodValidationPipe(C.resourceIdSchema);
const pages = new ZodValidationPipe(C.procurementPageSchema);
@Controller('api/v1/procurement')
export class ProcurementController {
  constructor(
    @Inject(ProcurementService) private readonly service: ProcurementService,
    @Inject(CommerceService) private readonly commerce: CommerceService,
    @Inject(ProductionOfferService) private readonly production: ProductionOfferService,
    @Inject(ProductionExecutionService) private readonly execution: ProductionExecutionService,
    @Inject(ProductionPlanningService) private readonly planning: ProductionPlanningService,
  ) {}
  @Get('discussions') discussions(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.discussions(a, q.page);
  }
  @Post('rfqs/:id/close') close(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementCloseSchema)) i: z.infer<
      typeof C.procurementCloseSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.close(a, id, i, k);
  }
  @Get('rfqs') list(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.list(a, q.page);
  }
  @Post('rfqs') create(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.rfqCreateSchema)) i: C.RfqCreate,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.commerce.createRfq(a, i, k, true);
  }
  @Get('rfqs/:id') detail(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.service.detail(a, id);
  }
  @Get('rfqs/:id/activity') activity(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.history(a, id, q.page, 'activity');
  }
  @Get('rfqs/:id/revisions') revisions(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.history(a, id, q.page, 'revisions');
  }
  @Post('rfqs/:id/submit') submit(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementVersionSchema)) i: { version: number },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.commerce.rfqAction(a, id, { ...i, next: 'SUBMITTED' }, k);
  }
  @Post('rfqs/:id/review') review(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementVersionSchema)) i: { version: number },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.review(a, id, i, k);
  }
  @Post('rfqs/:id/revisions') revise(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementReviseSchema)) i: z.infer<
      typeof C.procurementReviseSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.revise(a, id, i, k);
  }
  @Post('rfqs/:id/attachments') attach(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementAttachmentSchema)) i: z.infer<
      typeof C.procurementAttachmentSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.attach(a, id, i, k);
  }
  @Post('rfqs/:id/attachments/:fileId/remove') remove(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('fileId', rid) f: string,
    @Body(new ZodValidationPipe(C.procurementVersionSchema)) i: { version: number },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.removeAttachment(a, id, f, i, k);
  }
  @Get('rfqs/:id/attachments/:fileId/token') token(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('fileId', rid) f: string,
  ) {
    return this.service.attachmentToken(a, id, f);
  }
  @Get('rfqs/:id/attachments/:fileId/content') content(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('fileId', rid) f: string,
    @Query(new ZodValidationPipe(z.object({ token: z.string().min(1).max(2000) }).strict())) q: {
      token: string;
    },
  ) {
    return this.service.attachment(a, id, f, q.token);
  }
  @Post('rfqs/:id/questions') question(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementQuestionSchema)) i: { question: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.question(a, id, i, k);
  }
  @Post('rfqs/:id/questions/:questionId/answer') answer(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('questionId', rid) q: string,
    @Body(new ZodValidationPipe(C.procurementAnswerSchema)) i: { answer: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.answer(a, id, q, i, k);
  }
  @Get('rfqs/:id/thread') thread(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.thread(a, id, q.page);
  }
  @Post('rfqs/:id/thread') message(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementMessageSchema)) i: z.infer<
      typeof C.procurementMessageSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.postMessage(a, id, i, k);
  }
  @Post('rfqs/:id/samples') sample(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementSampleSchema)) i: z.infer<
      typeof C.procurementSampleSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.sample(a, id, i, k);
  }
  @Post('rfqs/:id/sample-decisions') decision(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementDecisionSchema)) i: z.infer<
      typeof C.procurementDecisionSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.decideSample(a, id, i, k);
  }
  @Post('effort-assumptions') effort(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.effortAssumptionSchema)) i: z.infer<
      typeof C.effortAssumptionSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.assumeEffort(a, i, k);
  }
  @Post('rfqs/:id/feasibility-assessments') assess(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.feasibilityRequestSchema)) i: z.infer<
      typeof C.feasibilityRequestSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.assess(a, id, i, k);
  }
  @Get('rfqs/:id/feasibility-assessments') assessments(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.service.detail(a, id).then((detail) => ({ items: detail.feasibility }));
  }
  @Post('rfqs/:id/cost-estimates') estimate(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.costEstimateSchema)) i: z.infer<typeof C.costEstimateSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.estimate(a, id, i, k);
  }
  @Get('rfqs/:id/cost-estimates') estimates(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.service.detail(a, id).then((detail) => ({ items: detail.costs }));
  }
  @Post('rfqs/:id/costed-quotes') costedQuote(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.costedQuoteSchema)) i: z.infer<typeof C.costedQuoteSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.issueFromCost(a, id, i, k);
  }
  @Post('rfqs/:id/quote-rejections') rejectQuote(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.quoteRejectSchema)) i: z.infer<typeof C.quoteRejectSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.rejectQuote(a, id, i, k);
  }
  @Post('rfqs/:id/quotes') quote(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementQuoteSchema)) i: z.infer<
      typeof C.procurementQuoteSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.quote(a, id, i, k);
  }
  @Post('rfqs/:id/accept') accept(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementAcceptSchema)) i: z.infer<
      typeof C.procurementAcceptSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.accept(a, id, i, k);
  }
  @Post('rfqs/:id/documents') issue(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementDocumentSchema)) i: z.infer<
      typeof C.procurementDocumentSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.issueDocument(a, id, i, k);
  }
  @Get('documents') documents(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.documents(a, q.page);
  }
  @Get('documents/:id/download') @Header('Cache-Control', 'no-store') download(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.service.downloadDocument(a, id);
  }
  @Post('rfqs/:id/products') publish(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementProductSchema)) i: z.infer<
      typeof C.procurementProductSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.publishProduct(a, id, i, k);
  }
  @Get('products') products(
    @CurrentUser() a: Actor,
    @Query(pages) q: z.infer<typeof C.procurementPageSchema>,
  ) {
    return this.service.products(a, q.page);
  }
  @Post('products/:id/status') status(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementProductStatusSchema)) i: z.infer<
      typeof C.procurementProductStatusSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.productStatus(a, id, i, k);
  }
  @Post('products/:id/reorder') reorder(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.procurementReorderSchema)) i: z.infer<
      typeof C.procurementReorderSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.reorder(a, id, i, k);
  }
  @Get('assigned-offers') assigned(@CurrentUser() a: Actor) {
    return this.production.assigned(a);
  }
  @Get('orders/:id/production') orderProduction(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.production.workspace(a, id);
  }
  @Get('orders/:id/eligibility-assessments') eligibility(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.production.workspace(a, id).then((workspace) => ({
      items: workspace.assessments,
      truncated: workspace.truncated,
      orderVersion: workspace.summary.orderVersion,
    }));
  }
  @Post('orders/:id/eligibility-assessments') assessOrder(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.eligibilityRequestSchema)) i: z.infer<
      typeof C.eligibilityRequestSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.production.assess(a, id, i, k);
  }
  @Get('orders/:id/offers') orderOffers(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.production.workspace(a, id).then((workspace) => ({ items: workspace.offers }));
  }
  @Post('orders/:id/offers') prepareOffer(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.productionOfferSchema)) i: z.infer<
      typeof C.productionOfferSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.production.createOffer(a, id, i, k);
  }
  @Post('offers/:id/issue') issueOffer(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.productionIssueSchema)) i: z.infer<
      typeof C.productionIssueSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.production.issue(a, id, i, k);
  }
  @Post('offers/:id/assisted-decisions') assisted(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.assistedDecisionSchema)) i: z.infer<
      typeof C.assistedDecisionSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.production.assisted(a, id, i, k);
  }
  @Get('my-batches') myBatches(@CurrentUser() a: Actor) {
    return this.execution.mine(a);
  }
  @Get('assigned-batches') assignedBatches(@CurrentUser() a: Actor) {
    return this.execution.assigned(a);
  }
  @Get('orders/:id/execution') executionView(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.execution.execution(a, id);
  }
  @Post('orders/:id/material-lines') materialLines(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.materialLinesSchema)) i: z.infer<typeof C.materialLinesSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.saveMaterials(a, id, i, k);
  }
  @Post('orders/:id/inspection-criteria') inspectionCriteria(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.inspectionCriteriaSchema)) i: z.infer<
      typeof C.inspectionCriteriaSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.saveCriteria(a, id, i, k);
  }
  @Post('orders/:id/consolidations') consolidate(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.consolidationSchema)) i: z.infer<typeof C.consolidationSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.consolidate(a, id, i, k);
  }
  @Get('orders/:id/consolidations') consolidations(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.execution.execution(a, id).then((view) => ({ items: view.preparations }));
  }
  @Post('batches/:id/release') releaseBatch(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.batchReleaseSchema)) i: z.infer<typeof C.batchReleaseSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.release(a, id, i, k);
  }
  @Get('batches/:id/instructions') batchInstructions(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.execution.instructions(a, id);
  }
  @Get('batches/:id/materials') batchMaterials(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.execution.materials(a, id);
  }
  @Post('batches/:id/start') startBatch(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.batchStartSchema)) i: z.infer<typeof C.batchStartSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.start(a, id, i, k);
  }
  @Post('batches/:id/progress') reportProgress(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.progressReportSchema)) i: z.infer<typeof C.progressReportSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.report(a, id, i, k);
  }
  @Get('batches/:id/progress') progressHistory(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.execution.progressList(a, id);
  }
  @Post('batches/:id/progress-corrections') correctProgress(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.progressCorrectionSchema)) i: z.infer<
      typeof C.progressCorrectionSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.correct(a, id, i, k);
  }
  @Post('batches/:id/progress-flags') flagProgress(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.progressFlagSchema)) i: z.infer<typeof C.progressFlagSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.flag(a, id, i, k);
  }
  @Post('batches/:id/submit') submitBatch(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.batchStartSchema)) i: z.infer<typeof C.batchStartSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.submit(a, id, i, k);
  }
  @Get('batches/:id/events') batchEvents(@CurrentUser() a: Actor, @Param('id', rid) id: string) {
    return this.execution.events(a, id);
  }
  @Post('batches/:id/inspections') recordInspection(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.executionInspectionSchema)) i: z.infer<
      typeof C.executionInspectionSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.inspect(a, id, i, k);
  }
  @Get('batches/:id/inspections') inspectionHistory(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.execution.inspections(a, id);
  }
  @Post('batches/:id/reinspections') reinspectBatch(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.reinspectionSchema)) i: z.infer<typeof C.reinspectionSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.execution.reinspect(a, id, i, k);
  }
  @Post('offers/:id/assisted-decisions/:decisionId/verify') verify(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('decisionId', rid) decisionId: string,
  ) {
    return this.production.verify(a, id, decisionId);
  }

  @Get('orders/:id/planning') planningWorkspace(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.planning.workspace(a, id);
  }
  @Get('orders/:id/planning/audit') planningAudit(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(new ZodValidationPipe(C.planningAuditQuerySchema)) q: z.infer<
      typeof C.planningAuditQuerySchema
    >,
  ) {
    return this.planning.overrideHistory(a, id, q.purpose);
  }
  @Post('orders/:id/allocation-plans') createPlan(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.allocationPlanCreateSchema)) i: z.infer<
      typeof C.allocationPlanCreateSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.planning.createPlan(a, id, i, k);
  }
  @Post('allocation-plans/:id/review') reviewPlan(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.allocationPlanReviewSchema)) i: z.infer<
      typeof C.allocationPlanReviewSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.planning.reviewPlan(a, id, i, k);
  }
  @Post('allocation-plans/:id/offers') issuePlanOffers(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.allocationOfferSchema)) i: C.AllocationOfferInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.planning.issueOffers(a, id, i, k);
  }
  @Post('allocation-plans/:id/reallocate') reallocate(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.reallocationSchema)) i: C.ReallocationInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.planning.reallocate(a, id, i, k);
  }
  @Post('allocation-overrides') override(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.allocationOverrideSchema)) i: z.infer<
      typeof C.allocationOverrideSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.planning.override(a, i, k);
  }
  @Post('orders/:id/pricing-suggestion') pricing(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.pricingAssumptionSchema)) i: z.infer<
      typeof C.pricingAssumptionSchema
    >,
  ) {
    return this.planning.pricing(a, id, i);
  }
  @Post('orders/:id/pricing-handoff') handoff(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.pricingHandoffSchema)) i: z.infer<typeof C.pricingHandoffSchema>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.planning.pricingHandoff(a, id, i, k);
  }
  @Post('orders/:id/delivery-simulation') simulate(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.deliverySimulationSchema)) i: z.infer<
      typeof C.deliverySimulationSchema
    >,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.planning.simulate(a, id, i, k);
  }
}
