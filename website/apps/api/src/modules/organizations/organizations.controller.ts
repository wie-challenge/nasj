import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  emptySchema,
  pageSchema,
  resourceIdSchema,
  organizationTypeSchema,
  organizationCreateSchema,
  organizationUpdateSchema,
  invitationCreateSchema,
  invitationAcceptSchema,
  membershipUpdateSchema,
  membershipRolesSchema,
  organizationReviewSchema,
  type PageInput,
  type OrganizationCreateInput,
  type OrganizationUpdateInput,
  type InvitationCreateInput,
  type MembershipUpdateInput,
  type MembershipRolesInput,
} from '@nasj/contracts';
import { CurrentUser, AdminOnly, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('api/v1')
export class OrganizationsController {
  constructor(@Inject(OrganizationsService) private readonly organizations: OrganizationsService) {}
  @Post('organizations') create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(organizationCreateSchema)) input: OrganizationCreateInput,
  ) {
    return this.organizations.create(actor, input);
  }
  @Get('organizations') list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) query: PageInput,
  ) {
    return this.organizations.list(actor, query);
  }
  @Get('organizations/:id') detail(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.organizations.detail(actor, id);
  }
  @Patch('organizations/:id') update(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(organizationUpdateSchema)) input: OrganizationUpdateInput,
  ) {
    return this.organizations.update(actor, id, input);
  }
  @Post('organizations/:id/submit-approval') @HttpCode(200) submit(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(emptySchema)) _input: unknown,
  ) {
    return this.organizations.submitApproval(actor, id);
  }
  @Get('organizations/:id/members') members(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Query(new ZodValidationPipe(pageSchema)) query: PageInput,
  ) {
    return this.organizations.members(actor, id, query);
  }
  @Get('organizations/:id/invitations') invitations(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Query(new ZodValidationPipe(pageSchema)) query: PageInput,
  ) {
    return this.organizations.invitations(actor, id, query);
  }
  @Post('organizations/:id/invitations') invite(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(invitationCreateSchema)) input: InvitationCreateInput,
  ) {
    return this.organizations.invite(actor, id, input);
  }
  @Post('organizations/:id/invitations/:invitationId/resend') @HttpCode(200) resend(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Param('invitationId', new ZodValidationPipe(resourceIdSchema)) invitationId: string,
    @Body(new ZodValidationPipe(emptySchema)) _input: unknown,
  ) {
    return this.organizations.resendInvitation(actor, id, invitationId);
  }
  @Delete('organizations/:id/invitations/:invitationId') cancel(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Param('invitationId', new ZodValidationPipe(resourceIdSchema)) invitationId: string,
    @Body(new ZodValidationPipe(emptySchema)) _input: unknown,
  ) {
    return this.organizations.cancelInvitation(actor, id, invitationId);
  }
  @Post('invitations/accept') @HttpCode(200) accept(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(invitationAcceptSchema)) input: { token: string },
  ) {
    return this.organizations.acceptInvitation(actor, input.token);
  }
  @Patch('organizations/:id/members/:memberId') member(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Param('memberId', new ZodValidationPipe(resourceIdSchema)) memberId: string,
    @Body(new ZodValidationPipe(membershipUpdateSchema)) input: MembershipUpdateInput,
  ) {
    return this.organizations.updateMember(actor, id, memberId, input);
  }
  @Put('organizations/:id/members/:memberId/roles') roles(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Param('memberId', new ZodValidationPipe(resourceIdSchema)) memberId: string,
    @Body(new ZodValidationPipe(membershipRolesSchema)) input: MembershipRolesInput,
  ) {
    return this.organizations.setRoles(actor, id, memberId, input);
  }
  @Delete('organizations/:id/members/:memberId') remove(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Param('memberId', new ZodValidationPipe(resourceIdSchema)) memberId: string,
    @Body(new ZodValidationPipe(organizationReviewSchema)) input: { reason: string },
  ) {
    return this.organizations.removeMember(actor, id, memberId, input.reason);
  }
  @AdminOnly() @Get('admin/organizations') adminList(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema.extend({ type: organizationTypeSchema.optional() })))
    query: PageInput & { type?: OrganizationCreateInput['type'] },
  ) {
    return this.organizations.adminList(actor, query);
  }
  @AdminOnly() @Get('admin/organizations/pending') pending(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) query: PageInput,
  ) {
    return this.organizations.adminList(actor, query, true);
  }
  @AdminOnly() @Get('admin/organizations/:id') adminDetail(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.organizations.adminDetail(actor, id);
  }
  @AdminOnly() @Post('admin/organizations/:id/approve') @HttpCode(200) approve(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(organizationReviewSchema)) input: { reason: string },
  ) {
    return this.organizations.review(actor, id, 'APPROVED', input.reason);
  }
  @AdminOnly() @Post('admin/organizations/:id/reject') @HttpCode(200) reject(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(organizationReviewSchema)) input: { reason: string },
  ) {
    return this.organizations.review(actor, id, 'REJECTED', input.reason);
  }
  @AdminOnly() @Post('admin/organizations/:id/suspend') @HttpCode(200) suspend(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(organizationReviewSchema)) input: { reason: string },
  ) {
    return this.organizations.review(actor, id, 'SUSPENDED', input.reason);
  }
}
