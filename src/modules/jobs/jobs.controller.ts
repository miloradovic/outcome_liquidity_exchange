import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { ListSettlementJobsQueryDto } from './dto/list-settlement-jobs-query.dto';
import {
  SettlementQueueService,
  type SettlementQueueFilter,
} from './settlement-queue.service';
import { SettlementRecoveryService } from './settlement-recovery.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly settlementQueueService: SettlementQueueService,
    private readonly settlementRecoveryService: SettlementRecoveryService,
  ) {}

  @Get('settlements')
  @AdminOnly()
  @ApiOperation({ summary: 'List failed or pending settlement jobs' })
  @ApiResponse({
    status: 200,
    description: 'Settlement jobs returned',
  })
  async listSettlementJobs(@Query() query: ListSettlementJobsQueryDto) {
    return this.settlementQueueService.listSettlementJobs(
      query.status as SettlementQueueFilter,
      query.limit,
      query.offset,
    );
  }

  @Post('settlements/retry/trades/:tradeId')
  @HttpCode(200)
  @AdminOnly()
  @ApiOperation({ summary: 'Retry settlement processing for a trade' })
  @ApiParam({ name: 'tradeId', description: 'Trade UUID' })
  @ApiResponse({
    status: 200,
    description: 'Settlement retry requested successfully',
  })
  async retrySettlementByTradeId(
    @Param('tradeId', ParseUUIDPipe) tradeId: string,
  ) {
    return this.settlementRecoveryService.retryByTradeId(tradeId);
  }

  @Post('settlements/retry/jobs/:jobId')
  @HttpCode(200)
  @AdminOnly()
  @ApiOperation({ summary: 'Retry settlement processing by queue job identifier' })
  @ApiParam({ name: 'jobId', description: 'Settlement queue job identifier' })
  @ApiResponse({
    status: 200,
    description: 'Settlement retry requested successfully',
  })
  async retrySettlementByJobId(@Param('jobId') jobId: string) {
    return this.settlementRecoveryService.retryByJobId(jobId);
  }
}