import { Injectable, Logger } from '@nestjs/common';

import { Trade } from '../markets/entities/trade.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { WalletService } from '../wallet/wallet.service';
import { OrderBookProjectionService } from './order-book-projection.service';

@Injectable()
export class MatchingEngineBroadcastService {
  private readonly logger = new Logger(MatchingEngineBroadcastService.name);

  constructor(
    private readonly projectionService: OrderBookProjectionService,
    private readonly realtimeService: RealtimeService,
    private readonly walletService: WalletService,
  ) {}

  async broadcastOrderBookUpdate(marketId: string): Promise<void> {
    const orderBook = await this.projectionService.getOrderBook(marketId);
    this.realtimeService.broadcastOrderBookUpdate(marketId, orderBook);
  }

  async broadcastTradeAndOrderBookUpdate(trade: Trade): Promise<void> {
    try {
      this.realtimeService.broadcastTradeCreated(trade.marketId, trade);
      await this.broadcastOrderBookUpdate(trade.marketId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to broadcast trade/order book updates: ${message}`);
    }
  }

  async broadcastBalanceUpdates(userIds: string[]): Promise<void> {
    for (const userId of new Set(userIds)) {
      try {
        const wallet = await this.walletService.getWalletByUserId(userId);
        this.realtimeService.broadcastBalanceUpdate(userId, {
          availableBalanceCents: wallet.availableBalanceCents,
          reservedBalanceCents: wallet.reservedBalanceCents,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `Failed to broadcast balance update for user ${userId}: ${message}`,
        );
      }
    }
  }
}
