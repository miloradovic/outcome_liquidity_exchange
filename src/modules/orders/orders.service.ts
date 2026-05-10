import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { MatchingEngineService } from '../matching-engine/matching-engine.service';
import { Market } from '../markets/entities/market.entity';
import { Order } from '../markets/entities/order.entity';
import { MarketStatus } from '../markets/enums/market-status.enum';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { WalletService } from '../wallet/wallet.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
    private readonly walletService: WalletService,
    private readonly matchingEngineService: MatchingEngineService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async placeOrder(userId: string, dto: PlaceOrderDto): Promise<Order> {
    const market = await this.marketRepository.findOne({ where: { id: dto.marketId } });
    if (!market) {
      throw new NotFoundException('Market not found');
    }
    if (market.status !== MarketStatus.OPEN) {
      throw new BadRequestException('Market is not open');
    }

    const reservedCents = dto.priceCents * dto.quantity;
    if (!Number.isSafeInteger(reservedCents) || reservedCents <= 0) {
      throw new BadRequestException('Invalid order reserve amount');
    }

    const order = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const existing = await orderRepo.findOne({
        where: { userId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return existing;
      }

      const created = orderRepo.create({
        userId,
        marketId: dto.marketId,
        side: dto.side,
        priceCents: dto.priceCents,
        quantity: dto.quantity,
        reservedCents,
        status: OrderStatus.OPEN,
        idempotencyKey: dto.idempotencyKey,
      });
      const saved = await orderRepo.save(created);

      await this.walletService.reserve(
        userId,
        reservedCents,
        `order-reserve:${dto.idempotencyKey}`,
        saved.id,
        manager,
      );

      return saved;
    });

    await this.matchingEngineService.projectOpenOrder(order);

    try {
      const orderBook = await this.matchingEngineService.getOrderBook(order.marketId);
      this.realtimeService.broadcastOrderBookUpdate(order.marketId, orderBook);
    } catch (error) {
      this.logger.warn(`Failed to broadcast order book update: ${error}`);
    }

    // Matching is best-effort here; order placement remains durable in PostgreSQL.
    try {
      await this.matchingEngineService.tryMatchOrder(order.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Matching attempt failed for order ${order.id}: ${message}`);
    }

    return order;
  }

  async cancelOrder(userId: string, orderId: string): Promise<Order> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { id: orderId, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.OPEN) {
        throw new BadRequestException('Only OPEN orders can be cancelled');
      }

      order.status = OrderStatus.CANCELLED;
      await orderRepo.save(order);

      await this.walletService.release(
        userId,
        order.reservedCents,
        `order-cancel:${order.id}`,
        order.id,
        manager,
      );

      return order;
    });

    await this.matchingEngineService.removeOpenOrder(cancelled);

    try {
      const orderBook = await this.matchingEngineService.getOrderBook(cancelled.marketId);
      this.realtimeService.broadcastOrderBookUpdate(cancelled.marketId, orderBook);
    } catch (error) {
      this.logger.warn(`Failed to broadcast order book update: ${error}`);
    }

    return cancelled;
  }

  async getMyOrders(userId: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
