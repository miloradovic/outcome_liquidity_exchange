import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/order-book',
})
export class OrderBookGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(OrderBookGateway.name);

  afterInit(): void {
    this.logger.log('Order Book WebSocket Gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    client: Socket,
    data: { marketId: string },
  ): { status: string } {
    if (!data?.marketId) {
      return { status: 'error' };
    }

    const room = `order-book:${data.marketId}`;
    client.join(room);
    this.logger.debug(
      `Client ${client.id} subscribed to ${room}`,
    );
    return { status: 'subscribed' };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    client: Socket,
    data: { marketId: string },
  ): { status: string } {
    if (!data?.marketId) {
      return { status: 'error' };
    }

    const room = `order-book:${data.marketId}`;
    client.leave(room);
    this.logger.debug(
      `Client ${client.id} unsubscribed from ${room}`,
    );
    return { status: 'unsubscribed' };
  }

  broadcastOrderBookUpdate(marketId: string, orderBook: unknown): void {
    const room = `order-book:${marketId}`;
    this.server.to(room).emit('order-book-update', {
      event: 'order-book-update',
      marketId,
      timestamp: Date.now(),
      data: orderBook,
    });
  }

  broadcastTradeCreated(marketId: string, trade: unknown): void {
    const room = `order-book:${marketId}`;
    this.server.to(room).emit('trade-created', {
      event: 'trade-created',
      marketId,
      timestamp: Date.now(),
      data: trade,
    });
  }
}

