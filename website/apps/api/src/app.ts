import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { ArcjetNest } from '@arcjet/nest';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { SecurityService } from './security/security.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authGateway } from './modules/auth/auth.gateway.js';
import { NestLogger, logger } from './common/logging.js';
import { errorResponse, HttpExceptionFilter } from './common/http-exception.filter.js';
import { fail } from './common/errors.js';
import type { AppRequest } from './common/identity.js';
import { routeLabel } from './common/routes.js';
export async function createApp(options: { config?: AppConfig; arcjet?: ArcjetNest } = {}) {
  const config = options.config ?? loadConfig();
  const server = express();
  server.disable('x-powered-by');
  // Configure routing before the Nest adapter installs its first middleware/router.
  server.set('case sensitive routing', true);
  server.set('strict routing', true);
  server.set('trust proxy', config.TRUST_PROXY.length ? config.TRUST_PROXY : false);
  const app = await NestFactory.create(
    AppModule.register(config, options.arcjet),
    new ExpressAdapter(server),
    {
      bodyParser: false,
      logger: new NestLogger(),
      abortOnError: false,
    },
  );
  app.enableCors({
    origin: config.PUBLIC_APP_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Demo-CSRF', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-ID', 'Retry-After'],
  });
  app.use((req: AppRequest, res: Response, next: NextFunction) => {
    const startedAt = performance.now();
    req.requestId = randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (config.PUBLIC_APP_URL.startsWith('https://'))
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    // Always overwrite the only IP header consumed by Better Auth.
    req.headers['x-nasj-client-ip'] = req.ip ?? req.socket.remoteAddress ?? '';
    res.once('finish', () =>
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          endpoint: routeLabel(req.path),
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'Request completed',
      ),
    );
    next();
  });
  const ordinaryJson = express.json({ limit: '32kb' });
  const attachmentJson = express.json({ limit: '384kb' });
  const marketFileJson = express.json({ limit: '6mb' });
  app.use((req: Request, res: Response, next: NextFunction) =>
    (['/api/v1/market/files', '/api/v1/market/products/import'].includes(req.path) &&
      req.method === 'POST'
      ? marketFileJson
      : /^\/api\/v1\/procurement\/rfqs\/[a-zA-Z0-9_-]{1,128}\/attachments$/.test(req.path) &&
          req.method === 'POST'
        ? attachmentJson
        : ordinaryJson)(req, res, next),
  );
  app.use((req: Request, _res: Response, next: NextFunction) => {
    try {
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        (req.headers.origin !== config.PUBLIC_APP_URL || !req.is('application/json'))
      )
        fail(
          403,
          'ORIGIN_REJECTED',
          'Use the approved application origin and JSON request format.',
        );
      next();
    } catch (error) {
      next(error);
    }
  });
  const security = app.get(SecurityService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    void security
      .protect(req, res)
      .then(() => next())
      .catch(next);
  });
  server.all('/api/auth/{*path}', authGateway(app.get(AuthService), config));
  server.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const result = errorResponse(error, (req as AppRequest).requestId ?? randomUUID());
    res.status(result.status).json(result.body);
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  if (!config.ARCJET_ENABLED)
    logger.warn('Remote Arcjet is disabled; only the local database rate limiter is active.');
  await app.init();
  return app;
}
