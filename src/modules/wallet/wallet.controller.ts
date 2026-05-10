import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { DepositDto } from './dto/deposit.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiResponse({
    status: 200,
    description: 'Wallet balance retrieved',
    schema: {
      example: {
        id: 'uuid',
        userId: 'uuid',
        currencyCode: 'USD',
        availableBalanceCents: 100000,
        reservedBalanceCents: 25000,
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
  })
  async getWallet(@CurrentUser() user: User) {
    return this.walletService.getWalletByUserId(user.id);
  }

  @Get('entries')
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiResponse({
    status: 200,
    description: 'Wallet entries retrieved',
  })
  async getWalletEntries(@CurrentUser() user: User) {
    return this.walletService.getEntriesForUser(user.id);
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit demo funds' })
  @ApiResponse({
    status: 201,
    description: 'Funds deposited successfully',
  })
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