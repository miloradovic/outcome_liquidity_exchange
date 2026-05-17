import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { SettlementQueueFilter } from '../settlement-queue.service';

export enum SettlementJobsStatus {
  FAILED = 'failed',
  PENDING = 'pending',
}

export class ListSettlementJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Settlement queue slice to inspect',
    enum: SettlementJobsStatus,
    default: SettlementJobsStatus.FAILED,
  })
  @IsOptional()
  @IsEnum(SettlementJobsStatus)
  status: SettlementQueueFilter = SettlementJobsStatus.FAILED;
}