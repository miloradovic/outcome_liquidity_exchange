import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { RedisModule } from '../redis/redis.module';
import { WalletModule } from '../wallet/wallet.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SettlementQueueService } from './settlement-queue.service';
import { SettlementWorkerService } from './settlement-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trade, Order]),
    RedisModule,
    WalletModule,
    RealtimeModule,
  ],
  providers: [SettlementQueueService, SettlementWorkerService],
  exports: [SettlementQueueService],
})
export class JobsModule {}
