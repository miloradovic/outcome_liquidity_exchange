import { Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { SettlementQueueService } from '../jobs/settlement-queue.service';
import { Order } from '../markets/entities/order.entity';
import { Trade } from '../markets/entities/trade.entity';
import { OutcomeSide } from '../markets/enums/outcome-side.enum';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { TradeStatus } from '../markets/enums/trade-status.enum';
import { WalletService } from '../wallet/wallet.service';
import { MatchingEngineBroadcastService } from './matching-engine-broadcast.service';
import { MatchingEngineService } from './matching-engine.service';
import { OrderBookProjectionService } from './order-book-projection.service';

describe('MatchingEngineService', () => {
  let service: MatchingEngineService;
  let dataSource: { transaction: jest.Mock };
  let settlementQueueService: { addSettlementJob: jest.Mock };
  let projectionService: {
    removeOpenOrder: jest.Mock;
    rebuildFromOpenOrders: jest.Mock;
    projectOpenOrder: jest.Mock;
  };
  let broadcastService: {
    broadcastTradeAndOrderBookUpdate: jest.Mock;
    broadcastBalanceUpdates: jest.Mock;
  };
  let walletService: { release: jest.Mock };
  let orderRepository: { createQueryBuilder: jest.Mock };
  let tradeRepository: { find: jest.Mock };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };

    settlementQueueService = {
      addSettlementJob: jest.fn(),
    };

    projectionService = {
      removeOpenOrder: jest.fn(),
      rebuildFromOpenOrders: jest.fn(),
      projectOpenOrder: jest.fn(),
    };

    broadcastService = {
      broadcastTradeAndOrderBookUpdate: jest.fn(),
      broadcastBalanceUpdates: jest.fn(),
    };

    walletService = {
      release: jest.fn(),
    };

    orderRepository = {
      createQueryBuilder: jest.fn(),
    };

    tradeRepository = {
      find: jest.fn(),
    };

    service = new MatchingEngineService(
      dataSource as unknown as DataSource,
      settlementQueueService as unknown as SettlementQueueService,
      projectionService as unknown as OrderBookProjectionService,
      broadcastService as unknown as MatchingEngineBroadcastService,
      walletService as unknown as WalletService,
      orderRepository as unknown as Repository<Order>,
      tradeRepository as unknown as Repository<Trade>,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('releases reserved balances when settlement enqueue fails', async () => {
    const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const incomingOrder = {
      id: 'order-yes-1',
      userId: 'user-yes',
      marketId: 'market-1',
      side: OutcomeSide.YES,
      priceCents: 60,
      quantity: 100,
      reservedCents: 6_000,
      status: OrderStatus.OPEN,
    } as Order;

    const counterpartyOrder = {
      id: 'order-no-1',
      userId: 'user-no',
      marketId: 'market-1',
      side: OutcomeSide.NO,
      priceCents: 40,
      quantity: 100,
      reservedCents: 4_000,
      status: OrderStatus.OPEN,
    } as Order;

    const pendingTrade = {
      id: 'trade-1',
      marketId: incomingOrder.marketId,
      yesOrderId: incomingOrder.id,
      noOrderId: counterpartyOrder.id,
      yesPriceCents: incomingOrder.priceCents,
      noPriceCents: counterpartyOrder.priceCents,
      quantity: incomingOrder.quantity,
      status: TradeStatus.PENDING_SETTLEMENT,
    } as Trade;

    const matchingOrderRepo = {
      findOne: jest.fn(async () => incomingOrder),
      createQueryBuilder: jest.fn(),
      save: jest.fn(async (input: Order[]) => input),
    };

    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => counterpartyOrder),
    };
    matchingOrderRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    const matchingTradeRepo = {
      create: jest.fn((input: Partial<Trade>) => input),
      save: jest.fn(async () => pendingTrade),
    };

    const rollbackOrderRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ ...incomingOrder, status: OrderStatus.MATCH_PENDING })
        .mockResolvedValueOnce({ ...counterpartyOrder, status: OrderStatus.MATCH_PENDING }),
      save: jest.fn(async (input: Order[]) => input),
    };
    const rollbackTradeRepo = {
      findOne: jest.fn(async () => ({ ...pendingTrade })),
      save: jest.fn(async (input: Trade) => input),
    };

    dataSource.transaction
      .mockImplementationOnce(async (cb: (manager: unknown) => unknown) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Order) {
              return matchingOrderRepo;
            }
            if (entity === Trade) {
              return matchingTradeRepo;
            }
            throw new Error('Unknown entity');
          },
        };

        return cb(manager);
      })
      .mockImplementationOnce(async (cb: (manager: unknown) => unknown) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Order) {
              return rollbackOrderRepo;
            }
            if (entity === Trade) {
              return rollbackTradeRepo;
            }
            throw new Error('Unknown entity');
          },
        };

        return cb(manager);
      });

    projectionService.removeOpenOrder.mockResolvedValue(undefined);
    settlementQueueService.addSettlementJob.mockRejectedValue(new Error('queue unavailable'));
    walletService.release.mockResolvedValue(undefined);
    broadcastService.broadcastBalanceUpdates.mockResolvedValue(undefined);

    await service.tryMatchOrder(incomingOrder.id);

    expect(projectionService.removeOpenOrder).toHaveBeenCalledTimes(2);
    expect(settlementQueueService.addSettlementJob).toHaveBeenCalledWith(pendingTrade.id);

    expect(walletService.release).toHaveBeenCalledTimes(2);
    expect(walletService.release).toHaveBeenNthCalledWith(
      1,
      incomingOrder.userId,
      incomingOrder.reservedCents,
      `trade:${pendingTrade.id}:release:${incomingOrder.id}`,
      incomingOrder.id,
      expect.any(Object),
    );
    expect(walletService.release).toHaveBeenNthCalledWith(
      2,
      counterpartyOrder.userId,
      counterpartyOrder.reservedCents,
      `trade:${pendingTrade.id}:release:${counterpartyOrder.id}`,
      counterpartyOrder.id,
      expect.any(Object),
    );

    expect(broadcastService.broadcastBalanceUpdates).toHaveBeenCalledWith([
      incomingOrder.userId,
      counterpartyOrder.userId,
    ]);
    expect(broadcastService.broadcastTradeAndOrderBookUpdate).not.toHaveBeenCalled();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      `Failed to enqueue settlement for trade ${pendingTrade.id}: queue unavailable`,
    );
    loggerErrorSpy.mockRestore();
  });

  it('reopens orphan MATCH_PENDING orders on bootstrap', async () => {
    const orphanOrder = {
      id: 'order-orphan-1',
      userId: 'user-1',
      marketId: 'market-1',
      side: OutcomeSide.YES,
      priceCents: 55,
      quantity: 10,
      reservedCents: 550,
      status: OrderStatus.MATCH_PENDING,
    } as Order;

    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [orphanOrder]),
    };
    orderRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    projectionService.rebuildFromOpenOrders.mockResolvedValue(undefined);
    projectionService.projectOpenOrder.mockResolvedValue(undefined);
    tradeRepository.find.mockResolvedValue([]);

    const txOrderRepo = {
      save: jest.fn(async (input: Order[]) => input),
    };
    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => unknown) => {
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Order) {
            return txOrderRepo;
          }
          throw new Error('Unknown entity');
        },
      };

      return cb(manager);
    });

    await service.onApplicationBootstrap();

    expect(projectionService.rebuildFromOpenOrders).toHaveBeenCalledTimes(1);
    expect(txOrderRepo.save).toHaveBeenCalledTimes(1);
    expect(orphanOrder.status).toBe(OrderStatus.OPEN);
    expect(projectionService.projectOpenOrder).toHaveBeenCalledWith(orphanOrder);
  });
});