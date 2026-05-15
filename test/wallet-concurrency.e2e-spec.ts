import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { WalletService } from '../src/modules/wallet/wallet.service';

describe('Wallet Concurrency (e2e)', () => {
  let app: INestApplication;
  let walletService: WalletService;
  let accessToken: string;
  let userId: string;

  const testUser = {
    email: `wallet-concurrency-${Date.now()}@demo.com`,
    password: 'Password123!',
    username: `walletconcurrent${Date.now()}`,
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    walletService = app.get(WalletService);

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);
    accessToken = registerRes.body.accessToken as string;

    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    userId = meRes.body.id as string;

    await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        amountCents: 1_000,
        idempotencyKey: `seed-deposit-${Date.now()}`,
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('prevents double-spend under concurrent reserve attempts', async () => {
    const reserveAmount = 100;
    const attempts = 50;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, index) =>
        walletService.reserve(
          userId,
          reserveAmount,
          `reserve-concurrent-${Date.now()}-${index}`,
          `order-${index}`,
        ),
      ),
    );

    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const failureCount = results.filter((result) => result.status === 'rejected').length;

    expect(successCount).toBe(10);
    expect(failureCount).toBe(40);

    const wallet = await walletService.getWalletByUserId(userId);
    expect(wallet.availableBalanceCents).toBe(0);
    expect(wallet.reservedBalanceCents).toBe(1_000);
  });
});