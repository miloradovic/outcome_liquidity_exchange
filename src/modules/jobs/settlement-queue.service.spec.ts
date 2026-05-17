import { NotFoundException } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import { RedisClientService } from '../redis/redis-client.service';
import { RedisKeyspaceService } from '../redis/redis-keyspace.service';
import {
  SettlementJobData,
  SettlementQueueService,
} from './settlement-queue.service';

type MockQueue = {
  add: jest.Mock;
  getJob: jest.Mock;
  getJobs: jest.Mock;
};

const createMockJob = (params: {
  jobId: string;
  tradeId: string;
  state: 'waiting' | 'active' | 'failed';
  failedReason?: string;
}): Job<SettlementJobData> => ({
  id: params.jobId,
  data: { tradeId: params.tradeId },
  attemptsMade: 1,
  opts: { attempts: 3 },
  failedReason: params.failedReason,
  timestamp: 123,
  processedOn: 234,
  finishedOn: params.state === 'failed' ? 345 : undefined,
  getState: jest.fn().mockResolvedValue(params.state),
  retry: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
} as unknown as Job<SettlementJobData>);

describe('SettlementQueueService', () => {
  let service: SettlementQueueService;
  let queue: MockQueue;

  beforeEach(() => {
    queue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getJobs: jest.fn(),
    };

    service = new SettlementQueueService(
      {
        getClient: jest.fn(),
      } as unknown as RedisClientService,
      {
        getBullPrefix: jest.fn(() => 'test'),
      } as unknown as RedisKeyspaceService,
    );

    (service as unknown as { queue: Queue<SettlementJobData> }).queue =
      queue as unknown as Queue<SettlementJobData>;
  });

  afterEach(() => jest.clearAllMocks());

  it('lists failed settlement jobs', async () => {
    const failedJob = createMockJob({
      jobId: 'trade-1',
      tradeId: 'trade-1',
      state: 'failed',
      failedReason: 'simulated failure',
    });
    queue.getJobs.mockResolvedValue([failedJob]);

    const jobs = await service.listSettlementJobs('failed', 10, 5);

    expect(queue.getJobs).toHaveBeenCalledWith(['failed'], 5, 14, false);
    expect(jobs).toEqual([
      {
        jobId: 'trade-1',
        tradeId: 'trade-1',
        state: 'failed',
        attemptsMade: 1,
        attempts: 3,
        failedReason: 'simulated failure',
        timestamp: 123,
        processedOn: 234,
        finishedOn: 345,
      },
    ]);
  });

  it('skips malformed settlement jobs without trade identifiers', async () => {
    const malformedJob = createMockJob({
      jobId: 'malformed-job',
      tradeId: 'placeholder',
      state: 'failed',
    });
    (malformedJob as unknown as { data: unknown }).data = {};
    queue.getJobs.mockResolvedValue([malformedJob]);

    const jobs = await service.listSettlementJobs('failed', 10, 0);

    expect(jobs).toEqual([]);
  });

  it('enqueues a settlement job when retrying a missing trade job', async () => {
    queue.getJob.mockResolvedValue(null);

    const result = await service.retrySettlementByTradeId('trade-2');

    expect(queue.add).toHaveBeenCalledWith(
      'settle-trade',
      { tradeId: 'trade-2' },
      {
        jobId: 'trade-trade-2',
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 200,
        },
      },
    );
    expect(result).toEqual({
      action: 'enqueued',
      jobId: 'trade-trade-2',
      tradeId: 'trade-2',
      state: 'waiting',
    });
  });

  it('retries an existing failed settlement job', async () => {
    const failedJob = createMockJob({
      jobId: 'trade-trade-3',
      tradeId: 'trade-3',
      state: 'failed',
    });
    queue.getJob.mockResolvedValue(failedJob);

    const result = await service.retrySettlementByTradeId('trade-3');

    expect((failedJob.retry as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'retried',
      jobId: 'trade-trade-3',
      tradeId: 'trade-3',
      state: 'waiting',
    });
  });

  it('returns already-pending for jobs that are still waiting', async () => {
    const waitingJob = createMockJob({
      jobId: 'trade-trade-4',
      tradeId: 'trade-4',
      state: 'waiting',
    });
    queue.getJob.mockResolvedValue(waitingJob);

    const result = await service.retrySettlementByTradeId('trade-4');

    expect((waitingJob.retry as jest.Mock)).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toEqual({
      action: 'already-pending',
      jobId: 'trade-trade-4',
      tradeId: 'trade-4',
      state: 'waiting',
    });
  });

  it('throws not found when retrying an unknown job identifier', async () => {
    queue.getJob.mockResolvedValue(null);

    await expect(service.retrySettlementByJobId('missing-job')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});