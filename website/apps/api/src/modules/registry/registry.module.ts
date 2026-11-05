import { ParticipantConcernsController } from './participant-concerns.controller.js';
import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { RegistryController } from './registry.controller.js';
import { RegistryService } from './registry.service.js';
@Module({
  imports: [FoundationModule, OrganizationsModule],
  controllers: [RegistryController, ParticipantConcernsController],
  providers: [RegistryService],
})
export class RegistryModule {}
