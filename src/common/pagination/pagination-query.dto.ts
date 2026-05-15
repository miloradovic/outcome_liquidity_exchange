import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { DEFAULT_PAGINATION, MAX_PAGINATION_LIMIT } from './pagination';

const parseNumber = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return Number(value);
};

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of items to return',
    minimum: 1,
    maximum: MAX_PAGINATION_LIMIT,
    default: DEFAULT_PAGINATION.limit,
  })
  @Transform(({ value }) => parseNumber(value, DEFAULT_PAGINATION.limit))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGINATION_LIMIT)
  limit: number = DEFAULT_PAGINATION.limit;

  @ApiPropertyOptional({
    description: 'Number of items to skip',
    minimum: 0,
    default: DEFAULT_PAGINATION.offset,
  })
  @Transform(({ value }) => parseNumber(value, DEFAULT_PAGINATION.offset))
  @IsInt()
  @Min(0)
  offset: number = DEFAULT_PAGINATION.offset;
}
