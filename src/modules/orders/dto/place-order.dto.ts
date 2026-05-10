import { IsEnum, IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { OutcomeSide } from '../../markets/enums/outcome-side.enum';

export class PlaceOrderDto {
  @ApiProperty({
    description: 'Market UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  marketId!: string;

  @ApiProperty({
    description: 'Order side (YES or NO)',
    enum: OutcomeSide,
    example: 'YES',
  })
  @IsEnum(OutcomeSide)
  side!: OutcomeSide;

  @ApiProperty({
    description: 'Price in cents (1-99, complementary to other side)',
    example: 60,
  })
  @IsInt()
  @Min(1)
  @Max(99)
  priceCents!: number;

  @ApiProperty({
    description: 'Quantity of outcome tokens',
    example: 100,
  })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    description: 'Idempotency key for order placement',
    example: 'order-20240101-001',
  })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
