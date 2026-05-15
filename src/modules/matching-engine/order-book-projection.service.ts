import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';

import { Order } from '../markets/entities/order.entity';
import { OutcomeSide } from '../markets/enums/outcome-side.enum';
import { OrderStatus } from '../markets/enums/order-status.enum';

export type OrderBookLevel = {
  priceCents: number;
  quantity: number;
};

export type OrderBookView = {
  marketId: string;
  yes: OrderBookLevel[];
  no: OrderBookLevel[];
};

@Injectable()
export class OrderBookProjectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderBookProjectionService.name);
  private redis!: Redis;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: null,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async projectOpenOrder(order: Order): Promise<void> {
    if (order.status !== OrderStatus.OPEN) {
      return;
    }

    const key = this.sideKey(order.marketId, order.side);
    const hashKey = this.orderHashKey(order.id);

    await this.redis.multi()
      .zadd(key, String(order.priceCents), order.id)
      .hset(hashKey, {
        marketId: order.marketId,
        side: order.side,
        priceCents: String(order.priceCents),
        quantity: String(order.quantity),
      })
      .exec();
  }

  async removeOpenOrder(order: Order): Promise<void> {
    const key = this.sideKey(order.marketId, order.side);
    const hashKey = this.orderHashKey(order.id);

    await this.redis.multi()
      .zrem(key, order.id)
      .del(hashKey)
      .exec();
  }

  async getOrderBook(marketId: string): Promise<OrderBookView> {
    const [yesIds, noIds] = await Promise.all([
      this.redis.zrevrange(this.sideKey(marketId, OutcomeSide.YES), 0, -1),
      this.redis.zrange(this.sideKey(marketId, OutcomeSide.NO), 0, -1),
    ]);

    const [yes, no] = await Promise.all([
      this.buildLevels(yesIds),
      this.buildLevels(noIds),
    ]);

    return { marketId, yes, no };
  }

  async rebuildFromOpenOrders(): Promise<void> {
    const startedAt = Date.now();
    await this.deleteProjectionKeys();

    const openOrders = await this.orderRepository.find({
      where: { status: OrderStatus.OPEN },
    });

    for (const order of openOrders) {
      await this.projectOpenOrder(order);
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Redis order book rebuilt from PostgreSQL OPEN orders: count=${openOrders.length}, durationMs=${durationMs}`,
    );
  }

  private async buildLevels(orderIds: string[]): Promise<OrderBookLevel[]> {
    const levels = new Map<number, number>();
    if (orderIds.length === 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (const orderId of orderIds) {
      pipeline.hmget(this.orderHashKey(orderId), 'quantity', 'priceCents');
    }

    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    for (const [error, data] of results) {
      if (error || !Array.isArray(data)) {
        continue;
      }

      const [quantityValue, priceValue] = data as [string | null, string | null];
      const quantity = parseInt(quantityValue ?? '0', 10);
      const priceCents = parseInt(priceValue ?? '0', 10);
      if (quantity <= 0 || priceCents <= 0) {
        continue;
      }

      levels.set(priceCents, (levels.get(priceCents) ?? 0) + quantity);
    }

    return Array.from(levels.entries())
      .map(([priceCents, quantity]) => ({ priceCents, quantity }))
      .sort((a, b) => b.priceCents - a.priceCents);
  }

  private async deleteProjectionKeys(): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'orderbook:*',
        'COUNT',
        '100',
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  private sideKey(marketId: string, side: OutcomeSide): string {
    return `orderbook:${marketId}:${side}`;
  }

  private orderHashKey(orderId: string): string {
    return `orderbook:order:${orderId}`;
  }
}
