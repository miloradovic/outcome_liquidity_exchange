import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResolveMarketDto } from './dto/resolve-market.dto';
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

  @Post(':marketId/resolve')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve a market and credit winning positions' })
  @ApiParam({ name: 'marketId', description: 'Market UUID' })
  @ApiResponse({
    status: 200,
    description: 'Market resolved and winners credited',
  })
  async resolveMarket(
    @Param('marketId', ParseUUIDPipe) marketId: string,
    @Body() dto: ResolveMarketDto,
  ) {
    return this.marketsService.resolveMarket(marketId, dto.winningSide);
  }
}
