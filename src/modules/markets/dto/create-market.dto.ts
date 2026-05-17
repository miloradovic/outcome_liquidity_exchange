import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMarketDto {
  @ApiProperty({
    description: 'Stable URL-safe market slug',
    example: 'btc-150k-2027',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({
    description: 'Human-friendly market title',
    example: 'Will Bitcoin reach $150,000 before end of 2027?',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  title!: string;

  @ApiProperty({
    description: 'UTC timestamp when order placement must stop',
    example: '2027-12-31T00:00:00.000Z',
  })
  @IsDateString()
  closesAt!: string;
}