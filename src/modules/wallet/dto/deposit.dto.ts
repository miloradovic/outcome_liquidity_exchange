import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({
    description: 'Amount to deposit in cents (0.01 to 10,000,000 USD)',
    example: 100000,
  })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountCents!: number;

  @ApiProperty({
    description: 'Idempotency key for deposit',
    example: 'deposit-20240101-001',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;
}