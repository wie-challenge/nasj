import { Body, Controller, Get, Headers, Inject, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as C from '@nasj/contracts';
import { Public } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { DemoService } from './demo.service.js';
// nosemgrep: nasj-public-route -- Anonymous showroom entry by design; DEMO_MODE denies live use and service enforces visitor ownership, origin/CSRF and idempotency.
@Public()
@Controller('api/v1/demo')
export class DemoController {
  constructor(@Inject(DemoService) private readonly demo: DemoService) {}
  @Get('session') session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.demo.session(req, res);
  }
  @Post('start') start(
    @Req() req: Request,
    @Body(new ZodValidationPipe(C.demoStartSchema)) _body: Record<string, never>,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.demo.start(req, key);
  }
  @Post('switch') switch(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(C.demoSwitchSchema)) body: { persona: C.DemoPersona | 'operator' },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.demo.switch(req, res, body.persona, key);
  }
  @Post('feedback') feedback(
    @Req() req: Request,
    @Body(new ZodValidationPipe(C.demoFeedbackCreateSchema)) body: C.DemoFeedbackCreateInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.demo.submitFeedback(req, body, key);
  }

  @Get('feedback') myFeedback(
    @Req() req: Request,
    @Query(new ZodValidationPipe(C.demoFeedbackQuerySchema)) query: C.DemoFeedbackQuery,
  ) {
    return this.demo.myFeedback(req, query);
  }

  @Post('reset') reset(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(C.demoResetSchema)) body: C.DemoResetInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.demo.reset(req, res, body, key);
  }
}
