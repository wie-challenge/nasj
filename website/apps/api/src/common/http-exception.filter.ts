import { CommerceRuleError } from '@nasj/contracts';
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppRequest } from './identity.js';
import { logger } from './logging.js';
export function errorResponse(error: unknown, requestId: string) {
  let status = 500;
  let body: Record<string, unknown> = {
    code: 'INTERNAL_ERROR',
    message: 'Unable to complete this request.',
  };
  const kind = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
  if (error instanceof CommerceRuleError) {
    status =
      error.code === 'FORBIDDEN' || error.code === 'CONSENT_REQUIRED'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_TRANSITION'
            ? 409
            : error.code.startsWith('INVALID_')
              ? 400
              : 409;
    body = {
      code: error.code,
      message: error.message,
      ...(['INVALID_DEADLINE', 'INVALID_CRAFT'].includes(error.code)
        ? {
            fieldErrors: {
              [error.code === 'INVALID_DEADLINE' ? 'deliveryAt' : 'craftSkillId']: [error.message],
            },
          }
        : {}),
    };
  } else if (kind === 'entity.parse.failed') {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: 'Request body must contain valid JSON.' };
  } else if (kind === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' };
  } else if (error instanceof HttpException) {
    status = error.getStatus();
    const data = error.getResponse();
    body =
      typeof data === 'object' && 'code' in data
        ? (data as Record<string, unknown>)
        : {
            code: status === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED',
            message: status === 404 ? 'Resource not found.' : 'Unable to complete this request.',
          };
  } else if (error instanceof ZodError) {
    status = 400;
    body = {
      code: 'VALIDATION_ERROR',
      message: 'Check the submitted fields.',
      fieldErrors: error.flatten().fieldErrors,
    };
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2003', 'P2025', 'P2034'].includes(error.code)
  ) {
    status = 409;
    body = {
      code: 'STATE_CONFLICT',
      message: 'This record changed or conflicts with existing data.',
    };
  }
  if (status >= 500)
    logger.error(
      { requestId, errorType: error instanceof Error ? error.name : 'Unknown' },
      'Request failed',
    );
  return { status, body: { ...body, requestId } };
}
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<AppRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    const result = errorResponse(error, req.requestId ?? randomUUID());
    res.status(result.status).json(result.body);
  }
}
