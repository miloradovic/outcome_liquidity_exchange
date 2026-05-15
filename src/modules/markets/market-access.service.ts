import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Market } from './entities/market.entity';
import { MarketStatus } from './enums/market-status.enum';

@Injectable()
export class MarketAccessService {
  constructor(
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
  ) {}

  async getMarketByIdOrFail(marketId: string): Promise<Market> {
    const market = await this.marketRepository.findOne({
      where: { id: marketId },
      relations: { outcomes: true },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    return market;
  }

  async getOpenMarketForOrderPlacement(
    marketId: string,
    manager: EntityManager,
  ): Promise<Market> {
    const market = await manager.getRepository(Market).findOne({
      where: { id: marketId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!market) {
      throw new NotFoundException('Market not found');
    }

    if (market.status !== MarketStatus.OPEN) {
      throw new BadRequestException('Market is not open');
    }

    return market;
  }
}
