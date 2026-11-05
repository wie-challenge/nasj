import {
  Headers,
  Body,
  Controller,
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
  duplicateReviewSchema,
  authorizationEvidenceSchema,
  authorizationPolicySchema,
  registryCreateSchema,
  registryUpdateSchema,
  assistedCapacitySchema,
  affiliationChangeSchema,
  affiliationStatusSchema,
  assignmentSchema,
  artisanTransferSchema,
  accountLinkSchema,
  explicitGrantSchema,
  privilegedInviteSchema,
  operatorAssignmentSchema,
  authorizationWithdrawalSchema,
  policyStatusSchema,
  participantSkillsSchema,
  pageSchema,
  resourceIdSchema,
  type PageInput,
} from '@nasj/contracts';
import { CurrentUser, AdminOnly, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { AccessService } from '../foundation/access.service.js';
import { RegistryService } from './registry.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
const rid = new ZodValidationPipe(resourceIdSchema);
@Controller('api/v1')
export class RegistryController {
  constructor(
    @Inject(RegistryService) private readonly registry: RegistryService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(OrganizationsService) private readonly organizations: OrganizationsService,
  ) {}
  @Get('me/context') context(@CurrentUser() actor: Actor) {
    return this.access.context(actor);
  }
  @Get('authorization-policies') policies(@CurrentUser() actor: Actor) {
    return this.registry.policies(actor);
  }
  @AdminOnly() @Post('admin/authorization-policies') policy(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(authorizationPolicySchema)) input: z.infer<
      typeof authorizationPolicySchema
    >,
  ) {
    return this.registry.reviewPolicy(actor, input);
  }
  @AdminOnly() @Patch('admin/authorization-policies/:id') policyStatus(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(policyStatusSchema)) input: z.infer<typeof policyStatusSchema>,
  ) {
    return this.registry.policyStatus(actor, id, input.active, input.reason);
  }
  @Get('associations/me') association(@CurrentUser() actor: Actor) {
    return this.registry.association(actor);
  }
  @Get('associations/me/coordinators') coordinators(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.coordinators(actor, q);
  }
  @Get('associations/me/artisans') list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.list(actor, q);
  }
  @Get('associations/me/artisans/:id/capacity') historyCapacity(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.history(actor, id, 'capacity', q);
  }
  @Get('associations/me/artisans/:id/authorization') historyAuthorization(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.history(actor, id, 'authorization', q);
  }
  @Get('associations/me/artisans/:id/assignments') historyAssignments(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.history(actor, id, 'assignments', q);
  }
  @Post('associations/me/artisans') create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(registryCreateSchema)) input: z.infer<typeof registryCreateSchema>,
  ) {
    return this.registry.create(actor, input);
  }
  @Get('associations/me/artisans/:id') detail(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
  ) {
    return this.registry.detail(actor, id);
  }
  @Patch('associations/me/artisans/:id') update(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(registryUpdateSchema)) input: z.infer<typeof registryUpdateSchema>,
  ) {
    return this.registry.update(actor, id, input);
  }
  @Put('associations/me/artisans/:id/skills') skills(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(participantSkillsSchema)) input: z.infer<
      typeof participantSkillsSchema
    >,
  ) {
    return this.registry.skills(actor, id, input.skills, input.reason);
  }
  @Post('associations/me/artisans/:id/authorization') authorization(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(authorizationEvidenceSchema)) input: z.infer<
      typeof authorizationEvidenceSchema
    >,
  ) {
    return this.registry.authorization(actor, id, input);
  }
  @Post('associations/me/artisans/:id/authorization/:evidenceId/withdraw') withdraw(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Param('evidenceId', rid) evidenceId: string,
    @Body(new ZodValidationPipe(authorizationWithdrawalSchema)) input: z.infer<
      typeof authorizationWithdrawalSchema
    >,
  ) {
    return this.registry.withdraw(actor, id, evidenceId, input.reason);
  }
  @Post('associations/me/artisans/:id/capacity') capacity(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(assistedCapacitySchema)) input: z.infer<
      typeof assistedCapacitySchema
    >,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.registry.capacity(actor, id, input, key);
  }
  @AdminOnly() @Get('admin/access-report') diagnostics(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.diagnostics(actor, q);
  }
  @AdminOnly() @Get('admin/operators') operators(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.governance(actor, q, true);
  }
  @AdminOnly() @Get('admin/coordinators') governance(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.governance(actor, q);
  }
  @AdminOnly() @Post('admin/personnel/invite') invite(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(privilegedInviteSchema)) input: z.infer<
      typeof privilegedInviteSchema
    >,
  ) {
    return this.organizations.invite(
      actor,
      input.organizationId,
      {
        email: input.email,
        roles: [input.persona],
        isManager: false,
      },
      input.reason,
    );
  }
  @AdminOnly() @Post('admin/coordinators/:id/transfer') transfer(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(affiliationChangeSchema)) input: z.infer<
      typeof affiliationChangeSchema
    >,
  ) {
    return this.registry.transferCoordinator(actor, id, input.organizationId, input.reason);
  }
  @AdminOnly() @Patch('admin/coordinators/:id/status') status(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(affiliationStatusSchema)) input: z.infer<
      typeof affiliationStatusSchema
    >,
  ) {
    return this.registry.coordinatorStatus(
      actor,
      id,
      input.status,
      input.reason,
      input.organizationId,
    );
  }
  @AdminOnly() @Post('admin/artisans/:id/assignment') assign(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(assignmentSchema)) input: z.infer<typeof assignmentSchema>,
  ) {
    return this.registry.assign(actor, id, input.coordinatorId, input.reason);
  }
  @AdminOnly() @Post('admin/artisans/:id/transfer') transferArtisan(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(artisanTransferSchema)) input: z.infer<
      typeof artisanTransferSchema
    >,
  ) {
    return this.registry.transferArtisan(actor, id, input);
  }
  @AdminOnly() @Post('admin/artisans/:id/link-account') link(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(accountLinkSchema)) input: z.infer<typeof accountLinkSchema>,
  ) {
    return this.registry.linkAccount(actor, id, input);
  }
  @Put('organizations/:id/members/:memberId/permissions') grant(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Param('memberId', rid) memberId: string,
    @Body(new ZodValidationPipe(explicitGrantSchema)) input: z.infer<typeof explicitGrantSchema>,
  ) {
    return this.registry.explicitGrant(actor, id, memberId, input);
  }
  @AdminOnly() @Post('admin/operator-assignments') operatorAssignment(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(operatorAssignmentSchema)) input: z.infer<
      typeof operatorAssignmentSchema
    >,
  ) {
    return this.registry.operatorAssignment(actor, input);
  }
  @Get('operator/activity') activity(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.operatorActivity(actor, q);
  }
  @Get('operator/dashboard') operator(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.operatorDashboard(actor, q);
  }
  @Post('operator/organizations/:id/duplicate-reviews') reviewDuplicate(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Body(new ZodValidationPipe(duplicateReviewSchema)) input: z.infer<
      typeof duplicateReviewSchema
    >,
  ) {
    return this.registry.recordDuplicateReview(actor, id, input.artisanId, input.reason);
  }
  @Get('operator/organizations/:id/participants') duplicateReview(
    @CurrentUser() actor: Actor,
    @Param('id', rid) id: string,
    @Query(new ZodValidationPipe(pageSchema)) q: PageInput,
  ) {
    return this.registry.duplicateReview(actor, id, q);
  }
}
