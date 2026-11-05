import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ARCJET,
  type ArcjetDecision,
  type ArcjetNest,
  detectBot,
  fixedWindow,
  validateEmail,
} from '@arcjet/nest';
import type { Request, Response } from 'express';
import { emailSchema } from '@nasj/contracts';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { fail } from '../common/errors.js';
import { routeLabel } from '../common/routes.js';
import { logger } from '../common/logging.js';
import { botProtected, healthProbe, policyName, ratePolicy, type PolicyName } from './policies.js';

@Injectable()
export class SecurityService {
  private readonly clients = new Map<string, ArcjetNest>();
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Optional() @Inject(ARCJET) private readonly arcjet?: ArcjetNest,
  ) {}
  async localLimit(name: PolicyName, ip: string, res: Response) {
    const { max, window } = ratePolicy(this.config, name);
    const key = createHmac('sha256', this.config.BETTER_AUTH_SECRET)
      .update(`${name}:${ip}`)
      .digest('hex');
    const rows = await this.db.$queryRaw<
      { count: number; resetAt: Date }[]
    >`INSERT INTO "RateBucket"("key","count","resetAt") VALUES(${key},1,now()+${window}*interval '1 second') ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateBucket"."resetAt"<=now() THEN 1 ELSE "RateBucket"."count"+1 END,"resetAt"=CASE WHEN "RateBucket"."resetAt"<=now() THEN now()+${window}*interval '1 second' ELSE "RateBucket"."resetAt" END RETURNING "count","resetAt"`;
    if (rows[0].count > max) {
      res.setHeader(
        'Retry-After',
        Math.max(1, Math.ceil((rows[0].resetAt.getTime() - Date.now()) / 1000)),
      );
      fail(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }
  }
  async protect(req: Request, res: Response) {
    if (
      !req.path.startsWith('/api/') ||
      healthProbe(req.path, req.method) ||
      req.method === 'OPTIONS'
    )
      return;
    const name = policyName(req.path);
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    if (!isIP(ip)) fail(503, 'SECURITY_UNAVAILABLE', 'Request identity is unavailable.');
    if (!this.config.ARCJET_ENABLED) {
      await this.localLimit(name, ip, res);
      return;
    }
    if (!this.arcjet) fail(503, 'SECURITY_UNAVAILABLE', 'Request protection is unavailable.');
    const bots = botProtected(req.path);
    const email = name === 'registration' ? emailSchema.safeParse(req.body?.email) : null;
    const clientKey = `${name}:${bots}:${email?.success === true}`;
    let client = this.clients.get(clientKey);
    if (!client) {
      const rate = ratePolicy(this.config, name);
      client = this.arcjet.withRule(
        fixedWindow({ mode: this.config.ARCJET_MODE, window: `${rate.window}s`, max: rate.max }),
      );
      if (bots)
        client = client.withRule(
          detectBot({ mode: this.config.ARCJET_MODE, allow: ['CATEGORY:SEARCH_ENGINE'] }),
        );
      if (email?.success)
        client = client.withRule(
          validateEmail({ mode: this.config.ARCJET_MODE, deny: ['INVALID'] }),
        );
      this.clients.set(clientKey, client);
    }
    // No credentials, cookies, query tokens or request bodies are sent to Arcjet.
    const headers: Record<string, string> = {};
    for (const key of [
      'user-agent',
      'accept',
      'accept-language',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'content-type',
    ]) {
      const value = req.headers[key];
      if (typeof value === 'string') headers[key] = value;
    }
    let decision: ArcjetDecision;
    try {
      decision = await client.protect(
        {
          method: req.method,
          url: `${this.config.PUBLIC_APP_URL}${routeLabel(req.path)}`,
          headers,
          ip,
          protocol: req.protocol,
        },
        { ipSrc: ip, ...(email?.success ? { email: email.data } : {}) },
      );
    } catch {
      logger.warn(
        { policy: name, endpoint: routeLabel(req.path), category: 'ERROR' },
        'Arcjet request failed',
      );
      if (this.config.ARCJET_FAILURE_MODE === 'closed')
        fail(503, 'SECURITY_UNAVAILABLE', 'Request protection is temporarily unavailable.');
      await this.localLimit(name, ip, res);
      return;
    }
    const category = decision.reason.isRateLimit()
      ? 'RATE_LIMIT'
      : decision.reason.isBot()
        ? 'BOT'
        : decision.reason.isShield()
          ? 'SHIELD'
          : decision.reason.isEmail()
            ? 'EMAIL'
            : decision.isErrored()
              ? 'ERROR'
              : 'ALLOW';
    res.once('finish', () =>
      logger.info(
        {
          decisionId: decision.id,
          policy: name,
          endpoint: routeLabel(req.path),
          category,
          protections: decision.results.map((result) => result.reason.type),
          wouldDeny: decision.results.some((result) => result.isDenied()),
          status: res.statusCode,
          mode: this.config.ARCJET_MODE,
        },
        'Security decision',
      ),
    );
    if (decision.isErrored()) {
      if (this.config.ARCJET_FAILURE_MODE === 'closed')
        fail(503, 'SECURITY_UNAVAILABLE', 'Request protection is temporarily unavailable.');
      await this.localLimit(name, ip, res);
      return;
    }
    if (decision.isDenied() && this.config.ARCJET_MODE === 'LIVE') {
      if (decision.reason.isRateLimit()) {
        res.setHeader('Retry-After', Math.max(1, decision.reason.reset));
        fail(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
      }
      fail(403, 'SECURITY_DENIED', 'This request could not be accepted.');
    }
  }
}
