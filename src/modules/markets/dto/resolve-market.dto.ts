import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { OutcomeSide } from '../enums/outcome-side.enum';

export class ResolveMarketDto {
  @ApiProperty({
    description: 'Winning outcome side for this market',
    enum: OutcomeSide,
    example: OutcomeSide.YES,
  })
  @IsEnum(OutcomeSide)
  winningSide!: OutcomeSide;
}
