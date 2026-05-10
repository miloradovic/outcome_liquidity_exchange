import { IsEnum, IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

import { OutcomeSide } from '../../markets/enums/outcome-side.enum';

export class PlaceOrderDto {
  @IsUUID()
  marketId!: string;

  @IsEnum(OutcomeSide)
  side!: OutcomeSide;

  @IsInt()
  @Min(1)
  @Max(99)
  priceCents!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
