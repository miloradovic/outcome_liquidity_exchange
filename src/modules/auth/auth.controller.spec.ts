import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';

const mockUser: User = {
  id: 'user-uuid-1',
  email: 'alice@demo.com',
  passwordHash: 'hashed-password',
  username: 'alice',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  normalizeEmail: jest.fn(),
};

const mockAuthResponse = {
  accessToken: 'mock-token',
  user: {
    id: mockUser.id,
    email: mockUser.email,
    username: mockUser.username,
    createdAt: mockUser.createdAt,
    updatedAt: mockUser.updatedAt,
  },
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
  });

  describe('POST /auth/register', () => {
    it('delegates to AuthService and returns result', async () => {
      authService.register.mockResolvedValue(mockAuthResponse);
      const dto: RegisterDto = {
        email: 'alice@demo.com',
        password: 'Password123!',
        username: 'alice',
      };

      const result = await controller.register(dto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /auth/login', () => {
    it('delegates to AuthService and returns result', async () => {
      authService.login.mockResolvedValue(mockAuthResponse);
      const dto: LoginDto = { email: 'alice@demo.com', password: 'Password123!' };

      const result = await controller.login(dto);

      expect(result).toEqual(mockAuthResponse);
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('GET /auth/me', () => {
    it('returns user profile without passwordHash', () => {
      const result = controller.getMe(mockUser);

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect((result as Record<string, unknown>)['passwordHash']).toBeUndefined();
    });
  });

  describe('POST /auth/logout', () => {
    it('delegates to AuthService and returns success payload', async () => {
      authService.logout.mockResolvedValue();

      const result = await controller.logout({
        headers: { authorization: 'Bearer mock-token' },
      } as never);

      expect(result).toEqual({ success: true });
      expect(authService.logout).toHaveBeenCalledWith('mock-token');
    });

    it('throws UnauthorizedException when bearer token is missing', async () => {
      await expect(
        controller.logout({ headers: {} } as never),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
