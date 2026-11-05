import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { ArtisansController } from './artisans.controller.js';
import { ArtisansService } from './artisans.service.js';
@Module({
  imports: [FoundationModule],
  controllers: [ArtisansController],
  providers: [ArtisansService],
})
export class ArtisansModule {}
