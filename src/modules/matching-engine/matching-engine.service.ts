import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { SettlementQueueService } from '../jobs/settlement-queue.service';
import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OutcomeSide } from '../markets/enums/outcome-side.enum';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
import { WalletService } from '../wallet/wallet.service';
import { MatchingEngineBroadcastService } from './matching-engine-broadcast.service';
import { OrderBookProjectionService } from './order-book-projection.service';

@Injectable()
export class MatchingEngineService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MatchingEngineService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly settlementQueueService: SettlementQueueService,
    private readonly projectionService: OrderBookProjectionService,
    private readonly broadcastService: MatchingEngineBroadcastService,
    private readonly walletService: WalletService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rebuildFromOpenOrders();
    await this.recoverOrphanMatchPendingOrders();
    await this.recoverPendingSettlementTrades();
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

    try {
      await Promise.all([
        this.projectionService.removeOpenOrder(matched.order),
        this.projectionService.removeOpenOrder(matched.counterparty),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Failed to remove matched orders from projection for trade ${matched.trade.id}: ${message}`,
      );
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

      return;
    }

    await this.broadcastService.broadcastTradeAndOrderBookUpdate(matched.trade);
  }

  async rebuildFromOpenOrders(): Promise<void> {
    await this.projectionService.rebuildFromOpenOrders();
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
      await this.projectionService.projectOpenOrder(order);
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

    await this.broadcastService.broadcastBalanceUpdates(userIds);
  }
}
