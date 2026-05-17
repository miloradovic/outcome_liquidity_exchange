import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { DEFAULT_PAGINATION, PaginationParams } from '../../common/pagination/pagination';
import { WalletService } from '../wallet/wallet.service';
import { MarketAccessService } from './market-access.service';
import { CreateMarketDto } from './dto/create-market.dto';
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
    private readonly marketAccessService: MarketAccessService,
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
  ) {}

  async getMarkets(
    pagination: PaginationParams = DEFAULT_PAGINATION,
  ): Promise<Market[]> {
    const { limit, offset } = pagination;
    return this.marketRepository.find({
      relations: { outcomes: true },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getMarketById(marketId: string): Promise<Market> {
    return this.marketAccessService.getMarketByIdOrFail(marketId);
  }

  async createMarket(dto: CreateMarketDto): Promise<Market> {
    const closesAt = new Date(dto.closesAt);
    if (Number.isNaN(closesAt.getTime())) {
      throw new BadRequestException('Invalid closesAt value');
    }
    if (closesAt.getTime() <= Date.now()) {
      throw new BadRequestException('closesAt must be in the future');
    }

    return this.dataSource.transaction(async (manager) => {
      const marketRepo = manager.getRepository(Market);
      const outcomeRepo = manager.getRepository(Outcome);

      const market = marketRepo.create({
        slug: dto.slug,
        title: dto.title,
        status: MarketStatus.OPEN,
        closesAt,
      });
      const savedMarket = await marketRepo.save(market);

      const outcomes = await outcomeRepo.save([
        outcomeRepo.create({ market: savedMarket, side: OutcomeSide.YES }),
        outcomeRepo.create({ market: savedMarket, side: OutcomeSide.NO }),
      ]);
      savedMarket.outcomes = outcomes;

      return savedMarket;
    });
  }

  async closeMarket(marketId: string): Promise<Market> {
    return this.dataSource.transaction(async (manager) => {
      const marketRepo = manager.getRepository(Market);

      const market = await marketRepo.findOne({
        where: { id: marketId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!market) {
        throw new NotFoundException('Market not found');
      }

      if (market.status === MarketStatus.RESOLVED) {
        throw new BadRequestException('Resolved market cannot be closed');
      }

      if (market.status === MarketStatus.CLOSED) {
        return market;
      }

      market.status = MarketStatus.CLOSED;
      const now = new Date();
      if (!market.closesAt || market.closesAt.getTime() > now.getTime()) {
        market.closesAt = now;
      }

      return marketRepo.save(market);
    });
  }

  async closeExpiredMarkets(now: Date = new Date()): Promise<number> {
    const result = await this.marketRepository
      .createQueryBuilder()
      .update(Market)
      .set({ status: MarketStatus.CLOSED })
      .where('status = :openStatus', { openStatus: MarketStatus.OPEN })
      .andWhere('closes_at IS NOT NULL')
      .andWhere('closes_at <= :now', { now: now.toISOString() })
      .execute();

    return result.affected ?? 0;
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
