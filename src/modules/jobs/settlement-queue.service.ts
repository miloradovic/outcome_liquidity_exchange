import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  Job,
  JobState,
  JobType,
  JobsOptions,
  Queue,
} from 'bullmq';

import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';

export const SETTLEMENT_QUEUE_NAME = 'settlement';

export type SettlementJobData = {
  tradeId: string;
};

export type SettlementQueueFilter = 'failed' | 'pending';

export type SettlementQueueJobSummary = {
  jobId: string;
  tradeId: string;
  state: JobState | 'unknown';
  attemptsMade: number;
  attempts: number;
  failedReason: string | null;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
};

export type SettlementQueueRetryResult = {
  action: 'enqueued' | 'retried' | 'already-pending';
  jobId: string;
  tradeId: string;
  state: JobState | 'unknown';
};

const PENDING_JOB_TYPES: JobType[] = [
  'waiting',
  'active',
  'delayed',
  'paused',
  'prioritized',
  'waiting-children',
];

const FAILED_JOB_TYPES: JobType[] = ['failed'];

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
    await this.queue.add('settle-trade', { tradeId }, this.buildJobOptions(tradeId));
  }

  async listSettlementJobs(
    filter: SettlementQueueFilter,
    limit: number,
    offset: number,
  ): Promise<SettlementQueueJobSummary[]> {
    const end = offset + Math.max(limit - 1, 0);
    const jobs = await this.queue.getJobs(this.mapFilterToJobTypes(filter), offset, end, false);
    const summaries = await Promise.all(jobs.map((job) => this.toSummary(job)));
    return summaries.filter((item): item is SettlementQueueJobSummary => item !== null);
  }

  async getTradeIdByJobId(jobId: string): Promise<string | null> {
    const job = await this.queue.getJob(jobId);
    return job?.data.tradeId ?? null;
  }

  async retrySettlementByJobId(jobId: string): Promise<SettlementQueueRetryResult> {
    const tradeId = await this.getTradeIdByJobId(jobId);
    if (!tradeId) {
      throw new NotFoundException(`Settlement job not found: ${jobId}`);
    }

    return this.retrySettlementByTradeId(tradeId);
  }

  async retrySettlementByTradeId(tradeId: string): Promise<SettlementQueueRetryResult> {
    const jobId = this.buildJobId(tradeId);
    const existingJob = await this.queue.getJob(jobId);

    if (!existingJob) {
      await this.queue.add('settle-trade', { tradeId }, this.buildJobOptions(tradeId));
      return {
        action: 'enqueued',
        jobId,
        tradeId,
        state: 'waiting',
      };
    }

    const existingState = await existingJob.getState();
    if (existingState === 'failed') {
      await existingJob.retry();
      return {
        action: 'retried',
        jobId,
        tradeId,
        state: 'waiting',
      };
    }

    if (this.isPendingState(existingState)) {
      return {
        action: 'already-pending',
        jobId,
        tradeId,
        state: existingState,
      };
    }

    try {
      await existingJob.remove();
    } catch {
      // If the job cannot be removed because it is currently locked, keep it.
    }

    await this.queue.add('settle-trade', { tradeId }, this.buildJobOptions(tradeId));
    return {
      action: 'enqueued',
      jobId,
      tradeId,
      state: 'waiting',
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }

  private buildJobOptions(tradeId: string): JobsOptions {
    return {
      jobId: this.buildJobId(tradeId),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 200,
      },
    };
  }

  private buildJobId(tradeId: string): string {
    return `trade-${tradeId}`;
  }

  private mapFilterToJobTypes(filter: SettlementQueueFilter): JobType[] {
    return filter === 'pending' ? PENDING_JOB_TYPES : FAILED_JOB_TYPES;
  }

  private isPendingState(state: JobState | 'unknown'): boolean {
    return (
      state === 'waiting'
      || state === 'active'
      || state === 'delayed'
      || state === 'paused'
      || state === 'prioritized'
      || state === 'waiting-children'
    );
  }

  private async toSummary(
    job: Job<SettlementJobData>,
  ): Promise<SettlementQueueJobSummary | null> {
    const tradeId = job.data?.tradeId;
    if (!tradeId) {
      return null;
    }

    return {
      jobId: job.id !== undefined ? String(job.id) : this.buildJobId(tradeId),
      tradeId,
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      attempts: typeof job.opts.attempts === 'number' ? job.opts.attempts : 1,
      failedReason: job.failedReason ?? null,
      timestamp: job.timestamp,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
    };
  }
}
