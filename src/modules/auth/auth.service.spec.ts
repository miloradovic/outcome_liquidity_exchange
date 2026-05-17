import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';

import { AuthService } from './auth.service';
import { AuthTokenRevocationService } from './auth-token-revocation.service';
import { UsersRegistrationService } from '../users/users-registration.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';

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
  role: UserRole.USER,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  normalizeEmail: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let authTokenRevocationService: jest.Mocked<AuthTokenRevocationService>;
  let usersService: jest.Mocked<UsersService>;
  let usersRegistrationService: jest.Mocked<UsersRegistrationService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: UsersRegistrationService,
          useValue: {
            registerWithWallet: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
            decode: jest.fn(),
          },
        },
        {
          provide: AuthTokenRevocationService,
          useValue: {
            revokeToken: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
    authTokenRevocationService = module.get(AuthTokenRevocationService);
    usersService = module.get(UsersService);
    usersRegistrationService = module.get(UsersRegistrationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('creates user and returns access token', async () => {
      usersRegistrationService.registerWithWallet.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'alice@demo.com',
        password: 'Password123!',
        username: 'alice',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('alice@demo.com');
      expect((result.user as Record<string, unknown>)['passwordHash']).toBeUndefined();
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(usersRegistrationService.registerWithWallet).toHaveBeenCalledWith({
        email: 'alice@demo.com',
        passwordHash: 'hashed-password',
        username: 'alice',
      });
    });

    it('throws ConflictException when email already exists', async () => {
      usersRegistrationService.registerWithWallet.mockRejectedValue(
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

      expect(usersRegistrationService.registerWithWallet).toHaveBeenCalledTimes(1);
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

  describe('logout', () => {
    it('revokes token using decoded expiry claim', async () => {
      jwtService.decode.mockReturnValue({ exp: 1_800_000_000 });

      await service.logout('jwt-token');

      expect(authTokenRevocationService.revokeToken).toHaveBeenCalledWith(
        'jwt-token',
        1_800_000_000,
      );
    });

    it('revokes token with null expiry when decode result is invalid', async () => {
      jwtService.decode.mockReturnValue('invalid-payload');

      await service.logout('jwt-token');

      expect(authTokenRevocationService.revokeToken).toHaveBeenCalledWith(
        'jwt-token',
        null,
      );
    });
  });
});
