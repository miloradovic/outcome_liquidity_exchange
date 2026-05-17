import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { RedisModule } from '../redis/redis.module';
import { WalletModule } from '../wallet/wallet.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { JobsController } from './jobs.controller';
import { SettlementQueueService } from './settlement-queue.service';
import { SettlementRecoveryService } from './settlement-recovery.service';
import { SettlementWorkerService } from './settlement-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trade, Order]),
    RedisModule,
    WalletModule,
    RealtimeModule,
  ],
  controllers: [JobsController],
  providers: [SettlementQueueService, SettlementWorkerService, SettlementRecoveryService],
  exports: [SettlementQueueService],
})
export class JobsModule {}
