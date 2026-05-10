import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Private Balance WebSocket Gateway
 * Broadcasts balance updates to authenticated users only
 * Each user receives updates on their private 'balance:userId' room
 */
@Injectable()
@WebSocketGateway({
  namespace: '/balance',
  cors: {
    origin: '*',
    credentials: false,
  },
})
export class BalanceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(BalanceGateway.name);
  private authenticatedUsers = new Map<string, string>(); // socket.id -> userId

  constructor(private jwtService: JwtService) {}

  afterInit(): void {
    this.logger.log('Balance WebSocket Gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const userId = this.authenticatedUsers.get(client.id);
    if (userId) {
      this.authenticatedUsers.delete(client.id);
      this.logger.log(`Authenticated user ${userId} disconnected`);
    } else {
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('authenticate')
  async handleAuthenticate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { token: string },
  ): Promise<{ status: string; message?: string }> {
    try {
      if (!data?.token) {
        return { status: 'error', message: 'No token provided' };
      }

      const payload = this.jwtService.verify(data.token);
      const userId = payload.sub;

      if (!userId) {
        return { status: 'error', message: 'Invalid token' };
      }

      this.authenticatedUsers.set(client.id, userId);

      // Join private room
      const room = `balance:${userId}`;
      client.join(room);

      this.logger.log(`User ${userId} authenticated via socket ${client.id}`);
      return { status: 'authenticated' };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Authentication failed: ${message}`);
      return { status: 'error', message: 'Authentication failed' };
    }
  }

  private isAuthenticated(client: Socket): boolean {
    return this.authenticatedUsers.has(client.id);
  }

  private getUserId(client: Socket): string | undefined {
    return this.authenticatedUsers.get(client.id);
  }

  broadcastBalanceUpdate(
    userId: string,
    balance: {
      availableBalanceCents: number;
      reservedBalanceCents: number;
    },
  ): void {
    const room = `balance:${userId}`;
    this.server.to(room).emit('balance-update', {
      event: 'balance-update',
      userId,
      timestamp: Date.now(),
      data: balance,
    });
  }

  getAuthenticatedUserCount(): number {
    return this.authenticatedUsers.size;
  }
}


