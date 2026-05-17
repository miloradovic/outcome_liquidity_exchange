import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

const mockUser: User = {
  id: 'user-uuid-1',
  email: 'alice@demo.com',
  passwordHash: '$2b$10$hashed',
  username: 'alice',
  role: UserRole.USER,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;
  let queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
            findOne: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  describe('findByEmail', () => {
    it('returns user when found', async () => {
      queryBuilder.getOne.mockResolvedValue(mockUser);
      const result = await service.findByEmail('alice@demo.com');

      expect(result).toEqual(mockUser);
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'user.email = :email',
        { email: 'alice@demo.com' },
      );
    });

    it('normalizes email before query', async () => {
      queryBuilder.getOne.mockResolvedValue(mockUser);

      await service.findByEmail('  ALICE@DEMO.COM  ');

      expect(queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
        email: 'alice@demo.com',
      });
    });

    it('returns null when not found', async () => {
      queryBuilder.getOne.mockResolvedValue(null);
      const result = await service.findByEmail('notfound@demo.com');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById('user-uuid-1');
      expect(result).toEqual(mockUser);
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('existsByEmail', () => {
    it('returns true when email exists', async () => {
      repo.count.mockResolvedValue(1);
      expect(await service.existsByEmail('alice@demo.com')).toBe(true);
    });

    it('returns false when email does not exist', async () => {
      repo.count.mockResolvedValue(0);
      expect(await service.existsByEmail('new@demo.com')).toBe(false);
    });
  });

  describe('create', () => {
    it('creates and saves a new user', async () => {
      const input = {
        email: 'bob@demo.com',
        passwordHash: '$2b$10$hashed',
        username: 'bob',
      };
      repo.create.mockReturnValue({ ...mockUser, ...input });
      repo.save.mockResolvedValue({ ...mockUser, ...input });

      const result = await service.create(input);
      expect(repo.create).toHaveBeenCalledWith(input);
      expect(repo.save).toHaveBeenCalled();
      expect(result.email).toBe('bob@demo.com');
    });
  });
});
