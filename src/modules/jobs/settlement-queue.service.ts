import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';

export const SETTLEMENT_QUEUE_NAME = 'settlement';

type SettlementJobData = {
  tradeId: string;
};

@Injectable()
export class SettlementQueueService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<SettlementJobData>;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.queue = new Queue<SettlementJobData>(SETTLEMENT_QUEUE_NAME, {
      connection: {
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
      },
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
