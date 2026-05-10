import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '../users/entities/user.entity';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly walletService: WalletService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> }> {
    const exists = await this.usersService.existsByEmail(dto.email);
    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.dataSource.transaction(async (manager) => {
      const created = await this.usersService.create(
        {
          email: dto.email,
          passwordHash,
          username: dto.username,
        },
        manager,
      );
      await this.walletService.createWalletForUser(created.id, 'USD', manager);
      return created;
    });

    return { accessToken: this.issueToken(user), user: this.sanitize(user) };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { accessToken: this.issueToken(user), user: this.sanitize(user) };
  }

  private issueToken(user: User): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload);
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...rest } = user;
    return rest;
  }
}
