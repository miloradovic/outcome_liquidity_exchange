import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MatchingEngineModule } from '../matching-engine/matching-engine.module';
import { Market } from './entities/market.entity';
import { Outcome } from './entities/outcome.entity';
import { Order } from './entities/order.entity';
import { Trade } from './entities/trade.entity';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Market, Outcome, Order, Trade]),
    MatchingEngineModule,
  ],
  controllers: [MarketsController],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MarketsModule {}
