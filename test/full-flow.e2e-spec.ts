import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Full Order Flow (e2e)', () => {
  let app: INestApplication;
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
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
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

    // Get first market
    const marketsRes = await request(app.getHttpServer())
      .get('/api/markets')
      .expect(200);
    marketId = marketsRes.body[0].id;
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

    it('bob balance reflects reservation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/wallet')
        .set('Authorization', `Bearer ${accessTokenBob}`)
        .expect(200);

      expect(res.body.availableBalanceCents).toBe(6_000); // 10_000 - 4_000
      expect(res.body.reservedBalanceCents).toBe(4_000); // 40 * 100
    });

    it('order book reflects both orders', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/markets/${marketId}/order-book`)
        .expect(200);

      // Check YES side
      const yesLevel = res.body.yes.find((l: Record<string, unknown>) => l.priceCents === 60);
      expect(yesLevel).toBeDefined();

      // Check NO side
      const noLevel = res.body.no.find((l: Record<string, unknown>) => l.priceCents === 40);
      expect(noLevel).toBeDefined();
    });

    it('alice can cancel her order and funds are released', async () => {
      // Get alice's order ID
      const ordersRes = await request(app.getHttpServer())
        .get('/api/orders/me')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .expect(200);

      const yesOrder = ordersRes.body.find(
        (o: Record<string, unknown>) => o.side === 'YES' && o.status === 'OPEN',
      );
      if (!yesOrder) {
        throw new Error('No open YES order found');
      }

      // Cancel the order
      const cancelRes = await request(app.getHttpServer())
        .delete(`/api/orders/${yesOrder.id}`)
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .expect(200);

      expect(cancelRes.body.status).toBe('CANCELLED');

      // Check balance is fully released
      const walletRes = await request(app.getHttpServer())
        .get('/api/wallet')
        .set('Authorization', `Bearer ${accessTokenAlice}`)
        .expect(200);

      expect(walletRes.body.availableBalanceCents).toBe(10_000);
      expect(walletRes.body.reservedBalanceCents).toBe(0);
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
      const res = await request(app.getHttpServer()).get('/docs').expect(200);
      expect(res.text).toContain('Outcome Liquidity Exchange');
    });
  });
});
