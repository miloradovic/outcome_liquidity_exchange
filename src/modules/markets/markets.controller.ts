import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { OrderBookProjectionService } from '../matching-engine/order-book-projection.service';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { CreateMarketDto } from './dto/create-market.dto';
import { ResolveMarketDto } from './dto/resolve-market.dto';
import { MarketsService } from './markets.service';

@ApiTags('markets')
@Controller('markets')
export class MarketsController {
  constructor(
    private readonly marketsService: MarketsService,
    private readonly orderBookProjectionService: OrderBookProjectionService,
  ) {}

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Create a market' })
  @ApiResponse({
    status: 201,
    description: 'Market created successfully',
  })
  async createMarket(@Body() dto: CreateMarketDto) {
    return this.marketsService.createMarket(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all markets' })
  @ApiResponse({
    status: 200,
    description: 'List of all markets',
  })
  async getMarkets(@Query() pagination: PaginationQueryDto) {
    return this.marketsService.getMarkets(pagination);
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
    await this.marketsService.getMarketById(marketId);
    return this.orderBookProjectionService.getOrderBook(marketId);
  }

  @Post(':marketId/close')
  @HttpCode(200)
  @AdminOnly()
  @ApiOperation({ summary: 'Close a market for new trading' })
  @ApiParam({ name: 'marketId', description: 'Market UUID' })
  @ApiResponse({
    status: 200,
    description: 'Market closed successfully',
  })
  async closeMarket(@Param('marketId', ParseUUIDPipe) marketId: string) {
    return this.marketsService.closeMarket(marketId);
  }

  @Post(':marketId/resolve')
  @HttpCode(200)
  @AdminOnly()
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
