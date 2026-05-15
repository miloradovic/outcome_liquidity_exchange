import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JobsModule } from '../jobs/jobs.module';
import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { RedisModule } from '../redis/redis.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WalletModule } from '../wallet/wallet.module';
import { MatchingEngineBroadcastService } from './matching-engine-broadcast.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookProjectionService } from './order-book-projection.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Trade]),
    RedisModule,
    JobsModule,
    RealtimeModule,
    WalletModule,
  ],
  providers: [
    MatchingEngineService,
    OrderBookProjectionService,
    MatchingEngineBroadcastService,
  ],
  exports: [
    MatchingEngineService,
    OrderBookProjectionService,
    MatchingEngineBroadcastService,
  ],
})
export class MatchingEngineModule {}
