import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class DepositDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountCents!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;
}