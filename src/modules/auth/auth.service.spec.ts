import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource, QueryFailedError } from 'typeorm';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockUser: User = {
  id: 'user-uuid-1',
  email: 'alice@demo.com',
  passwordHash: 'hashed-password',
  username: 'alice',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  normalizeEmail: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let walletService: jest.Mocked<WalletService>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: WalletService,
          useValue: {
            createWalletForUser: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-jwt-token') },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
              cb({ getRepository: jest.fn() }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    walletService = module.get(WalletService);
    dataSource = module.get(DataSource);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('creates user and returns access token', async () => {
      usersService.create.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'alice@demo.com',
        password: 'Password123!',
        username: 'alice',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('alice@demo.com');
      expect((result.user as Record<string, unknown>)['passwordHash']).toBeUndefined();
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(walletService.createWalletForUser).toHaveBeenCalledWith(
        mockUser.id,
        'USD',
        expect.anything(),
      );
    });

    it('throws ConflictException when email already exists', async () => {
      usersService.create.mockRejectedValue(
        new QueryFailedError('INSERT INTO users (...)', [], {
          code: '23505',
          detail: 'Key (email)=(alice@demo.com) already exists.',
        } as Error & { code: string; detail: string }),
      );

      await expect(
        service.register({
          email: 'alice@demo.com',
          password: 'Password123!',
          username: 'alice',
        }),
      ).rejects.toThrow(ConflictException);

      expect(usersService.create).toHaveBeenCalledTimes(1);
      expect(walletService.createWalletForUser).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns access token on valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'alice@demo.com',
        password: 'Password123!',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('alice@demo.com');
    });

    it('throws UnauthorizedException when user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@demo.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'alice@demo.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
