import { INestApplication } from '@nestjs/common';
import request from 'supertest';

type PollingOptions = {
  attempts?: number;
  delayMs?: number;
};

type OrderSummary = {
  id: string;
  status: string;
};

const DEFAULT_ATTEMPTS = 25;
const DEFAULT_DELAY_MS = 120;

async function delay(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function waitFor<T>(
  fetchValue: () => Promise<T>,
  assertValue: (value: T) => void,
  options: PollingOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await fetchValue();
      assertValue(value);
      return value;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }

      await delay(delayMs);
    }
  }

  throw new Error('Timed out waiting for expected state');
}

export async function waitForOrderStatus(
  app: INestApplication,
  token: string,
  orderId: string,
  expectedStatus: string,
  options: PollingOptions = {},
): Promise<void> {
  await waitFor<OrderSummary | undefined>(
    async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return (res.body as OrderSummary[]).find((item) => item.id === orderId);
    },
    (order) => {
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      if (order.status !== expectedStatus) {
        throw new Error(
          `Order ${orderId} status ${order.status} did not match expected ${expectedStatus}`,
        );
      }
    },
    options,
  );
}