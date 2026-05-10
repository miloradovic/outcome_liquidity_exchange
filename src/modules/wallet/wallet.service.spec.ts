import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';

import { WalletEntry } from './entities/wallet-entry.entity';
import { Wallet } from './entities/wallet.entity';
import { WalletService } from './wallet.service';

const baseWallet: Wallet = {
  id: 'wallet-1',
  userId: 'user-1',
  currencyCode: 'USD',
  availableBalanceCents: 1_000,
  reservedBalanceCents: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  user: {} as never,
};

describe('WalletService', () => {
  let service: WalletService;
  let walletRepo: jest.Mocked<Repository<Wallet>>;
  let walletEntryRepo: jest.Mocked<Repository<WalletEntry>>;
  let dataSource: { transaction: jest.Mock };
  let txWalletState: Wallet;

  beforeEach(async () => {
    txWalletState = { ...baseWallet };

    const txWalletRepo = {
      findOne: jest.fn(async () => txWalletState),
      save: jest.fn(async (wallet: Wallet) => ({ ...wallet })),
      create: jest.fn((wallet: Partial<Wallet>) => wallet),
    };

    const txEntryRepo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async (entry: WalletEntry) => entry),
      create: jest.fn((entry: Partial<WalletEntry>) => entry),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Wallet) {
              return txWalletRepo;
            }
            if (entity === WalletEntry) {
              return txEntryRepo;
            }
            throw new Error('Unknown entity');
          },
        };

        return cb(manager);
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WalletEntry),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WalletService);
    walletRepo = module.get(getRepositoryToken(Wallet));
    walletEntryRepo = module.get(getRepositoryToken(WalletEntry));
  });

  afterEach(() => jest.clearAllMocks());

  it('creates wallet for user when missing', async () => {
    walletRepo.findOne.mockResolvedValue(null);
    walletRepo.create.mockImplementation((input) => input as Wallet);
    walletRepo.save.mockImplementation(async (input) => input as Wallet);

    const result = await service.createWalletForUser('user-new');

    expect(result.userId).toBe('user-new');
    expect(result.currencyCode).toBe('USD');
    expect(walletRepo.save).toHaveBeenCalled();
  });

  it('returns wallet by user id', async () => {
    walletRepo.findOne.mockResolvedValue(baseWallet);

    const wallet = await service.getWalletByUserId(baseWallet.userId);
    expect(wallet.id).toBe(baseWallet.id);
  });

  it('throws when wallet is missing', async () => {
    walletRepo.findOne.mockResolvedValue(null);

    await expect(service.getWalletByUserId('missing')).rejects.toThrow(NotFoundException);
  });

  it('deposits funds and increases available balance', async () => {
    const wallet = await service.deposit('user-1', 250, 'dep-000001');

    expect(wallet.availableBalanceCents).toBe(1_250);
    expect(wallet.reservedBalanceCents).toBe(0);
  });

  it('reserves funds and blocks overspending', async () => {
    const reserved = await service.reserve('user-1', 300, 'res-000001', 'order-1');
    expect(reserved.availableBalanceCents).toBe(700);
    expect(reserved.reservedBalanceCents).toBe(300);

    await expect(
      service.reserve('user-1', 5_000, 'res-000002', 'order-2'),
    ).rejects.toThrow(BadRequestException);
  });

  it('replays idempotent key without applying mutation twice', async () => {
    dataSource.transaction.mockImplementationOnce(async (cb: (manager: unknown) => unknown) => {
      const txWalletRepo = {
        findOne: jest.fn(async () => txWalletState),
        save: jest.fn(async (wallet: Wallet) => ({ ...wallet })),
      };
      const txEntryRepo = {
        findOne: jest.fn(async () => ({
          id: 'entry-1',
          walletId: 'wallet-1',
          idempotencyKey: 'dup-000001',
        })),
        create: jest.fn(),
        save: jest.fn(),
      };

      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Wallet) {
            return txWalletRepo;
          }
          return txEntryRepo;
        },
      };

      return cb(manager);
    });

    const wallet = await service.deposit('user-1', 100, 'dup-000001');
    expect(wallet.availableBalanceCents).toBe(1_000);
  });

  it('lists wallet entries newest first', async () => {
    walletRepo.findOne.mockResolvedValue(baseWallet);
    walletEntryRepo.find.mockResolvedValue([
      {
        id: 'entry-2',
      } as WalletEntry,
      {
        id: 'entry-1',
      } as WalletEntry,
    ]);

    const entries = await service.getEntriesForUser('user-1');
    expect(entries).toHaveLength(2);
    expect(walletEntryRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletId: 'wallet-1' },
        take: 100,
      }),
    );
  });
});