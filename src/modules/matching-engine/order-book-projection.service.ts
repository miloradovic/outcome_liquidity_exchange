import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';

import { Order } from '../markets/entities/order.entity';
import { OutcomeSide } from '../markets/enums/outcome-side.enum';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';

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
export class OrderBookProjectionService {
  private readonly logger = new Logger(OrderBookProjectionService.name);
  private readonly redis: Redis;

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly redisKeyspaceService: RedisKeyspaceService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {
    this.redis = this.redisClientService.getClient();
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
        this.redisKeyspaceService.getOrderBookScanPattern(),
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
    return this.redisKeyspaceService.getOrderBookSideKey(marketId, side);
  }

  private orderHashKey(orderId: string): string {
    return this.redisKeyspaceService.getOrderHashKey(orderId);
  }
}
