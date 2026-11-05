import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Public } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
// nosemgrep: nasj-public-route -- liveness/readiness probes for monitoring; status only, no data
@Controller('api/health')
@Public()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  @Get('live') live() {
    return { status: 'ok', service: 'nasj-api' };
  }
  @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      fail(503, 'NOT_READY', 'Service is not ready.');
    }
  }
}
