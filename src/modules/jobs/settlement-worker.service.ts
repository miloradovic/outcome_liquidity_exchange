import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Worker } from 'bullmq';
import { DataSource, Repository } from 'typeorm';

import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
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
    private readonly configService: ConfigService,
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
        connection: {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
        },
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
      const settledUserIds: string[] = [];

      await this.dataSource.transaction(async (manager) => {
        const tradeRepo = manager.getRepository(Trade);
        const orderRepo = manager.getRepository(Order);

        const trade = await tradeRepo.findOne({
          where: { id: tradeId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!trade || trade.status !== TradeStatus.PENDING_SETTLEMENT) {
          return;
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

        settledUserIds.push(yesOrder.userId, noOrder.userId);
      });

      // Emit balance updates for settled users
      for (const userId of settledUserIds) {
        try {
          const wallet = await this.walletService.getWalletByUserId(userId);
          this.realtimeService.broadcastBalanceUpdate(userId, {
            availableBalanceCents: wallet.availableBalanceCents,
            reservedBalanceCents: wallet.reservedBalanceCents,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to broadcast balance update for user ${userId}: ${error}`,
          );
        }
      }
    } catch (error) {
      await this.markSettlementFailure(tradeId);
      throw error;
    }
  }

  private async markSettlementFailure(tradeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tradeRepo = manager.getRepository(Trade);
      const orderRepo = manager.getRepository(Order);

      const trade = await tradeRepo.findOne({
        where: { id: tradeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!trade || trade.status !== TradeStatus.PENDING_SETTLEMENT) {
        return;
      }

      trade.status = TradeStatus.FAILED;
      await tradeRepo.save(trade);

      await orderRepo.update(
        { id: trade.yesOrderId },
        { status: OrderStatus.SETTLEMENT_FAILED },
      );
      await orderRepo.update(
        { id: trade.noOrderId },
        { status: OrderStatus.SETTLEMENT_FAILED },
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
