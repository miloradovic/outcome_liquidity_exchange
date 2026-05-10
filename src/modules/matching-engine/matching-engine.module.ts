import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JobsModule } from '../jobs/jobs.module';
import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { MatchingEngineService } from './matching-engine.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Trade]), JobsModule],
  providers: [MatchingEngineService],
  exports: [MatchingEngineService],
})
export class MatchingEngineModule {}
