import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  emptySchema,
  pageSchema,
  resourceIdSchema,
  settingsSchema,
  notificationPreferencesSchema,
  privacyCreateSchema,
  privacyReviewSchema,
  supportCreateSchema,
  supportUpdateSchema,
  consentCreateSchema,
  type PageInput,
  type SettingsInput,
  type NotificationPreferencesInput,
  type PrivacyCreateInput,
  type PrivacyReviewInput,
  type SupportCreateInput,
  type SupportUpdateInput,
  type ConsentCreateInput,
} from '@nasj/contracts';
import { CurrentUser, AdminOnly, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { GovernanceService } from './governance.service.js';
const casesQuery = pageSchema.extend({ organizationId: resourceIdSchema.optional() });
@Controller('api/v1')
export class GovernanceController {
  constructor(@Inject(GovernanceService) private readonly service: GovernanceService) {}
  @Get('settings/security') security(@CurrentUser() a: Actor) {
    return this.service.security(a);
  }
  @Get('settings/preferences') settings(@CurrentUser() a: Actor) {
    return this.service.settings(a);
  }
  @Patch('settings/preferences') updateSettings(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(settingsSchema)) b: SettingsInput,
  ) {
    return this.service.updateSettings(a, b);
  }
  @Get('notifications/preferences') preferences(@CurrentUser() a: Actor) {
    return this.service.preferences(a);
  }
  @Put('notifications/preferences') updatePreferences(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(notificationPreferencesSchema)) b: NotificationPreferencesInput,
  ) {
    return this.service.updatePreferences(a, b);
  }
  @Get('consents') consents(@CurrentUser() a: Actor) {
    return this.service.consents(a);
  }
  @Post('consents') createConsent(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(consentCreateSchema)) b: ConsentCreateInput,
  ) {
    return this.service.createConsent(a, b);
  }
  @Delete('consents/:id') withdrawConsent(
    @CurrentUser() a: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(emptySchema)) _b: unknown,
  ) {
    return this.service.withdrawConsent(a, id);
  }
  @Post('privacy/requests') createPrivacy(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(privacyCreateSchema)) b: PrivacyCreateInput,
  ) {
    return this.service.createPrivacy(a, b);
  }
  @Get('privacy/requests/me') ownPrivacy(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.service.listPrivacy(a, q);
  }
  @Get('privacy/export') exportOwn(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(emptySchema)) _q: unknown,
  ) {
    return this.service.exportOwn(a);
  }
  @AdminOnly() @Get('admin/privacy-requests') adminPrivacy(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.service.listPrivacy(a, q, true);
  }
  @AdminOnly() @Patch('admin/privacy-requests/:id') reviewPrivacy(
    @CurrentUser() a: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(privacyReviewSchema)) b: PrivacyReviewInput,
  ) {
    return this.service.reviewPrivacy(a, id, b);
  }
  @AdminOnly() @Get('admin/audit-events') adminAudit(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.service.auditEvents(a, q);
  }
  @Get('organizations/:id/audit-events') orgAudit(
    @CurrentUser() a: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.service.auditEvents(a, q, id);
  }
  @AdminOnly() @Get('admin/support/cases') platformCases(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.service.platformCases(a, q);
  }
  @Get('support/cases') cases(
    @CurrentUser() a: Actor,
    @Query(new ZodValidationPipe(casesQuery)) q: z.infer<typeof casesQuery>,
  ) {
    return this.service.cases(a, q, q.organizationId);
  }
  @Post('support/cases') createCase(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(supportCreateSchema)) b: SupportCreateInput,
  ) {
    return this.service.createCase(a, b);
  }
  @Patch('support/cases/:id') updateCase(
    @CurrentUser() a: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(supportUpdateSchema)) b: SupportUpdateInput,
  ) {
    return this.service.updateCase(a, id, b);
  }
  @Post('support/cases/:id/notify') notifyCase(
    @CurrentUser() a: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(emptySchema)) _b: unknown,
  ) {
    return this.service.notifyCase(a, id);
  }
}
