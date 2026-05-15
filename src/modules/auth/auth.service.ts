import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { User } from '../users/entities/user.entity';

const BCRYPT_ROUNDS = 10;
const UNIQUE_VIOLATION_CODE = '23505';
type AuthUserProfile = Pick<
  User,
  'id' | 'email' | 'username' | 'createdAt' | 'updatedAt'
>;

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
  ): Promise<{ accessToken: string; user: AuthUserProfile }> {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const username = dto.username.trim();

    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        const created = await this.usersService.create(
          {
            email: normalizedEmail,
            passwordHash,
            username,
          },
          manager,
        );
        await this.walletService.createWalletForUser(created.id, 'USD', manager);
        return created;
      });
    } catch (error) {
      if (this.isDuplicateEmailError(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }

    return { accessToken: this.issueToken(user), user: this.sanitize(user) };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; user: AuthUserProfile }> {
    const user = await this.usersService.findByEmail(this.normalizeEmail(dto.email));
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

  private sanitize(user: User): AuthUserProfile {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...rest } = user;
    return rest;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isDuplicateEmailError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (error as QueryFailedError & {
      driverError?: { code?: string; detail?: string };
    }).driverError;

    return (
      driverError?.code === UNIQUE_VIOLATION_CODE &&
      (driverError.detail?.includes('(email)') ?? false)
    );
  }
}
