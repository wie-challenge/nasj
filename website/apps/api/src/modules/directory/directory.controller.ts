import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { directoryGroupIdSchema, directoryQuerySchema, type DirectoryQuery } from '@nasj/contracts';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { DirectoryService } from './directory.service.js';
@Controller('api/v1/directory')
export class DirectoryController {
  constructor(@Inject(DirectoryService) private readonly directory: DirectoryService) {}
  @Get('groups') groups(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(directoryQuerySchema)) query: DirectoryQuery,
  ) {
    return this.directory.list(actor, query);
  }
  @Get('availability') availability(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(directoryQuerySchema)) query: DirectoryQuery,
  ) {
    return this.directory.list(actor, query, true);
  }
  @Get('crafts') crafts(@CurrentUser() actor: Actor) {
    return this.directory.crafts(actor);
  }
  @Get('regions') regions(@CurrentUser() actor: Actor) {
    return this.directory.regions(actor);
  }
  @Get('groups/:id') detail(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(directoryGroupIdSchema)) id: string,
  ) {
    return this.directory.detail(actor, id);
  }
}
