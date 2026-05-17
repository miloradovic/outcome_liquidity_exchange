import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Market } from '../src/modules/markets/entities/market.entity';
import { Outcome } from '../src/modules/markets/entities/outcome.entity';
import { MarketStatus } from '../src/modules/markets/enums/market-status.enum';
import { OutcomeSide } from '../src/modules/markets/enums/outcome-side.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { waitFor } from './helpers/polling';

describe('Full Order Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let marketId: string;
  let accessTokenAlice: string;
  let accessTokenBob: string;

  const aliceUser = {
    email: `alice-e2e-${Date.now()}@demo.com`,
    password: 'Password123!',
    username: `alice${Date.now()}`,
  };

  const bobUser = {
    email: `bob-e2e-${Date.now()}@demo.com`,
    password: 'Password123!',
    username: `bob${Date.now()}`,
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    // Register and get tokens
    const aliceRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(aliceUser)
      .expect(201);
    accessTokenAlice = aliceRes.body.accessToken as string;

    const bobRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(bobUser)
      .expect(201);
    accessTokenBob = bobRes.body.accessToken as string;

    // Create a market for this test suite — do not rely on seed data
    dataSource = app.get(DataSource);
    const market = await dataSource.getRepository(Market).save(
      dataSource.getRepository(Market).create({
        slug: `full-flow-${Date.now()}`,
        title: 'Full Flow E2E Market',
        status: MarketStatus.OPEN,
        closesAt: null,
      }),
    );
    marketId = market.id;
    await dataSource.getRepository(Outcome).save([
      dataSource.getRepository(Outcome).create({ market, side: OutcomeSide.YES }),
      dataSource.getRepository(Outcome).create({ market, side: OutcomeSide.NO }),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register -> deposit -> place order flow', () => {
    it('alice can deposit funds', async () => {
      const idempotencyKey = `alice-deposit-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .send({ amountCents: 10_000, idempotencyKey })
        .expect(201);

      expect(res.body.wallet.availableBalanceCents).toBe(10_000);
      expect(res.body.wallet.reservedBalanceCents).toBe(0);
    });

    it('alice can place a YES order', async () => {
      const idempotencyKey = `alice-order-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .send({
          marketId,
          side: 'YES',
          priceCents: 60,
          quantity: 100,
          idempotencyKey,
        })
        .expect(201);

      expect(res.body.status).toBe('OPEN');
      expect(res.body.side).toBe('YES');
      expect(res.body.priceCents).toBe(60);
      expect(res.body.quantity).toBe(100);
      expect(res.body.reservedCents).toBe(6_000); // 60 * 100
    });

    it('alice balance reflects reservation after order', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/wallet')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .expect(200);

      expect(res.body.availableBalanceCents).toBe(4_000); // 10_000 - 6_000
      expect(res.body.reservedBalanceCents).toBe(6_000);
    });

    it('alice can view her orders', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/me')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].side).toBe('YES');
    });

    it('alice can view order book with her order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/markets/${marketId}/order-book`)
        .expect(200);

      expect(res.body.yes.length).toBeGreaterThan(0);
      const yesLevel = res.body.yes.find((l: Record<string, unknown>) => l.priceCents === 60);
      expect(yesLevel).toBeDefined();
      expect(yesLevel.quantity).toBeGreaterThanOrEqual(100);
    });
  });

  describe('matching and settlement flow', () => {
    it('bob can deposit funds', async () => {
      const idempotencyKey = `bob-deposit-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${accessTokenBob}`)
        .send({ amountCents: 10_000, idempotencyKey })
        .expect(201);

      expect(res.body.wallet.availableBalanceCents).toBe(10_000);
    });

    it('bob can place complementary NO order to match with alice', async () => {
      const idempotencyKey = `bob-order-${Date.now()}`;
      // Complementary: YES at 60, NO at 40 (60 + 40 = 100)
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessTokenBob}`)
        .send({
          marketId,
          side: 'NO',
          priceCents: 40,
          quantity: 100,
          idempotencyKey,
        })
        .expect(201);

      expect(res.body.status).toBe('OPEN');
      expect(res.body.side).toBe('NO');
      expect(res.body.priceCents).toBe(40);
    });

    it('bob balance reflects debited funds while settlement completes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/wallet')
        .set('Authorization', `Bearer ${accessTokenBob}`)
        .expect(200);

      expect(res.body.availableBalanceCents).toBe(6_000); // 10_000 - 4_000
      expect([0, 4_000]).toContain(res.body.reservedBalanceCents);
    });

    it('matched orders are removed from the open order book', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/markets/${marketId}/order-book`)
        .expect(200);

      const yesLevel = res.body.yes.find((l: Record<string, unknown>) => l.priceCents === 60);
      const noLevel = res.body.no.find((l: Record<string, unknown>) => l.priceCents === 40);
      expect(yesLevel).toBeUndefined();
      expect(noLevel).toBeUndefined();
    });

    it('alice order settles and reserved funds are debited', async () => {
      const yesOrder = await waitFor(
        async () => {
          const ordersRes = await request(app.getHttpServer())
            .get('/api/orders/me')
            .set('Authorization', `Bearer ${accessTokenAlice}`)
            .expect(200);

          const order = ordersRes.body.find((o: Record<string, unknown>) => o.side === 'YES');
          if (!order) {
            throw new Error('YES order not found for alice');
          }

          return order as Record<string, unknown>;
        },
        (order) => {
          expect(order.status).toBe('MATCHED');
        },
      );

      expect(yesOrder.status).toBe('MATCHED');

      const walletRes = await waitFor(
        async () => {
          const response = await request(app.getHttpServer())
            .get('/api/wallet')
            .set('Authorization', `Bearer ${accessTokenAlice}`)
            .expect(200);

          return response.body as {
            availableBalanceCents: number;
            reservedBalanceCents: number;
          };
        },
        (wallet) => {
          expect(wallet.availableBalanceCents).toBe(4_000);
          expect(wallet.reservedBalanceCents).toBe(0);
        },
      );

      expect(walletRes.availableBalanceCents).toBe(4_000);
      expect(walletRes.reservedBalanceCents).toBe(0);
    });

    it('market resolution requires admin and credits the winning side collateral payout', async () => {
      await request(app.getHttpServer())
        .post(`/api/markets/${marketId}/resolve`)
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .send({ winningSide: OutcomeSide.YES })
        .expect(403);

      const adminRegisterRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `admin-e2e-${Date.now()}@demo.com`,
          password: 'Password123!',
          username: `admin${Date.now()}`,
        })
        .expect(201);

      const adminUserId = adminRegisterRes.body.user.id as string;
      const accessTokenAdmin = adminRegisterRes.body.accessToken as string;

      await dataSource.getRepository(User).update(
        { id: adminUserId },
        { role: UserRole.ADMIN },
      );

      const resolveRes = await request(app.getHttpServer())
        .post(`/api/markets/${marketId}/resolve`)
        .set('Authorization', `Bearer ${accessTokenAdmin}`)
        .send({ winningSide: OutcomeSide.YES })
        .expect(200);

      expect(resolveRes.body.status).toBe(MarketStatus.RESOLVED);
      expect(resolveRes.body.resolvedOutcome).toBe(OutcomeSide.YES);

      const aliceWallet = await request(app.getHttpServer())
        .get('/api/wallet')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .expect(200);
      expect(aliceWallet.body.availableBalanceCents).toBe(14_000);
      expect(aliceWallet.body.reservedBalanceCents).toBe(0);

      const bobWallet = await request(app.getHttpServer())
        .get('/api/wallet')
        .set('Authorization', `Bearer ${accessTokenBob}`)
        .expect(200);
      expect(bobWallet.body.availableBalanceCents).toBe(6_000);
      expect(bobWallet.body.reservedBalanceCents).toBe(0);
    });
  });

  describe('auth and permissions', () => {
    it('rejects requests without authentication', async () => {
      await request(app.getHttpServer()).get('/api/wallet').expect(401);

      await request(app.getHttpServer()).post('/api/orders').send({}).expect(401);
    });

    it('rejects orders with invalid market', async () => {
      const idempotencyKey = `invalid-market-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .send({
          marketId: '00000000-0000-0000-0000-000000000000',
          side: 'YES',
          priceCents: 50,
          quantity: 10,
          idempotencyKey,
        })
        .expect(404);
    });

    it('rejects orders with invalid price', async () => {
      const idempotencyKey = `invalid-price-${Date.now()}`;
      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .send({
          marketId,
          side: 'YES',
          priceCents: 150, // Invalid: > 99
          quantity: 10,
          idempotencyKey,
        })
        .expect(400);
    });

    it('rejects deposit without sufficient data', async () => {
      await request(app.getHttpServer())
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .send({ amountCents: 1_000 })
        .expect(400); // Missing idempotencyKey
    });
  });

  describe('API documentation', () => {
    it('swagger docs are available', async () => {
      const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
      expect(res.body.info.title).toBe('Outcome Liquidity Exchange');
    });
  });
});
