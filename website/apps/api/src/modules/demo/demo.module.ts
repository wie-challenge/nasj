import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FoundationModule } from '../foundation/foundation.module.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';
import { DemoFeedbackAdminController } from './demo-feedback.admin.controller.js';
import { DemoFeedbackAdminService } from './demo-feedback.admin.js';
@Module({
  imports: [AuthModule, FoundationModule],
  controllers: [DemoController, DemoFeedbackAdminController],
  providers: [DemoService, DemoFeedbackAdminService],
})
export class DemoModule {}
