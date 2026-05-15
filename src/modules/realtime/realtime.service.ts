import { Injectable } from '@nestjs/common';
import { OrderBookGateway } from './gateways/order-book.gateway';
import { BalanceGateway } from './gateways/balance.gateway';

/**
 * Service to coordinate realtime events across gateways
 * Used by other modules to emit order book and balance updates
 */
@Injectable()
export class RealtimeService {
  constructor(
    private orderBookGateway: OrderBookGateway,
    private balanceGateway: BalanceGateway,
  ) {}

  broadcastOrderBookUpdate(marketId: string, orderBook: unknown): void {
    this.orderBookGateway.broadcastOrderBookUpdate(marketId, orderBook);
  }

  broadcastTradeCreated(marketId: string, trade: unknown): void {
    this.orderBookGateway.broadcastTradeCreated(marketId, trade);
  }

  broadcastBalanceUpdate(
    userId: string,
    balance: {
      availableBalanceCents: number;
      reservedBalanceCents: number;
    },
  ): void {
    this.balanceGateway.broadcastBalanceUpdate(userId, balance);
  }
}
