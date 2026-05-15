import { DataSource, Repository } from 'typeorm';

import { WalletService } from '../wallet/wallet.service';
import { MarketsService } from './markets.service';
import { Market } from './entities/market.entity';
import { Outcome } from './entities/outcome.entity';
import { Order } from './entities/order.entity';
import { Trade } from './entities/trade.entity';
import { MarketStatus } from './enums/market-status.enum';
import { OutcomeSide } from './enums/outcome-side.enum';
import { TradeStatus } from './enums/trade-status.enum';

describe('MarketsService', () => {
  let service: MarketsService;
  let dataSource: { transaction: jest.Mock };
  let walletService: { settleCredit: jest.Mock };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };

    walletService = {
      settleCredit: jest.fn(),
    };

    const marketRepository = {
      find: jest.fn(),
    };

    service = new MarketsService(
      dataSource as unknown as DataSource,
      walletService as unknown as WalletService,
      {} as never,
      marketRepository as unknown as Repository<Market>,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('credits the winning side during market resolution', async () => {
    const marketId = 'market-1';
    const tradeId = 'trade-1';

    const market = {
      id: marketId,
      status: MarketStatus.OPEN,
      resolvedOutcome: null,
    } as Market;

    const settledTrade = {
      id: tradeId,
      yesOrderId: 'yes-order-1',
      noOrderId: 'no-order-1',
      quantity: 125,
      status: TradeStatus.SETTLED,
    } as Trade;

    const orders = [
      { id: 'yes-order-1', userId: 'user-yes' },
      { id: 'no-order-1', userId: 'user-no' },
    ] as Order[];

    const marketRepo = {
      findOne: jest.fn(async () => market),
      save: jest.fn(async (input: Market) => input),
    };
    const outcomeRepo = {
      exists: jest.fn(async () => true),
    };
    const tradeRepo = {
      exists: jest.fn(async () => false),
      find: jest.fn(async () => [settledTrade]),
    };
    const orderRepo = {
      find: jest.fn(async () => orders),
    };

    dataSource.transaction.mockImplementation(async (cb: (manager: unknown) => unknown) => {
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Market) {
            return marketRepo;
          }
          if (entity === Outcome) {
            return outcomeRepo;
          }
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

    const resolved = await service.resolveMarket(marketId, OutcomeSide.YES);

    expect(walletService.settleCredit).toHaveBeenCalledTimes(1);
    expect(walletService.settleCredit).toHaveBeenCalledWith(
      'user-yes',
      12_500,
      `market:${marketId}:resolve:${tradeId}:YES:credit`,
      tradeId,
      expect.any(Object),
    );
    expect(resolved.status).toBe(MarketStatus.RESOLVED);
    expect(resolved.resolvedOutcome).toBe(OutcomeSide.YES);
  });
});
