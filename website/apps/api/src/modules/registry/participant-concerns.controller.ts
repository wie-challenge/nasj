import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  participantConcernSchema,
  concernReviewSchema,
  pageSchema,
  resourceIdSchema,
  type PageInput,
} from '@nasj/contracts';
import { Public, AdminOnly, CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { RegistryService } from './registry.service.js';
@Controller('api/v1')
export class ParticipantConcernsController {
  constructor(@Inject(RegistryService) private readonly registry: RegistryService) {}
  // nosemgrep: nasj-public-route -- anonymous concern intake by design; strict Zod schema, API rate limit
  @Public() @Post('participant-concerns') @HttpCode(202) intake(
    @Body(new ZodValidationPipe(participantConcernSchema)) input: z.infer<
      typeof participantConcernSchema
    >,
  ) {
    return this.registry.concern(input);
  }
  @AdminOnly() @Get('admin/participant-concerns') list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(pageSchema)) query: PageInput,
  ) {
    return this.registry.concerns(actor, query);
  }
  @AdminOnly() @Patch('admin/participant-concerns/:id') review(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(concernReviewSchema)) input: z.infer<typeof concernReviewSchema>,
  ) {
    return this.registry.reviewConcern(actor, id, input);
  }
}
