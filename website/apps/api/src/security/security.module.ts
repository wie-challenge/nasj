import { Module, type DynamicModule } from '@nestjs/common';
import { ARCJET, ArcjetModule, type ArcjetNest, shield } from '@arcjet/nest';
import type { AppConfig } from '../config/env.js';
import { logger } from '../common/logging.js';
import { SecurityService } from './security.service.js';
@Module({})
export class SecurityModule {
  static register(config: AppConfig, mock?: ArcjetNest): DynamicModule {
    return {
      module: SecurityModule,
      imports:
        config.ARCJET_ENABLED && !mock
          ? [
              ArcjetModule.forRoot({
                key: config.ARCJET_KEY!,
                rules: [shield({ mode: config.ARCJET_MODE })],
                characteristics: ['ip.src'],
                log: {
                  debug: () => {},
                  info: () => {},
                  warn: () => logger.warn('Arcjet provider warning'),
                  error: () => logger.error('Arcjet provider error'),
                },
              }),
            ]
          : [],
      providers: [SecurityService, ...(mock ? [{ provide: ARCJET, useValue: mock }] : [])],
      exports: [SecurityService],
    };
  }
}
