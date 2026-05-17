import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { MarketsService } from './markets.service';

@Injectable()
export class MarketCloseSchedulerService {
  private readonly logger = new Logger(MarketCloseSchedulerService.name);

  constructor(private readonly marketsService: MarketsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCloseExpiredMarkets(): Promise<void> {
    await this.runNow();
  }

  async runNow(now: Date = new Date()): Promise<number> {
    const closedMarkets = await this.marketsService.closeExpiredMarkets(now);
    if (closedMarkets > 0) {
      this.logger.log(`Closed ${closedMarkets} market(s) past closesAt`);
    }

    return closedMarkets;
  }
}