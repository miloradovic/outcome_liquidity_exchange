import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_REDIS_KEY_PREFIX = 'olx';

@Injectable()
export class RedisKeyspaceService {
  private readonly keyPrefix: string;

  constructor(private readonly configService: ConfigService) {
    const configuredPrefix = this.configService.get<string>(
      'REDIS_KEY_PREFIX',
      DEFAULT_REDIS_KEY_PREFIX,
    );
    this.keyPrefix = this.normalizePrefix(configuredPrefix);
  }

  getOrderBookScanPattern(): string {
    return this.buildKey('orderbook', '*');
  }

  getOrderBookSideKey(marketId: string, side: string): string {
    return this.buildKey('orderbook', marketId, side);
  }

  getOrderHashKey(orderId: string): string {
    return this.buildKey('orderbook', 'order', orderId);
  }

  getBullPrefix(): string {
    return this.buildKey('bull');
  }

  getAuthUserCacheKey(userId: string): string {
    return this.buildKey('auth', 'user', userId);
  }

  private buildKey(...parts: string[]): string {
    return [this.keyPrefix, ...parts].join(':');
  }

  private normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim();
    if (trimmed.length === 0) {
      return DEFAULT_REDIS_KEY_PREFIX;
    }

    return trimmed.replace(/:+$/g, '');
  }
}
