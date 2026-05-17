import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Order } from '../src/modules/markets/entities/order.entity';
import { Trade } from '../src/modules/markets/entities/trade.entity';
import { MarketStatus } from '../src/modules/markets/enums/market-status.enum';
import { OrderStatus } from '../src/modules/markets/enums/order-status.enum';
import { OutcomeSide } from '../src/modules/markets/enums/outcome-side.enum';
import { TradeStatus } from '../src/modules/markets/enums/trade-status.enum';
import { SettlementQueueService } from '../src/modules/jobs/settlement-queue.service';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { waitFor } from './helpers/polling';

type AuthIdentity = {
  token: string;
  userId: string;
};

describe('Jobs Settlement Recovery (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let settlementQueueService: SettlementQueueService;

  let yesTraderToken: string;
  let yesTraderUserId: string;
  let noTraderToken: string;
  let noTraderUserId: string;
  let adminToken: string;
  let marketId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    settlementQueueService = app.get(SettlementQueueService);

    const yesTrader = await registerUser('recovery-yes');
    yesTraderToken = yesTrader.token;
    yesTraderUserId = yesTrader.userId;

    const noTrader = await registerUser('recovery-no');
    noTraderToken = noTrader.token;
    noTraderUserId = noTrader.userId;

    const admin = await registerUser('recovery-admin', UserRole.ADMIN);
    adminToken = admin.token;

    await deposit(yesTraderToken, 10_000, `seed-yes-${Date.now()}`);
    await deposit(noTraderToken, 10_000, `seed-no-${Date.now()}`);

    marketId = await createMarketAsAdmin(`settlement-recovery-${Date.now()}`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows failed settlement work and allows safe admin retry by job identifier', async () => {
    const failedTradeId = await createFailedSettlementFixture();

    await request(app.getHttpServer())
      .get('/api/jobs/settlements?status=pending&limit=100')
      .set('Authorization', `Bearer ${yesTraderToken}`)
      .expect(403);

    const pendingListRes = await request(app.getHttpServer())
      .get('/api/jobs/settlements?status=pending&limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(pendingListRes.body)).toBe(true);

    const failedListRes = await request(app.getHttpServer())
      .get('/api/jobs/settlements?status=failed&limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(failedListRes.body)).toBe(true);

    const retryRes = await request(app.getHttpServer())
      .post(`/api/jobs/settlements/retry/trades/${failedTradeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(retryRes.body.tradeId).toBe(failedTradeId);
    expect(retryRes.body.tradeStatusBefore).toBe(TradeStatus.FAILED);
    expect(retryRes.body.tradeStatusAfter).toBe(TradeStatus.PENDING_SETTLEMENT);
    expect(retryRes.body.rearmed).toBe(true);

    await waitFor<Trade | null>(
      async () => dataSource.getRepository(Trade).findOneBy({ id: failedTradeId }),
      (trade) => {
        expect(trade?.status).toBe(TradeStatus.SETTLED);
      },
      { attempts: 40, delayMs: 150 },
    );

    const settledTrade = await dataSource.getRepository(Trade).findOneByOrFail({
      id: failedTradeId,
    });
    const yesOrder = await dataSource.getRepository(Order).findOneByOrFail({
      id: settledTrade.yesOrderId,
    });
    const noOrder = await dataSource.getRepository(Order).findOneByOrFail({
      id: settledTrade.noOrderId,
    });

    expect(yesOrder.status).toBe(OrderStatus.MATCHED);
    expect(noOrder.status).toBe(OrderStatus.MATCHED);

    const yesWallet = await getWallet(yesTraderToken);
    expect(yesWallet.availableBalanceCents).toBe(4_000);
    expect(yesWallet.reservedBalanceCents).toBe(0);

    const noWallet = await getWallet(noTraderToken);
    expect(noWallet.availableBalanceCents).toBe(6_000);
    expect(noWallet.reservedBalanceCents).toBe(0);
  });

  async function registerUser(
    prefix: string,
    role: UserRole = UserRole.USER,
  ): Promise<AuthIdentity> {
    const unique = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `${unique}@demo.com`,
        password: 'Password123!',
        username: unique,
      })
      .expect(201);

    const token = registerRes.body.accessToken as string;
    const userId = registerRes.body.user.id as string;

    if (role !== UserRole.USER) {
      await dataSource.getRepository(User).update({ id: userId }, { role });
    }

    return { token, userId };
  }

  async function deposit(
    token: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send({ amountCents, idempotencyKey })
      .expect(201);
  }

  async function createMarketAsAdmin(slug: string): Promise<string> {
    const createRes = await request(app.getHttpServer())
      .post('/api/markets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug,
        title: `Recovery market ${slug}`,
        closesAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    expect(createRes.body.status).toBe(MarketStatus.OPEN);
    return createRes.body.id as string;
  }

  async function createFailedSettlementFixture(): Promise<string> {
    const orderRepo = dataSource.getRepository(Order);
    const tradeRepo = dataSource.getRepository(Trade);
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

    const yesOrder = await orderRepo.save(
      orderRepo.create({
        userId: yesTraderUserId,
        marketId,
        side: OutcomeSide.YES,
        priceCents: 60,
        quantity: 1,
        reservedCents: 6_000,
        status: OrderStatus.SETTLEMENT_FAILED,
        idempotencyKey: `recovery-fixture-yes-${unique}`,
      }),
    );

    const noOrder = await orderRepo.save(
      orderRepo.create({
        userId: noTraderUserId,
        marketId,
        side: OutcomeSide.NO,
        priceCents: 40,
        quantity: 1,
        reservedCents: 4_000,
        status: OrderStatus.SETTLEMENT_FAILED,
        idempotencyKey: `recovery-fixture-no-${unique}`,
      }),
    );

    const trade = await tradeRepo.save(
      tradeRepo.create({
        marketId,
        yesOrderId: yesOrder.id,
        noOrderId: noOrder.id,
        yesPriceCents: 60,
        noPriceCents: 40,
        quantity: 1,
        status: TradeStatus.FAILED,
      }),
    );

    await settlementQueueService.addSettlementJob(trade.id);

    return trade.id;
  }

  async function getWallet(token: string): Promise<{
    availableBalanceCents: number;
    reservedBalanceCents: number;
  }> {
    const walletRes = await request(app.getHttpServer())
      .get('/api/wallet')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return walletRes.body as {
      availableBalanceCents: number;
      reservedBalanceCents: number;
    };
  }
});