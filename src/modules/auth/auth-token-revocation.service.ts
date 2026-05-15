import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';

const DEFAULT_REVOCATION_TTL_SECONDS = 86_400;

@Injectable()
export class AuthTokenRevocationService {
  private readonly logger = new Logger(AuthTokenRevocationService.name);

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly redisKeyspaceService: RedisKeyspaceService,
  ) {}

  async revokeToken(token: string, expUnixSeconds: number | null): Promise<void> {
    const ttlSeconds = this.resolveTtlSeconds(expUnixSeconds);
    if (ttlSeconds <= 0) {
      return;
    }

    const key = this.redisKeyspaceService.getAuthRevokedTokenKey(this.hashToken(token));
    try {
      await this.redisClientService.getClient().set(key, '1', 'EX', ttlSeconds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Unable to revoke token in Redis: ${message}`);
    }
  }

  async isTokenRevoked(token: string): Promise<boolean> {
    const key = this.redisKeyspaceService.getAuthRevokedTokenKey(this.hashToken(token));
    try {
      const exists = await this.redisClientService.getClient().exists(key);
      return exists === 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Unable to read token revocation state: ${message}`);
      return false;
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resolveTtlSeconds(expUnixSeconds: number | null): number {
    if (!expUnixSeconds) {
      return DEFAULT_REVOCATION_TTL_SECONDS;
    }

    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    return Math.max(0, expUnixSeconds - nowUnixSeconds);
  }
}
