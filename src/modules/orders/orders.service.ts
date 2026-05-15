import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { DEFAULT_PAGINATION, PaginationParams } from '../../common/pagination/pagination';
import { MatchingEngineBroadcastService } from '../matching-engine/matching-engine-broadcast.service';
import { MatchingEngineService } from '../matching-engine/matching-engine.service';
import { OrderBookProjectionService } from '../matching-engine/order-book-projection.service';
import { MarketAccessService } from '../markets/market-access.service';
import { Order } from '../markets/entities/order.entity';
import { OrderStatus } from '../markets/enums/order-status.enum';
import { WalletService } from '../wallet/wallet.service';
import { PlaceOrderDto } from './dto/place-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly marketAccessService: MarketAccessService,
    private readonly walletService: WalletService,
    private readonly matchingEngineService: MatchingEngineService,
    private readonly orderBookProjectionService: OrderBookProjectionService,
    private readonly matchingEngineBroadcastService: MatchingEngineBroadcastService,
  ) {}

  async placeOrder(userId: string, dto: PlaceOrderDto): Promise<Order> {
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

      await this.marketAccessService.getOpenMarketForOrderPlacement(
        dto.marketId,
        manager,
      );

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

    await this.orderBookProjectionService.projectOpenOrder(order);

    try {
      await this.matchingEngineBroadcastService.broadcastOrderBookUpdate(order.marketId);
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

    await this.orderBookProjectionService.removeOpenOrder(cancelled);

    try {
      await this.matchingEngineBroadcastService.broadcastOrderBookUpdate(cancelled.marketId);
    } catch (error) {
      this.logger.warn(`Failed to broadcast order book update: ${error}`);
    }

    return cancelled;
  }

  async getMyOrders(
    userId: string,
    pagination: PaginationParams = DEFAULT_PAGINATION,
  ): Promise<Order[]> {
    const { limit, offset } = pagination;
    return this.orderRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
