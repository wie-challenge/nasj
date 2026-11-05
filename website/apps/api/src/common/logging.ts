import pino from 'pino';
import type { LoggerService } from '@nestjs/common';
export function createLogger(destination?: pino.DestinationStream) {
  const options: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'amountMillimes',
        '*.amountMillimes',
        'accountNumber',
        '*.accountNumber',
        'iban',
        '*.iban',
        'contactPhone',
        '*.contactPhone',
        'evidence',
        '*.evidence',
        '*.wearableSummary',
        '*.sensorData',
        'email',
        'contactEmail',
        'amountTnd',
        'beneficiary',
        'financial',
        'personalData',
        'health',
        '*.email',
        '*.contactEmail',
        '*.amountTnd',
        '*.beneficiary',
        '*.financial',
        '*.personalData',
        '*.health',
        'password',
        'token',
        'secret',
        'cookie',
        'authorization',
        'body',
        'payload',
        '*.password',
        '*.token',
        '*.secret',
        '*.authorization',
        '*.cookie',
        '*.body',
        '*.payload',
        'req.headers.authorization',
        'req.headers.cookie',
        'wearableSummary',
        'sensorData',
      ],
      remove: true,
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
export const logger = createLogger();
export class NestLogger implements LoggerService {
  log() {
    /* Lifecycle noise is omitted; application events use the safe structured sink. */
  }
  debug() {}
  verbose() {}
  warn() {
    logger.warn('Application warning');
  }
  error() {
    logger.error('Application operation failed');
  }
  fatal() {
    logger.fatal('Application failure');
  }
}
