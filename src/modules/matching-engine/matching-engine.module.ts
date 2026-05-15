import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JobsModule } from '../jobs/jobs.module';
import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { WalletModule } from '../wallet/wallet.module';
import { MatchingEngineService } from './matching-engine.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Trade]),
    JobsModule,
    RealtimeModule,
    WalletModule,
  ],
  providers: [MatchingEngineService],
  exports: [MatchingEngineService],
})
export class MatchingEngineModule {}
