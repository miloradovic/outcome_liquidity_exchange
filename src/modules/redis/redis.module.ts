import { Global, Module } from '@nestjs/common';

import { RedisClientService } from './redis-client.service';
import { RedisKeyspaceService } from './redis-keyspace.service';

@Global()
@Module({
  providers: [RedisClientService, RedisKeyspaceService],
  exports: [RedisClientService, RedisKeyspaceService],
})
export class RedisModule {}
