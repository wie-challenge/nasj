import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
export type Actor = {
  id: string;
  requestId?: string;
  sessionId: string;
  sessionCreatedAt: Date;
  sessionExpiresAt: Date;
  role: 'USER' | 'ADMIN';
};
export type AppRequest = Request & { requestId: string; actor: Actor };
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor =>
    context.switchToHttp().getRequest<AppRequest>().actor,
);
export const IS_PUBLIC = Symbol('IS_PUBLIC');
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const ADMIN_ONLY = Symbol('ADMIN_ONLY');
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
