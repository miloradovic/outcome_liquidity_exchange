import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

type CachedAuthUser = {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AuthUserCacheService {
  private readonly logger = new Logger(AuthUserCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisClientService: RedisClientService,
    private readonly redisKeyspaceService: RedisKeyspaceService,
    private readonly usersService: UsersService,
  ) {
    this.ttlSeconds = this.configService.get<number>(
      'AUTH_USER_CACHE_TTL_SECONDS',
      15,
    );
  }

  async getUserById(userId: string): Promise<User | null> {
    const cacheKey = this.cacheKey(userId);
    const cached = await this.readFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      return null;
    }

    await this.writeToCache(cacheKey, user);
    return user;
  }

  private async readFromCache(cacheKey: string): Promise<User | null> {
    try {
      const rawValue = await this.redisClientService.getClient().get(cacheKey);
      if (!rawValue) {
        return null;
      }

      const parsed = JSON.parse(rawValue) as CachedAuthUser;
      if (
        !parsed.id
        || !parsed.email
        || !parsed.username
        || !parsed.createdAt
        || !parsed.updatedAt
      ) {
        return null;
      }

      return this.toUser(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Unable to read auth user cache: ${message}`);
      return null;
    }
  }

  private async writeToCache(cacheKey: string, user: User): Promise<void> {
    const value: CachedAuthUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    try {
      await this.redisClientService.getClient().set(
        cacheKey,
        JSON.stringify(value),
        'EX',
        this.ttlSeconds,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Unable to write auth user cache: ${message}`);
    }
  }

  private toUser(cached: CachedAuthUser): User {
    const user = new User();
    user.id = cached.id;
    user.email = cached.email;
    user.username = cached.username;
    user.createdAt = new Date(cached.createdAt);
    user.updatedAt = new Date(cached.updatedAt);

    return user;
  }

  private cacheKey(userId: string): string {
    return this.redisKeyspaceService.getAuthUserCacheKey(userId);
  }
}