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
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  accountUpdateSchema,
  deactivateSchema,
  emptySchema,
  pageSchema,
  profileSchema,
  resourceIdSchema,
  type AccountUpdate,
  type PageInput,
  type ProfileInput,
} from '@nasj/contracts';
import { CurrentUser, AdminOnly, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { UsersService } from './users.service.js';
@Controller('api/v1')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get('me') me(@CurrentUser() actor: Actor) {
    return this.users.me(actor);
  }
  @Patch('me') profile(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(profileSchema)) input: ProfileInput,
  ) {
    return this.users.profile(actor, input);
  }
  @Get('me/responsibilities') responsibilities(@CurrentUser() actor: Actor) {
    return this.users.responsibilities(actor);
  }
  @Post('me/sessions/revoke-others') @HttpCode(200) revokeOthers(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(emptySchema)) _body: unknown,
  ) {
    return this.users.revokeOtherSessions(actor);
  }
  @Get('me/sessions') sessions(@CurrentUser() actor: Actor) {
    return this.users.sessions(actor);
  }
  @Delete('me/sessions/:id') revoke(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(emptySchema)) _body: unknown,
  ) {
    return this.users.revokeSession(actor, id);
  }
  @Post('me/deactivate') @HttpCode(200) async deactivate(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(deactivateSchema)) _input: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.users.deactivate(actor);
    res.clearCookie('nasj_demo.session_token', { path: '/', httpOnly: true, sameSite: 'lax' });
    res.clearCookie('nasj.session_token', { path: '/', httpOnly: true, sameSite: 'lax' });
    res.clearCookie('__Secure-nasj.session_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
    return result;
  }
  @Get('users/:id') detail(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.users.detail(actor, id);
  }
  @AdminOnly() @Get('admin/users') list(
    @Query(new ZodValidationPipe(pageSchema)) query: PageInput,
  ) {
    return this.users.list(query);
  }
  @AdminOnly() @Get('admin/users/:id') adminDetail(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
  ) {
    return this.users.detail(actor, id);
  }
  @AdminOnly() @Patch('admin/users/:id') update(
    @CurrentUser() actor: Actor,
    @Param('id', new ZodValidationPipe(resourceIdSchema)) id: string,
    @Body(new ZodValidationPipe(accountUpdateSchema)) input: AccountUpdate,
  ) {
    return this.users.update(actor, id, input);
  }
}
