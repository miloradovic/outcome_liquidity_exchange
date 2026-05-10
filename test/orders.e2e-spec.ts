import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { MatchingEngineService } from '../src/modules/matching-engine/matching-engine.service';
import { Market } from '../src/modules/markets/entities/market.entity';
import { Outcome } from '../src/modules/markets/entities/outcome.entity';
import { OutcomeSide } from '../src/modules/markets/enums/outcome-side.enum';
import { MarketStatus } from '../src/modules/markets/enums/market-status.enum';

describe('Orders + Matching (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let matchingEngineService: MatchingEngineService;

  let marketId: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    matchingEngineService = app.get(MatchingEngineService);

    const marketRepo = dataSource.getRepository(Market);
    const outcomeRepo = dataSource.getRepository(Outcome);

    const market = await marketRepo.save(
      marketRepo.create({
        slug: `e2e-week3-${Date.now()}`,
        title: 'E2E Week 3 Market',
        status: MarketStatus.OPEN,
        closesAt: null,
      }),
    );
    marketId = market.id;

    await outcomeRepo.save([
      outcomeRepo.create({ market, side: OutcomeSide.YES }),
      outcomeRepo.create({ market, side: OutcomeSide.NO }),
    ]);

    tokenA = await registerAndFundUser('a');
    tokenB = await registerAndFundUser('b');
  });

  afterAll(async () => {
    await app.close();
  });

  it('places unmatched order, projects to book, rebuilds, and cancels with fund release', async () => {
    const placeRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        marketId,
        side: OutcomeSide.YES,
        priceCents: 60,
        quantity: 2,
        idempotencyKey: `place-unmatched-${Date.now()}`,
      })
      .expect(201);

    const orderId = placeRes.body.id as string;

    const orderBookBefore = await request(app.getHttpServer())
      .get(`/api/markets/${marketId}/order-book`)
      .expect(200);
    expect(orderBookBefore.body.yes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ priceCents: 60, quantity: 2 }),
      ]),
    );

    await matchingEngineService.rebuildFromOpenOrders();

    const orderBookAfter = await request(app.getHttpServer())
      .get(`/api/markets/${marketId}/order-book`)
      .expect(200);
    expect(orderBookAfter.body.yes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ priceCents: 60, quantity: 2 }),
      ]),
    );

    await request(app.getHttpServer())
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const walletRes = await request(app.getHttpServer())
      .get('/api/wallet')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(walletRes.body.availableBalanceCents).toBe(5000);
    expect(walletRes.body.reservedBalanceCents).toBe(0);
  });

  it('matches YES 60 with NO 40 and settles with zero reserved balance', async () => {
    const yesRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        marketId,
        side: OutcomeSide.YES,
        priceCents: 60,
        quantity: 1,
        idempotencyKey: `place-yes-${Date.now()}`,
      })
      .expect(201);

    const noRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        marketId,
        side: OutcomeSide.NO,
        priceCents: 40,
        quantity: 1,
        idempotencyKey: `place-no-${Date.now()}`,
      })
      .expect(201);

    const yesOrderId = yesRes.body.id as string;
    const noOrderId = noRes.body.id as string;

    await waitForOrderStatus(tokenA, yesOrderId, 'MATCHED');
    await waitForOrderStatus(tokenB, noOrderId, 'MATCHED');

    const walletA = await request(app.getHttpServer())
      .get('/api/wallet')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(walletA.body.availableBalanceCents).toBe(4940);
    expect(walletA.body.reservedBalanceCents).toBe(0);

    const walletB = await request(app.getHttpServer())
      .get('/api/wallet')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(walletB.body.availableBalanceCents).toBe(4960);
    expect(walletB.body.reservedBalanceCents).toBe(0);

    const book = await request(app.getHttpServer())
      .get(`/api/markets/${marketId}/order-book`)
      .expect(200);
    expect(book.body.yes).toEqual([]);
    expect(book.body.no).toEqual([]);
  });

  async function registerAndFundUser(suffix: string): Promise<string> {
    const unique = `${suffix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `orders-${unique}@demo.com`,
        password: 'Password123!',
        username: `orders${unique}`,
      })
      .expect(201);

    const token = registerRes.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amountCents: 5000,
        idempotencyKey: `deposit-${unique}`,
      })
      .expect(201);

    return token;
  }

  async function waitForOrderStatus(
    token: string,
    orderId: string,
    expectedStatus: string,
  ): Promise<void> {
    const attempts = 25;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const res = await request(app.getHttpServer())
        .get('/api/orders/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const order = (res.body as Array<{ id: string; status: string }>).find(
        (item) => item.id === orderId,
      );

      if (order?.status === expectedStatus) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    throw new Error(`Order ${orderId} did not reach status ${expectedStatus}`);
  }
});
