import { Module } from '@nestjs/common';
import { FoundationModule } from '../foundation/foundation.module.js';
import { MailModule } from '../mail/mail.module.js';
import { MarketController } from './market.controller.js';
import { MarketService } from './market.service.js';
@Module({
  imports: [FoundationModule, MailModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
