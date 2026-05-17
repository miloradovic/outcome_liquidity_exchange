import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
import { WalletService } from '../wallet/wallet.service';
import {
  SettlementQueueRetryResult,
  SettlementQueueService,
} from './settlement-queue.service';

export type SettlementRecoveryResult = {
  tradeId: string;
  queue: SettlementQueueRetryResult;
  tradeStatusBefore: TradeStatus;
  tradeStatusAfter: TradeStatus;
  rearmed: boolean;
};

@Injectable()
export class SettlementRecoveryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly settlementQueueService: SettlementQueueService,
  ) {}

  async retryByTradeId(tradeId: string): Promise<SettlementRecoveryResult> {
    const preparation = await this.prepareTradeForRetry(tradeId);
    const queue = await this.settlementQueueService.retrySettlementByTradeId(tradeId);

    return {
      tradeId,
      queue,
      ...preparation,
    };
  }

  async retryByJobId(jobId: string): Promise<SettlementRecoveryResult> {
    const tradeId = await this.settlementQueueService.getTradeIdByJobId(jobId);
    if (!tradeId) {
      throw new NotFoundException(`Settlement job not found: ${jobId}`);
    }

    return this.retryByTradeId(tradeId);
  }

  private async prepareTradeForRetry(tradeId: string): Promise<{
    tradeStatusBefore: TradeStatus;
    tradeStatusAfter: TradeStatus;
    rearmed: boolean;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const tradeRepo = manager.getRepository(Trade);
      const orderRepo = manager.getRepository(Order);

      const trade = await tradeRepo.findOne({
        where: { id: tradeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!trade) {
        throw new NotFoundException(`Trade not found: ${tradeId}`);
      }

      if (trade.status === TradeStatus.PENDING_SETTLEMENT) {
        return {
          tradeStatusBefore: TradeStatus.PENDING_SETTLEMENT,
          tradeStatusAfter: TradeStatus.PENDING_SETTLEMENT,
          rearmed: false,
        };
      }

      if (trade.status !== TradeStatus.FAILED) {
        throw new BadRequestException('Only failed settlement trades can be retried');
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
        throw new NotFoundException(
          `Related orders were not found for trade ${trade.id}`,
        );
      }

      if (
        yesOrder.status !== OrderStatus.SETTLEMENT_FAILED
        || noOrder.status !== OrderStatus.SETTLEMENT_FAILED
      ) {
        throw new BadRequestException('Trade orders are not in settlement failed state');
      }

      await this.walletService.reserve(
        yesOrder.userId,
        yesOrder.reservedCents,
        this.buildRetryReserveIdempotency(trade.id, yesOrder.id),
        yesOrder.id,
        manager,
      );
      await this.walletService.reserve(
        noOrder.userId,
        noOrder.reservedCents,
        this.buildRetryReserveIdempotency(trade.id, noOrder.id),
        noOrder.id,
        manager,
      );

      yesOrder.status = OrderStatus.MATCH_PENDING;
      noOrder.status = OrderStatus.MATCH_PENDING;
      trade.status = TradeStatus.PENDING_SETTLEMENT;

      await orderRepo.save([yesOrder, noOrder]);
      await tradeRepo.save(trade);

      return {
        tradeStatusBefore: TradeStatus.FAILED,
        tradeStatusAfter: TradeStatus.PENDING_SETTLEMENT,
        rearmed: true,
      };
    });
  }

  private buildRetryReserveIdempotency(tradeId: string, orderId: string): string {
    return `trade:${tradeId}:retry-reserve:${orderId}`;
  }
}