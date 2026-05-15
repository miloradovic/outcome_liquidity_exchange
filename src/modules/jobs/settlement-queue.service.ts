import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';

import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';

export const SETTLEMENT_QUEUE_NAME = 'settlement';

type SettlementJobData = {
  tradeId: string;
};

@Injectable()
export class SettlementQueueService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<SettlementJobData>;

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly redisKeyspaceService: RedisKeyspaceService,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue<SettlementJobData>(SETTLEMENT_QUEUE_NAME, {
      connection: this.redisClientService.getClient(),
      prefix: this.redisKeyspaceService.getBullPrefix(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });
  }

  async addSettlementJob(tradeId: string): Promise<void> {
    const opts: JobsOptions = {
      jobId: `trade-${tradeId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 200,
      },
    };

    await this.queue.add('settle-trade', { tradeId }, opts);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }
}
