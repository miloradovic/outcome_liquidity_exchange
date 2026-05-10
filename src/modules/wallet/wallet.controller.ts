import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { DepositDto } from './dto/deposit.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@CurrentUser() user: User) {
    return this.walletService.getWalletByUserId(user.id);
  }

  @Get('entries')
  async getWalletEntries(@CurrentUser() user: User) {
    return this.walletService.getEntriesForUser(user.id);
  }

  @Post('deposit')
  async deposit(@CurrentUser() user: User, @Body() dto: DepositDto) {
    const wallet = await this.walletService.deposit(
      user.id,
      dto.amountCents,
      dto.idempotencyKey,
    );
    return {
      wallet,
      amountCents: dto.amountCents,
      idempotencyKey: dto.idempotencyKey,
    };
  }
}