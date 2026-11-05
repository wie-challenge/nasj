import {
  Query,
  Headers,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  pageSchema,
  type PageInput,
  artisanProfileSchema,
  artisanSkillsSchema,
  capacityDeclarationSchema,
  associationLinkSchema,
  delegationGrantSchema,
  assistedProfileSchema,
  emptySchema,
  resourceIdSchema,
  type ArtisanProfileInput,
  type AssistedProfileInput,
  type ArtisanSkillsInput,
  type CapacityDeclarationInput,
  type AssociationLinkInput,
  type DelegationGrantInput,
} from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { ArtisansService } from './artisans.service.js';
@Controller('api/v1')
export class ArtisansController {
  constructor(@Inject(ArtisansService) private readonly artisans: ArtisansService) {}
  @Get('craft-skills') catalog() {
    return this.artisans.catalog();
  }
  @Get('artisans/associations/catalog') associationCatalog() {
    return this.artisans.associationCatalog();
  }
  @Get('artisans/assisted') assisted(@CurrentUser() actor: Actor) {
    return this.artisans.assisted(actor);
  }
  @Get('associations/:id/capacity') associationCapacity(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.artisans.associationCapacity(actor, id);
  }
  @Get('artisans/me') me(@CurrentUser() actor: Actor) {
    return this.artisans.me(actor);
  }
  @Patch('artisans/me') update(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(artisanProfileSchema)) input: ArtisanProfileInput,
  ) {
    return this.artisans.update(actor, input);
  }
  @Get('artisans/me/skills') skills(@CurrentUser() actor: Actor) {
    return this.artisans.skills(actor);
  }
  @Put('artisans/me/skills') replaceSkills(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(artisanSkillsSchema)) input: ArtisanSkillsInput,
  ) {
    return this.artisans.replaceSkills(actor, input);
  }
  @Get('artisans/me/capacity') capacity(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema.omit({ q: true }))) q: Pick<
      PageInput,
      'page' | 'pageSize'
    >,
  ) {
    return this.artisans.capacity(actor, undefined, q);
  }
  @Post('artisans/me/capacity') declare(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(capacityDeclarationSchema)) input: CapacityDeclarationInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.artisans.declare(actor, input, undefined, key);
  }
  @Get('artisans/me/associations') associations(@CurrentUser() actor: Actor) {
    return this.artisans.associations(actor);
  }
  @Post('artisans/me/associations') link(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(associationLinkSchema)) input: AssociationLinkInput,
  ) {
    return this.artisans.link(actor, input);
  }
  @Get('artisans/me/associations/:id/coordinators') coordinators(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.artisans.coordinators(actor, id);
  }
  @Delete('artisans/me/associations/:id') unlink(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(emptySchema)) _body: unknown,
  ) {
    return this.artisans.unlink(actor, id);
  }
  @Get('artisans/me/delegations') delegations(@CurrentUser() actor: Actor) {
    return this.artisans.delegations(actor);
  }
  @Post('artisans/me/delegations') grant(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(delegationGrantSchema)) input: DelegationGrantInput,
  ) {
    return this.artisans.grant(actor, input);
  }
  @Delete('artisans/me/delegations/:id') revoke(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(emptySchema)) _body: unknown,
  ) {
    return this.artisans.revoke(actor, id);
  }
  @Get('artisans/:id') detail(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.artisans.detail(actor, id);
  }
  @Patch('artisans/:id') assistedUpdate(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(assistedProfileSchema)) input: AssistedProfileInput,
  ) {
    return this.artisans.update(actor, input, id);
  }
  @Get('artisans/:id/skills') assistedSkills(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.artisans.skills(actor, id);
  }
  @Put('artisans/:id/skills') assistedReplaceSkills(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(artisanSkillsSchema)) input: ArtisanSkillsInput,
  ) {
    return this.artisans.replaceSkills(actor, input, id);
  }
  @Get('artisans/:id/capacity') assistedCapacity(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Query(new ZodValidationPipe(pageSchema.omit({ q: true }))) q: Pick<
      PageInput,
      'page' | 'pageSize'
    >,
  ) {
    return this.artisans.capacity(actor, id, q);
  }
  @Post('artisans/:id/capacity') assistedDeclare(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(capacityDeclarationSchema)) input: CapacityDeclarationInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.artisans.declare(actor, input, id, key);
  }
}
