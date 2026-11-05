import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { MailModule } from '../mail/mail.module.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';
@Module({
  imports: [FoundationModule, MailModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
