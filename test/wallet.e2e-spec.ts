import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Wallet (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  const testUser = {
    email: `wallet-e2e-${Date.now()}@demo.com`,
    password: 'Password123!',
    username: `walletuser${Date.now()}`,
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

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);
    accessToken = registerRes.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns wallet with zero balances for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/wallet')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.availableBalanceCents).toBe(0);
    expect(res.body.reservedBalanceCents).toBe(0);
    expect(res.body.currencyCode).toBe('USD');
  });

  it('deposits funds idempotently and records one ledger entry', async () => {
    const idempotencyKey = `wallet-deposit-${Date.now()}`;

    await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amountCents: 1_500, idempotencyKey })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amountCents: 1_500, idempotencyKey })
      .expect(201);

    const walletRes = await request(app.getHttpServer())
      .get('/api/wallet')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(walletRes.body.availableBalanceCents).toBe(1_500);
    expect(walletRes.body.reservedBalanceCents).toBe(0);

    const entriesRes = await request(app.getHttpServer())
      .get('/api/wallet/entries')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(Array.isArray(entriesRes.body)).toBe(true);
    expect(entriesRes.body.length).toBe(1);
    expect(entriesRes.body[0].entryType).toBe('DEPOSIT');
  });
});