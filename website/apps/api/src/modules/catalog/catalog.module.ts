import { Module } from '@nestjs/common';
import { ProductCatalogController } from './catalog.controller.js';
import { ProductCatalogService } from './catalog.service.js';

@Module({
  controllers: [ProductCatalogController],
  providers: [ProductCatalogService],
})
export class CatalogModule {}
