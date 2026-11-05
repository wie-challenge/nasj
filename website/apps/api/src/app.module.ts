import { MarketModule } from './modules/market/market.module.js';
import { SalesModule } from './modules/sales/sales.module.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { IntelligenceModule } from './modules/intelligence/intelligence.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { DirectoryModule } from './modules/directory/directory.module.js';
import { RegistryModule } from './modules/registry/registry.module.js';
import { CommerceModule } from './modules/commerce/commerce.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { ArtisansModule } from './modules/artisans/artisans.module.js';
import { GovernanceModule } from './modules/governance/governance.module.js';
import { Module, type DynamicModule } from '@nestjs/common';
import type { ArcjetNest } from '@arcjet/nest';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/env.js';
import { PrismaModule } from './database/prisma.module.js';
import { SecurityModule } from './security/security.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { HealthController } from './modules/health/health.controller.js';
@Module({})
export class AppModule {
  static register(config: AppConfig, mock?: ArcjetNest): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        PrismaModule,
        SecurityModule.register(config, mock),
        AuthModule,
        UsersModule,
        OrganizationsModule,
        ArtisansModule,
        GovernanceModule,
        CommerceModule,
        RegistryModule,
        DirectoryModule,
        InventoryModule,
        CatalogModule,
        SalesModule,
        IntelligenceModule,
        CollaborationModule,
        MarketModule,
        DemoModule,
      ],
      controllers: [HealthController],
    };
  }
}
