import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MatchingEngineModule } from '../matching-engine/matching-engine.module';
import { MarketsModule } from '../markets/markets.module';
import { Order } from '../markets/entities/order.entity';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    WalletModule,
    MatchingEngineModule,
    MarketsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
