import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderBookGateway } from './gateways/order-book.gateway';
import { BalanceGateway } from './gateways/balance.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [AuthModule],
  providers: [OrderBookGateway, BalanceGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
