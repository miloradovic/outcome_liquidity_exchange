import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';

import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OutcomeSide } from '../markets/enums/outcome-side.enum';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';
import { WalletService } from '../wallet/wallet.service';
import { SettlementWorkerService } from './settlement-worker.service';

type SettlementJobData = {
  tradeId: string;
};

describe('SettlementWorkerService', () => {
  let service: SettlementWorkerService;
  let dataSource: { transaction: jest.Mock };
  let walletService: {
    settleDebit: jest.Mock;
    release: jest.Mock;
    getWalletByUserId: jest.Mock;
  };
  let realtimeService: { broadcastBalanceUpdate: jest.Mock };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };

    walletService = {
      settleDebit: jest.fn(),
      release: jest.fn(),
      getWalletByUserId: jest.fn(),
    };

    realtimeService = {
      broadcastBalanceUpdate: jest.fn(),
    };

    service = new SettlementWorkerService(
      {
        getClient: jest.fn(),
      } as unknown as RedisClientService,
      {
        getBullPrefix: jest.fn(() => 'test'),
      } as unknown as RedisKeyspaceService,
      dataSource as unknown as DataSource,
      walletService as unknown as WalletService,
      realtimeService as unknown as RealtimeService,
      {} as Repository<Trade>,
      {} as Repository<Order>,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('releases reserved balances and marks settlement as failed when debit step errors', async () => {
    const trade = {
      id: 'trade-1',
      yesOrderId: 'yes-order-1',
      noOrderId: 'no-order-1',
      status: TradeStatus.PENDING_SETTLEMENT,
    } as Trade;

    const yesOrder = {
      id: 'yes-order-1',
      userId: 'user-yes',
      side: OutcomeSide.YES,
      reservedCents: 6_000,
      status: OrderStatus.MATCH_PENDING,
    } as Order;

    const noOrder = {
      id: 'no-order-1',
      userId: 'user-no',
      side: OutcomeSide.NO,
      reservedCents: 4_000,
      status: OrderStatus.MATCH_PENDING,
    } as Order;

    const settlingTradeRepo = {
      findOne: jest.fn(async () => trade),
    };
    const settlingOrderRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(yesOrder)
        .mockResolvedValueOnce(noOrder),
    };

    const failingTradeRepo = {
      findOne: jest.fn(async () => trade),
      save: jest.fn(async (input: Trade) => input),
    };
    const failingOrderRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(yesOrder)
        .mockResolvedValueOnce(noOrder),
      save: jest.fn(async (input: Order[]) => input),
    };

    walletService.settleDebit.mockRejectedValue(new Error('simulated settlement failure'));
    walletService.release.mockResolvedValue(undefined);
    walletService.getWalletByUserId.mockResolvedValue({
      availableBalanceCents: 10_000,
      reservedBalanceCents: 0,
    });

    dataSource.transaction
      .mockImplementationOnce(async (cb: (manager: unknown) => unknown) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Trade) {
              return settlingTradeRepo;
            }
            if (entity === Order) {
              return settlingOrderRepo;
            }
            throw new Error('Unknown entity');
          },
        };

        return cb(manager);
      })
      .mockImplementationOnce(async (cb: (manager: unknown) => unknown) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Trade) {
              return failingTradeRepo;
            }
            if (entity === Order) {
              return failingOrderRepo;
            }
            throw new Error('Unknown entity');
          },
        };

        return cb(manager);
      });

    const handleSettlement = (service as unknown as {
      handleSettlement: (job: Job<SettlementJobData>) => Promise<void>;
    }).handleSettlement.bind(service);

    await expect(
      handleSettlement({ data: { tradeId: trade.id } } as Job<SettlementJobData>),
    ).rejects.toThrow('simulated settlement failure');

    expect(walletService.release).toHaveBeenCalledTimes(2);
    expect(walletService.release).toHaveBeenNthCalledWith(
      1,
      yesOrder.userId,
      yesOrder.reservedCents,
      `trade:${trade.id}:yes-release`,
      yesOrder.id,
      expect.any(Object),
    );
    expect(walletService.release).toHaveBeenNthCalledWith(
      2,
      noOrder.userId,
      noOrder.reservedCents,
      `trade:${trade.id}:no-release`,
      noOrder.id,
      expect.any(Object),
    );

    expect(realtimeService.broadcastBalanceUpdate).toHaveBeenCalledTimes(2);

    expect(failingTradeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: TradeStatus.FAILED }),
    );
    expect(failingOrderRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: yesOrder.id, status: OrderStatus.SETTLEMENT_FAILED }),
        expect.objectContaining({ id: noOrder.id, status: OrderStatus.SETTLEMENT_FAILED }),
      ]),
    );
  });
});