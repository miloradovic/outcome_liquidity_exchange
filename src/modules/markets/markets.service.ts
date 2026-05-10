import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MatchingEngineService, OrderBookView } from '../matching-engine/matching-engine.service';
import { Market } from './entities/market.entity';

@Injectable()
export class MarketsService {
  constructor(
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
    private readonly matchingEngineService: MatchingEngineService,
  ) {}

  async getMarkets(): Promise<Market[]> {
    return this.marketRepository.find({
      relations: { outcomes: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getMarketById(marketId: string): Promise<Market> {
    const market = await this.marketRepository.findOne({
      where: { id: marketId },
      relations: { outcomes: true },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    return market;
  }

  async getOrderBook(marketId: string): Promise<OrderBookView> {
    await this.getMarketById(marketId);
    return this.matchingEngineService.getOrderBook(marketId);
  }
}
