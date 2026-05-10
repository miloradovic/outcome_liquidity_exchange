import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { MarketsService } from './markets.service';

@ApiTags('markets')
@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all markets' })
  @ApiResponse({
    status: 200,
    description: 'List of all markets',
  })
  async getMarkets() {
    return this.marketsService.getMarkets();
  }

  @Get(':marketId')
  @ApiOperation({ summary: 'Get market details' })
  @ApiParam({ name: 'marketId', description: 'Market UUID' })
  @ApiResponse({
    status: 200,
    description: 'Market details',
  })
  async getMarketById(@Param('marketId') marketId: string) {
    return this.marketsService.getMarketById(marketId);
  }

  @Get(':marketId/order-book')
  @ApiOperation({ summary: 'Get order book for a market' })
  @ApiParam({ name: 'marketId', description: 'Market UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order book (YES and NO sides with price levels)',
  })
  async getOrderBook(@Param('marketId') marketId: string) {
    return this.marketsService.getOrderBook(marketId);
  }
}
