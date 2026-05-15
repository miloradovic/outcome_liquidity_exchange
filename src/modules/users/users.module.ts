import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WalletModule } from '../wallet/wallet.module';
import { User } from './entities/user.entity';
import { UsersRegistrationService } from './users-registration.service';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), WalletModule],
  providers: [UsersService, UsersRegistrationService],
  exports: [UsersService, UsersRegistrationService],
})
export class UsersModule {}
