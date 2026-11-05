import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { DirectoryController } from './directory.controller.js';
import { DirectoryService } from './directory.service.js';
@Module({
  imports: [FoundationModule],
  controllers: [DirectoryController],
  providers: [DirectoryService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
