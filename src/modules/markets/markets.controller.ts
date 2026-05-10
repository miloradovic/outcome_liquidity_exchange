import { Controller, Get, Param } from '@nestjs/common';

import { MarketsService } from './markets.service';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  async getMarkets() {
    return this.marketsService.getMarkets();
  }

  @Get(':marketId')
  async getMarketById(@Param('marketId') marketId: string) {
    return this.marketsService.getMarketById(marketId);
  }

  @Get(':marketId/order-book')
  async getOrderBook(@Param('marketId') marketId: string) {
    return this.marketsService.getOrderBook(marketId);
  }
}
