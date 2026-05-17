import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
import { WalletService } from '../wallet/wallet.service';
import { SettlementQueueService } from './settlement-queue.service';
import { SettlementRecoveryService } from './settlement-recovery.service';

describe('SettlementRecoveryService', () => {
  let service: SettlementRecoveryService;
  let dataSource: { transaction: jest.Mock };
  let walletService: { reserve: jest.Mock };
  let settlementQueueService: {
    retrySettlementByTradeId: jest.Mock;
    getTradeIdByJobId: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };

    walletService = {
      reserve: jest.fn(),
    };

    settlementQueueService = {
      retrySettlementByTradeId: jest.fn(),
      getTradeIdByJobId: jest.fn(),
    };

    service = new SettlementRecoveryService(
      dataSource as unknown as DataSource,
      walletService as unknown as WalletService,
      settlementQueueService as unknown as SettlementQueueService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('rearms failed settlements before re-enqueueing', async () => {
    const trade = {
      id: 'trade-1',
      yesOrderId: 'yes-order-1',
      noOrderId: 'no-order-1',
      status: TradeStatus.FAILED,
    } as Trade;
    const yesOrder = {
      id: 'yes-order-1',
      userId: 'user-yes',
      reservedCents: 6_000,
      status: OrderStatus.SETTLEMENT_FAILED,
    } as Order;
    const noOrder = {
      id: 'no-order-1',
      userId: 'user-no',
      reservedCents: 4_000,
      status: OrderStatus.SETTLEMENT_FAILED,
    } as Order;

    const tradeRepo = {
      findOne: jest.fn(async () => trade),
      save: jest.fn(async (input: Trade) => input),
    };
    const orderRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(yesOrder)
        .mockResolvedValueOnce(noOrder),
      save: jest.fn(async (input: Order[]) => input),
    };

    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => unknown) => {
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Trade) {
            return tradeRepo;
          }
          if (entity === Order) {
            return orderRepo;
          }
          throw new Error('Unknown entity');
        },
      };
      return cb(manager);
    });

    walletService.reserve.mockResolvedValue(undefined);
    settlementQueueService.retrySettlementByTradeId.mockResolvedValue({
      action: 'enqueued',
      jobId: 'trade-trade-1',
      tradeId: 'trade-1',
      state: 'waiting',
    });

    const result = await service.retryByTradeId('trade-1');

    expect(walletService.reserve).toHaveBeenNthCalledWith(
      1,
      yesOrder.userId,
      yesOrder.reservedCents,
      `trade:${trade.id}:retry-reserve:${yesOrder.id}`,
      yesOrder.id,
      expect.any(Object),
    );
    expect(walletService.reserve).toHaveBeenNthCalledWith(
      2,
      noOrder.userId,
      noOrder.reservedCents,
      `trade:${trade.id}:retry-reserve:${noOrder.id}`,
      noOrder.id,
      expect.any(Object),
    );

    expect(tradeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: TradeStatus.PENDING_SETTLEMENT }),
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: yesOrder.id, status: OrderStatus.MATCH_PENDING }),
        expect.objectContaining({ id: noOrder.id, status: OrderStatus.MATCH_PENDING }),
      ]),
    );
    expect(settlementQueueService.retrySettlementByTradeId).toHaveBeenCalledWith('trade-1');

    expect(result).toEqual({
      tradeId: 'trade-1',
      tradeStatusBefore: TradeStatus.FAILED,
      tradeStatusAfter: TradeStatus.PENDING_SETTLEMENT,
      rearmed: true,
      queue: {
        action: 'enqueued',
        jobId: 'trade-trade-1',
        tradeId: 'trade-1',
        state: 'waiting',
      },
    });
  });

  it('re-enqueues pending settlements without mutating balances', async () => {
    const tradeRepo = {
      findOne: jest.fn(async () => ({
        id: 'trade-2',
        status: TradeStatus.PENDING_SETTLEMENT,
      } as Trade)),
      save: jest.fn(),
    };
    const orderRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => unknown) => {
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Trade) {
            return tradeRepo;
          }
          if (entity === Order) {
            return orderRepo;
          }
          throw new Error('Unknown entity');
        },
      };
      return cb(manager);
    });

    settlementQueueService.retrySettlementByTradeId.mockResolvedValue({
      action: 'already-pending',
      jobId: 'trade-trade-2',
      tradeId: 'trade-2',
      state: 'waiting',
    });

    const result = await service.retryByTradeId('trade-2');

    expect(walletService.reserve).not.toHaveBeenCalled();
    expect(settlementQueueService.retrySettlementByTradeId).toHaveBeenCalledWith('trade-2');
    expect(result.rearmed).toBe(false);
    expect(result.tradeStatusBefore).toBe(TradeStatus.PENDING_SETTLEMENT);
    expect(result.tradeStatusAfter).toBe(TradeStatus.PENDING_SETTLEMENT);
  });

  it('rejects retry requests for non-failed and non-pending trades', async () => {
    const tradeRepo = {
      findOne: jest.fn(async () => ({
        id: 'trade-3',
        status: TradeStatus.SETTLED,
      } as Trade)),
    };
    const orderRepo = {
      findOne: jest.fn(),
    };

    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => unknown) => {
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Trade) {
            return tradeRepo;
          }
          if (entity === Order) {
            return orderRepo;
          }
          throw new Error('Unknown entity');
        },
      };
      return cb(manager);
    });

    await expect(service.retryByTradeId('trade-3')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(settlementQueueService.retrySettlementByTradeId).not.toHaveBeenCalled();
  });

  it('retries by job identifier by resolving trade identifier first', async () => {
    settlementQueueService.getTradeIdByJobId.mockResolvedValue('trade-4');
    const retryByTradeIdSpy = jest.spyOn(service, 'retryByTradeId').mockResolvedValue({
      tradeId: 'trade-4',
      tradeStatusBefore: TradeStatus.FAILED,
      tradeStatusAfter: TradeStatus.PENDING_SETTLEMENT,
      rearmed: true,
      queue: {
        action: 'retried',
        jobId: 'trade-trade-4',
        tradeId: 'trade-4',
        state: 'waiting',
      },
    });

    const result = await service.retryByJobId('trade-trade-4');

    expect(settlementQueueService.getTradeIdByJobId).toHaveBeenCalledWith('trade-trade-4');
    expect(retryByTradeIdSpy).toHaveBeenCalledWith('trade-4');
    expect(result.tradeId).toBe('trade-4');
  });

  it('throws not found when retrying an unknown settlement job', async () => {
    settlementQueueService.getTradeIdByJobId.mockResolvedValue(null);

    await expect(service.retryByJobId('missing-job')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});