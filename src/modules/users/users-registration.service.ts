import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { WalletService } from '../wallet/wallet.service';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Injectable()
export class UsersRegistrationService {
  constructor(
    private readonly usersService: UsersService,
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
  ) {}

  async registerWithWallet(data: {
    email: string;
    passwordHash: string;
    username: string;
  }): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const created = await this.usersService.create(data, manager);
      await this.walletService.createWalletForUser(created.id, 'USD', manager);
      return created;
    });
  }
}
