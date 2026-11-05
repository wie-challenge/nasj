import { FinanceController } from '../finance/finance.controller.js';
import { FinanceService } from '../finance/finance.service.js';
import { Module } from '@nestjs/common';
import { DirectoryModule } from '../directory/directory.module.js';
import { CommerceController } from './commerce.controller.js';
import { CommerceService } from './commerce.service.js';
import { ProcurementController } from '../procurement/procurement.controller.js';
import { ProcurementService } from '../procurement/procurement.service.js';
import { ProductionOfferService } from '../procurement/production-offers.js';
import { ProductionExecutionService } from '../procurement/execution.js';
import { ProductionPlanningService } from '../procurement/planning.js';
import { LogisticsService } from '../procurement/logistics.js';
import { LogisticsController, PublicTraceController } from '../procurement/logistics.controller.js';
@Module({
  imports: [DirectoryModule],
  controllers: [
    FinanceController,
    CommerceController,
    ProcurementController,
    LogisticsController,
    PublicTraceController,
  ],
  exports: [CommerceService, ProductionOfferService],
  providers: [
    FinanceService,
    CommerceService,
    ProcurementService,
    ProductionOfferService,
    ProductionExecutionService,
    ProductionPlanningService,
    LogisticsService,
  ],
})
export class CommerceModule {}
