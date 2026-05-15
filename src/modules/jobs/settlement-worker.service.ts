import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Worker } from 'bullmq';
import { DataSource, Repository } from 'typeorm';

import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';
import { WalletService } from '../wallet/wallet.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SETTLEMENT_QUEUE_NAME } from './settlement-queue.service';

type SettlementJobData = {
  tradeId: string;
};

@Injectable()
export class SettlementWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettlementWorkerService.name);
  private worker!: Worker<SettlementJobData>;

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly redisKeyspaceService: RedisKeyspaceService,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly realtimeService: RealtimeService,
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SettlementJobData>(
      SETTLEMENT_QUEUE_NAME,
      async (job) => this.handleSettlement(job),
      {
        connection: this.redisClientService.getClient(),
        prefix: this.redisKeyspaceService.getBullPrefix(),
      },
    );

    this.worker.on('failed', (job, error) => {
      const tradeId = job?.data.tradeId ?? 'unknown';
      this.logger.error(`Settlement job failed for trade ${tradeId}: ${error.message}`);
    });
  }

  private async handleSettlement(job: Job<SettlementJobData>): Promise<void> {
    const { tradeId } = job.data;

    try {
      const settledUserIds = await this.dataSource.transaction(async (manager) => {
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
          throw new Error('Related orders were not found for settlement');
        }

        // V1 settlement commits reserved collateral. Payout crediting is part of
        // market resolution, which is not implemented yet.
        await this.walletService.settleDebit(
          yesOrder.userId,
          yesOrder.reservedCents,
          `trade:${trade.id}:yes-debit`,
          trade.id,
          manager,
        );
        await this.walletService.settleDebit(
          noOrder.userId,
          noOrder.reservedCents,
          `trade:${trade.id}:no-debit`,
          trade.id,
          manager,
        );

        yesOrder.status = OrderStatus.MATCHED;
        noOrder.status = OrderStatus.MATCHED;
        trade.status = TradeStatus.SETTLED;

        await orderRepo.save([yesOrder, noOrder]);
        await tradeRepo.save(trade);

        return [yesOrder.userId, noOrder.userId];
      });

      await this.broadcastBalanceUpdates(settledUserIds);
    } catch (error) {
      const releasedUserIds = await this.markSettlementFailure(tradeId);
      await this.broadcastBalanceUpdates(releasedUserIds);
      throw error;
    }
  }

  private async markSettlementFailure(tradeId: string): Promise<string[]> {
    return this.dataSource.transaction(async (manager) => {
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
        throw new Error('Related orders were not found while marking settlement failure');
      }

      await this.walletService.release(
        yesOrder.userId,
        yesOrder.reservedCents,
        `trade:${trade.id}:yes-release`,
        yesOrder.id,
        manager,
      );
      await this.walletService.release(
        noOrder.userId,
        noOrder.reservedCents,
        `trade:${trade.id}:no-release`,
        noOrder.id,
        manager,
      );

      trade.status = TradeStatus.FAILED;
      await tradeRepo.save(trade);

      yesOrder.status = OrderStatus.SETTLEMENT_FAILED;
      noOrder.status = OrderStatus.SETTLEMENT_FAILED;
      await orderRepo.save([yesOrder, noOrder]);

      return [yesOrder.userId, noOrder.userId];
    });
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

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
