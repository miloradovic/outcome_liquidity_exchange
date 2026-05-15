import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';

import { SettlementQueueService } from '../jobs/settlement-queue.service';
import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OutcomeSide } from '../markets/enums/outcome-side.enum';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
import { RealtimeService } from '../realtime/realtime.service';
import { WalletService } from '../wallet/wallet.service';

export type OrderBookLevel = {
  priceCents: number;
  quantity: number;
};

export type OrderBookView = {
  marketId: string;
  yes: OrderBookLevel[];
  no: OrderBookLevel[];
};

@Injectable()
export class MatchingEngineService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MatchingEngineService.name);
  private redis!: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly settlementQueueService: SettlementQueueService,
    private readonly realtimeService: RealtimeService,
    private readonly walletService: WalletService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: null,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.rebuildFromOpenOrders();
    await this.recoverOrphanMatchPendingOrders();
    await this.recoverPendingSettlementTrades();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async projectOpenOrder(order: Order): Promise<void> {
    if (order.status !== OrderStatus.OPEN) {
      return;
    }

    const key = this.sideKey(order.marketId, order.side);
    const hashKey = this.orderHashKey(order.id);

    await this.redis.multi()
      .zadd(key, String(order.priceCents), order.id)
      .hset(hashKey, {
        marketId: order.marketId,
        side: order.side,
        quantity: String(order.quantity),
      })
      .exec();
  }

  async removeOpenOrder(order: Order): Promise<void> {
    const key = this.sideKey(order.marketId, order.side);
    const hashKey = this.orderHashKey(order.id);

    await this.redis.multi()
      .zrem(key, order.id)
      .del(hashKey)
      .exec();
  }

  async getOrderBook(marketId: string): Promise<OrderBookView> {
    const [yesIds, noIds] = await Promise.all([
      this.redis.zrevrange(this.sideKey(marketId, OutcomeSide.YES), 0, -1),
      this.redis.zrange(this.sideKey(marketId, OutcomeSide.NO), 0, -1),
    ]);

    const [yes, no] = await Promise.all([
      this.buildLevels(yesIds),
      this.buildLevels(noIds),
    ]);

    return { marketId, yes, no };
  }

  async tryMatchOrder(orderId: string): Promise<void> {
    const matched = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const tradeRepo = manager.getRepository(Trade);

      const order = await orderRepo.findOne({
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order || order.status !== OrderStatus.OPEN) {
        return null;
      }

      const complementarySide =
        order.side === OutcomeSide.YES ? OutcomeSide.NO : OutcomeSide.YES;
      const complementaryPrice = 100 - order.priceCents;

      const counterparty = await orderRepo
        .createQueryBuilder('o')
        .where('o.market_id = :marketId', { marketId: order.marketId })
        .andWhere('o.side = :side', { side: complementarySide })
        .andWhere('o.price_cents = :priceCents', { priceCents: complementaryPrice })
        .andWhere('o.quantity = :quantity', { quantity: order.quantity })
        .andWhere('o.status = :status', { status: OrderStatus.OPEN })
        .andWhere('o.id != :orderId', { orderId: order.id })
        .orderBy('o.created_at', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();

      if (!counterparty) {
        return null;
      }

      order.status = OrderStatus.MATCH_PENDING;
      counterparty.status = OrderStatus.MATCH_PENDING;
      await orderRepo.save([order, counterparty]);

      const yesOrder = order.side === OutcomeSide.YES ? order : counterparty;
      const noOrder = order.side === OutcomeSide.NO ? order : counterparty;

      const trade = tradeRepo.create({
        marketId: order.marketId,
        yesOrderId: yesOrder.id,
        noOrderId: noOrder.id,
        yesPriceCents: yesOrder.priceCents,
        noPriceCents: noOrder.priceCents,
        quantity: order.quantity,
        status: TradeStatus.PENDING_SETTLEMENT,
      });
      const savedTrade = await tradeRepo.save(trade);

      return {
        trade: savedTrade,
        order,
        counterparty,
      };
    });

    if (!matched) {
      return;
    }

    await Promise.all([
      this.removeOpenOrder(matched.order),
      this.removeOpenOrder(matched.counterparty),
    ]);

    try {
      this.realtimeService.broadcastTradeCreated(matched.trade.marketId, matched.trade);

      const orderBook = await this.getOrderBook(matched.trade.marketId);
      this.realtimeService.broadcastOrderBookUpdate(matched.trade.marketId, orderBook);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to broadcast trade/order book updates: ${message}`);
    }

    try {
      await this.settlementQueueService.addSettlementJob(matched.trade.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Failed to enqueue settlement for trade ${matched.trade.id}: ${message}`);

      try {
        await this.failPendingTradeAndReleaseFunds(matched.trade.id);
      } catch (rollbackError) {
        const rollbackMessage = rollbackError instanceof Error
          ? rollbackError.message
          : 'unknown error';
        this.logger.error(
          `Failed to rollback trade ${matched.trade.id} after queue enqueue failure: ${rollbackMessage}`,
        );
      }
    }
  }

  private async recoverPendingSettlementTrades(): Promise<void> {
    const pendingTrades = await this.tradeRepository.find({
      where: { status: TradeStatus.PENDING_SETTLEMENT },
      select: ['id'],
    });

    if (pendingTrades.length === 0) {
      return;
    }

    let enqueuedCount = 0;
    for (const trade of pendingTrades) {
      try {
        await this.settlementQueueService.addSettlementJob(trade.id);
        enqueuedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.error(
          `Failed to re-enqueue pending settlement trade ${trade.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Pending settlement recovery finished: total=${pendingTrades.length}, enqueued=${enqueuedCount}`,
    );
  }

  private async recoverOrphanMatchPendingOrders(): Promise<void> {
    const orphanOrders = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoin(Trade, 'yes_trade', 'yes_trade.yes_order_id = o.id')
      .leftJoin(Trade, 'no_trade', 'no_trade.no_order_id = o.id')
      .where('o.status = :status', { status: OrderStatus.MATCH_PENDING })
      .andWhere('yes_trade.id IS NULL')
      .andWhere('no_trade.id IS NULL')
      .getMany();

    if (orphanOrders.length === 0) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      for (const order of orphanOrders) {
        order.status = OrderStatus.OPEN;
      }

      await orderRepo.save(orphanOrders);
    });

    for (const order of orphanOrders) {
      await this.projectOpenOrder(order);
    }

    this.logger.warn(
      `Recovered orphan MATCH_PENDING orders at startup: count=${orphanOrders.length}`,
    );
  }

  private async failPendingTradeAndReleaseFunds(tradeId: string): Promise<void> {
    const userIds = await this.dataSource.transaction(async (manager) => {
      const tradeRepo = manager.getRepository(Trade);
      const orderRepo = manager.getRepository(Order);

      const trade = await tradeRepo.findOne({
        where: { id: tradeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!trade || trade.status !== TradeStatus.PENDING_SETTLEMENT) {
        return [] as string[];
      }

      const yesOrder = await orderRepo.findOne({
        where: { id: trade.yesOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      const noOrder = await orderRepo.findOne({
        where: { id: trade.noOrderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!yesOrder || !noOrder) {
        throw new Error(`Related orders missing for pending trade ${trade.id}`);
      }

      await this.walletService.release(
        yesOrder.userId,
        yesOrder.reservedCents,
        `trade:${trade.id}:release:${yesOrder.id}`,
        yesOrder.id,
        manager,
      );
      await this.walletService.release(
        noOrder.userId,
        noOrder.reservedCents,
        `trade:${trade.id}:release:${noOrder.id}`,
        noOrder.id,
        manager,
      );

      yesOrder.status = OrderStatus.SETTLEMENT_FAILED;
      noOrder.status = OrderStatus.SETTLEMENT_FAILED;
      trade.status = TradeStatus.FAILED;

      await orderRepo.save([yesOrder, noOrder]);
      await tradeRepo.save(trade);

      return [yesOrder.userId, noOrder.userId];
    });

    await this.broadcastBalanceUpdates(userIds);
  }

  private async broadcastBalanceUpdates(userIds: string[]): Promise<void> {
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

  async rebuildFromOpenOrders(): Promise<void> {
    const startedAt = Date.now();
    await this.deleteProjectionKeys();

    const openOrders = await this.orderRepository.find({
      where: { status: OrderStatus.OPEN },
    });

    for (const order of openOrders) {
      await this.projectOpenOrder(order);
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Redis order book rebuilt from PostgreSQL OPEN orders: count=${openOrders.length}, durationMs=${durationMs}`,
    );
  }

  private async buildLevels(orderIds: string[]): Promise<OrderBookLevel[]> {
    const levels = new Map<number, number>();

    for (const orderId of orderIds) {
      const hash = await this.redis.hgetall(this.orderHashKey(orderId));
      const quantity = parseInt(hash.quantity ?? '0', 10);
      const side = hash.side as OutcomeSide | undefined;
      const marketId = hash.marketId;
      if (!side || !marketId || quantity <= 0) {
        continue;
      }

      const score = await this.redis.zscore(this.sideKey(marketId, side), orderId);
      const priceCents = parseInt(score ?? '0', 10);
      if (priceCents <= 0) {
        continue;
      }

      levels.set(priceCents, (levels.get(priceCents) ?? 0) + quantity);
    }

    return Array.from(levels.entries())
      .map(([priceCents, quantity]) => ({ priceCents, quantity }))
      .sort((a, b) => b.priceCents - a.priceCents);
  }

  private async deleteProjectionKeys(): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'orderbook:*',
        'COUNT',
        '100',
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  private sideKey(marketId: string, side: OutcomeSide): string {
    return `orderbook:${marketId}:${side}`;
  }

  private orderHashKey(orderId: string): string {
    return `orderbook:order:${orderId}`;
  }
}
