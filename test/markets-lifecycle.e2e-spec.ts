import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MarketCloseSchedulerService } from '../src/modules/markets/market-close-scheduler.service';
import { Market } from '../src/modules/markets/entities/market.entity';
import { Outcome } from '../src/modules/markets/entities/outcome.entity';
import { MarketStatus } from '../src/modules/markets/enums/market-status.enum';
import { OutcomeSide } from '../src/modules/markets/enums/outcome-side.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

describe('Markets Lifecycle (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schedulerService: MarketCloseSchedulerService;

  let traderToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    schedulerService = app.get(MarketCloseSchedulerService);

    traderToken = await registerUser('trader');
    adminToken = await registerUser('admin', UserRole.ADMIN);

    await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${traderToken}`)
      .send({ amountCents: 10_000, idempotencyKey: `lifecycle-seed-${Date.now()}` })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows admins to create markets and rejects regular users', async () => {
    const payload = {
      slug: `lifecycle-authz-${Date.now()}`,
      title: 'Lifecycle authz market',
      closesAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    await request(app.getHttpServer())
      .post('/api/markets')
      .set('Authorization', `Bearer ${traderToken}`)
      .send(payload)
      .expect(403);

    const createRes = await request(app.getHttpServer())
      .post('/api/markets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(createRes.body.status).toBe(MarketStatus.OPEN);
    expect(createRes.body.slug).toBe(payload.slug);
    expect(createRes.body.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side: OutcomeSide.YES }),
        expect.objectContaining({ side: OutcomeSide.NO }),
      ]),
    );
  });

  it('allows manual close and rejects new orders for the closed market', async () => {
    const marketId = await createMarketAsAdmin(`manual-close-${Date.now()}`);

    const closeRes = await request(app.getHttpServer())
      .post(`/api/markets/${marketId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(closeRes.body.status).toBe(MarketStatus.CLOSED);
    expect(new Date(closeRes.body.closesAt).getTime()).toBeLessThanOrEqual(Date.now());

    await expectOrderRejectedForClosedMarket(marketId, `manual-close-order-${Date.now()}`);
  });

  it('closes past-due markets through scheduler and rejects new orders', async () => {
    const marketId = await createMarketAsAdmin(`scheduler-close-${Date.now()}`);

    await dataSource.getRepository(Market).update(
      { id: marketId },
      { status: MarketStatus.OPEN, closesAt: new Date(Date.now() - 1_000) },
    );

    const closedCount = await schedulerService.runNow();
    expect(closedCount).toBeGreaterThanOrEqual(1);

    const marketRes = await request(app.getHttpServer())
      .get(`/api/markets/${marketId}`)
      .expect(200);
    expect(marketRes.body.status).toBe(MarketStatus.CLOSED);

    await expectOrderRejectedForClosedMarket(marketId, `scheduler-close-order-${Date.now()}`);
  });

  it('rejects new orders once closesAt has passed even before scheduler runs', async () => {
    const marketRepo = dataSource.getRepository(Market);
    const outcomeRepo = dataSource.getRepository(Outcome);

    const market = await marketRepo.save(
      marketRepo.create({
        slug: `past-close-${Date.now()}`,
        title: 'Past close guard market',
        status: MarketStatus.OPEN,
        closesAt: new Date(Date.now() - 1_000),
      }),
    );

    await outcomeRepo.save([
      outcomeRepo.create({ market, side: OutcomeSide.YES }),
      outcomeRepo.create({ market, side: OutcomeSide.NO }),
    ]);

    await expectOrderRejectedForClosedMarket(market.id, `past-close-order-${Date.now()}`);

    const unchanged = await marketRepo.findOneByOrFail({ id: market.id });
    expect(unchanged.status).toBe(MarketStatus.OPEN);
  });

  async function createMarketAsAdmin(slugPrefix: string): Promise<string> {
    const createRes = await request(app.getHttpServer())
      .post('/api/markets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slug: slugPrefix,
        title: `Market ${slugPrefix}`,
        closesAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .expect(201);

    return createRes.body.id as string;
  }

  async function expectOrderRejectedForClosedMarket(
    marketId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const orderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${traderToken}`)
      .send({
        marketId,
        side: OutcomeSide.YES,
        priceCents: 55,
        quantity: 1,
        idempotencyKey,
      })
      .expect(400);

    const message = Array.isArray(orderRes.body.message)
      ? orderRes.body.message.join(' ')
      : String(orderRes.body.message);

    expect(message).toMatch(/Market is closed|Market is not open/);
  }

  async function registerUser(prefix: string, role: UserRole = UserRole.USER): Promise<string> {
    const unique = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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

    return token;
  }
});