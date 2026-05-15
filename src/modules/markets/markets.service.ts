import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { MatchingEngineService, OrderBookView } from '../matching-engine/matching-engine.service';
import { WalletService } from '../wallet/wallet.service';
import { Market } from './entities/market.entity';
import { Outcome } from './entities/outcome.entity';
import { Order } from './entities/order.entity';
import { Trade } from './entities/trade.entity';
import { MarketStatus } from './enums/market-status.enum';
import { OutcomeSide } from './enums/outcome-side.enum';
import { TradeStatus } from './enums/trade-status.enum';

@Injectable()
export class MarketsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
    private readonly matchingEngineService: MatchingEngineService,
  ) {}

  async getMarkets(): Promise<Market[]> {
    return this.marketRepository.find({
      relations: { outcomes: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getMarketById(marketId: string): Promise<Market> {
    const market = await this.marketRepository.findOne({
      where: { id: marketId },
      relations: { outcomes: true },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    return market;
  }

  async getOrderBook(marketId: string): Promise<OrderBookView> {
    await this.getMarketById(marketId);
    return this.matchingEngineService.getOrderBook(marketId);
  }

  async resolveMarket(marketId: string, winningSide: OutcomeSide): Promise<Market> {
    return this.dataSource.transaction(async (manager) => {
      const marketRepo = manager.getRepository(Market);
      const outcomeRepo = manager.getRepository(Outcome);
      const tradeRepo = manager.getRepository(Trade);
      const orderRepo = manager.getRepository(Order);

      const market = await marketRepo.findOne({
        where: { id: marketId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!market) {
        throw new NotFoundException('Market not found');
      }

      if (market.status === MarketStatus.RESOLVED) {
        throw new BadRequestException('Market is already resolved');
      }

      const hasWinningOutcome = await outcomeRepo.exists({
        where: {
          market: { id: marketId },
          side: winningSide,
        },
      });
      if (!hasWinningOutcome) {
        throw new BadRequestException('Winning side is not defined for this market');
      }

      const hasPendingSettlements = await tradeRepo.exists({
        where: {
          marketId,
          status: TradeStatus.PENDING_SETTLEMENT,
        },
      });
      if (hasPendingSettlements) {
        throw new ConflictException('Cannot resolve market while settlements are pending');
      }

      const settledTrades = await tradeRepo.find({
        where: {
          marketId,
          status: TradeStatus.SETTLED,
        },
        select: ['id', 'yesOrderId', 'noOrderId', 'quantity'],
      });

      const orderIds = Array.from(
        new Set(
          settledTrades.flatMap((trade) => [trade.yesOrderId, trade.noOrderId]),
        ),
      );

      const orders = orderIds.length > 0
        ? await orderRepo.find({
          where: { id: In(orderIds) },
          select: ['id', 'userId'],
        })
        : [];
      const ordersById = new Map(orders.map((order) => [order.id, order]));

      for (const trade of settledTrades) {
        const winnerOrderId = winningSide === OutcomeSide.YES
          ? trade.yesOrderId
          : trade.noOrderId;
        const winnerOrder = ordersById.get(winnerOrderId);
        if (!winnerOrder) {
          throw new NotFoundException(`Winning order not found for trade ${trade.id}`);
        }

        const payoutCents = trade.quantity * 100;
        if (!Number.isSafeInteger(payoutCents) || payoutCents <= 0) {
          throw new BadRequestException(`Invalid payout amount for trade ${trade.id}`);
        }

        await this.walletService.settleCredit(
          winnerOrder.userId,
          payoutCents,
          `market:${market.id}:resolve:${trade.id}:${winningSide}:credit`,
          trade.id,
          manager,
        );
      }

      market.status = MarketStatus.RESOLVED;
      market.resolvedOutcome = winningSide;

      return marketRepo.save(market);
    });
  }
}
