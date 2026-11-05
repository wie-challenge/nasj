import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import * as C from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { CollaborationService } from './collaboration.service.js';

const rid = new ZodValidationPipe(C.resourceIdSchema);

@Controller('api/v1/collaboration')
export class CollaborationController {
  constructor(@Inject(CollaborationService) private readonly service: CollaborationService) {}

  @Get() workspace(@CurrentUser() a: Actor) {
    return this.service.workspace(a);
  }

  @Get('order-feedback') feedback(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(C.feedbackListQuerySchema)) q: C.FeedbackListQuery,
  ) {
    return this.service.listOrderFeedback(a, q);
  }

  @Get('order-feedback/:id/history') feedbackHistory(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Query(new ZodValidationPipe(C.feedbackHistoryQuerySchema)) q: C.FeedbackHistoryQuery,
  ) {
    return this.service.feedbackHistory(a, id, q);
  }

  @Post('orders/:id/feedback') createFeedback(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.feedbackCreateSchema)) i: C.FeedbackCreateInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.createOrderFeedback(a, id, i, k);
  }

  @Post('order-feedback/:id/corrections') correctFeedback(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.feedbackCorrectionSchema)) i: C.FeedbackCorrectionInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.correctOrderFeedback(a, id, i, k);
  }

  @Post('order-feedback/:id/follow-up') followUpFeedback(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.feedbackFollowUpSchema)) i: C.FeedbackFollowUpInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.followUpOrderFeedback(a, id, i, k);
  }

  @Post('order-feedback/:id/case-link') linkFeedbackCase(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.feedbackCaseLinkSchema)) i: C.FeedbackCaseLinkInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.linkOrderFeedbackCase(a, id, i, k);
  }

  @Post('counteroffers/preview') previewCounter(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.counterofferSchema)) i: C.CounterofferInput,
  ) {
    return this.service.previewCounter(a, i);
  }

  @Post('schedule-revisions/preview') previewSchedule(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.scheduleRevisionSchema)) i: C.ScheduleRevisionInput,
  ) {
    return this.service.previewSchedule(a, i);
  }

  @Post('exceptions') report(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.exceptionReportSchema)) i: C.ExceptionReportInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.reportException(a, i, k);
  }

  @Post('exceptions/:id') updateException(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.exceptionUpdateSchema)) i: C.ExceptionUpdateInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.updateException(a, id, i, k);
  }

  @Post('schedule-revisions') propose(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.scheduleRevisionSchema)) i: C.ScheduleRevisionInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.proposeSchedule(a, i, k);
  }

  @Post('schedule-revisions/:id/decision') decide(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.scheduleDecisionSchema)) i: C.ScheduleDecisionInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.decideSchedule(a, id, i, k);
  }

  @Post('counteroffers') counter(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.counterofferSchema)) i: C.CounterofferInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.counter(a, i, k);
  }

  @Post('counteroffers/:id/review') reviewCounter(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.counterofferReviewSchema)) i: C.CounterofferReviewInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.reviewCounter(a, id, i, k);
  }

  @Post('counteroffers/:id/accept') acceptCounter(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.emptySchema)) _i: Record<string, never>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.acceptCounter(a, id, k);
  }

  @Post('availability/pause') pause(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.availabilityPauseSchema)) i: C.AvailabilityPauseInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.pauseAvailability(a, i, k);
  }

  @Post('availability/resume') resume(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.emptySchema)) _i: Record<string, never>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.resumeAvailability(a, k);
  }

  @Post('tickets') createTicket(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.ticketCreateSchema)) i: C.TicketCreateInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.createTicket(a, i, k);
  }

  @Post('tickets/:id') updateTicket(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.ticketUpdateSchema)) i: C.TicketUpdateInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.updateTicket(a, id, i, k);
  }

  @Post('orders/:id/discussions') post(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.discussionPostSchema)) i: C.DiscussionPostInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.postDiscussion(a, id, i, k);
  }

  @Post('tickets/:id/corrections') correction(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.ticketCorrectionSchema)) i: { detail: string },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.correctTicket(a, id, i, k);
  }

  @Post('tickets/:id/attachments') addAttachment(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.supportAttachmentSchema)) i: {
      filename: string;
      mime: string;
      base64: string;
    },
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.addAttachment(a, id, i, k);
  }

  @Get('tickets/:id/attachments/:attachmentId') attachment(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Param('attachmentId', rid) attachmentId: string,
  ) {
    return this.service.attachment(a, id, attachmentId);
  }

  @Post('notifications/:id/retry') retryNotification(
    @CurrentUser() a: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(C.emptySchema)) _i: Record<string, never>,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.retryNotification(a, id, k);
  }

  @Post('notifications/preferences') preference(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(C.notificationPreferenceSchema)) i: C.NotificationPreferenceInput,
    @Headers('idempotency-key') k?: string,
  ) {
    return this.service.setPreference(a, i, k);
  }
}
