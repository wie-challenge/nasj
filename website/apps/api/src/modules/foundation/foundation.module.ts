import { Module } from '@nestjs/common';
import { AccessService } from './access.service.js';
import { PolicyService } from './policy.service.js';
@Module({ providers: [PolicyService, AccessService], exports: [PolicyService, AccessService] })
export class FoundationModule {}
