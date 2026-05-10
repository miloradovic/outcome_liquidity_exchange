import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { WalletEntryType } from './enums/wallet-entry-type.enum';
import { WalletReferenceType } from './enums/wallet-reference-type.enum';
import { WalletEntry } from './entities/wallet-entry.entity';
import { Wallet } from './entities/wallet.entity';

type MutationResult = {
  wallet: Wallet;
  idempotentReplay: boolean;
};

@Injectable()
export class WalletService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletEntry)
    private readonly walletEntryRepository: Repository<WalletEntry>,
  ) {}

  async createWalletForUser(
    userId: string,
    currencyCode = 'USD',
    manager?: EntityManager,
  ): Promise<Wallet> {
    const walletRepo = manager ? manager.getRepository(Wallet) : this.walletRepository;
    const existing = await walletRepo.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }

    const wallet = walletRepo.create({
      userId,
      currencyCode,
      availableBalanceCents: 0,
      reservedBalanceCents: 0,
    });
    return walletRepo.save(wallet);
  }

  async getWalletByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found for user');
    }

    return wallet;
  }

  async getEntriesForUser(userId: string): Promise<WalletEntry[]> {
    const wallet = await this.getWalletByUserId(userId);
    return this.walletEntryRepository.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async deposit(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const mutation = await this.mutateWallet({
      userId,
      amountCents,
      idempotencyKey,
      entryType: WalletEntryType.DEPOSIT,
      referenceType: WalletReferenceType.MANUAL_DEPOSIT,
      referenceId: idempotencyKey,
      apply: (wallet, amount) => {
        wallet.availableBalanceCents += amount;
      },
      manager,
    });
    return mutation.wallet;
  }

  async reserve(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    referenceId: string,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const mutation = await this.mutateWallet({
      userId,
      amountCents,
      idempotencyKey,
      entryType: WalletEntryType.RESERVE,
      referenceType: WalletReferenceType.ORDER,
      referenceId,
      apply: (wallet, amount) => {
        if (wallet.availableBalanceCents < amount) {
          throw new BadRequestException('Insufficient available balance');
        }
        wallet.availableBalanceCents -= amount;
        wallet.reservedBalanceCents += amount;
      },
      manager,
    });
    return mutation.wallet;
  }

  async release(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    referenceId: string,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const mutation = await this.mutateWallet({
      userId,
      amountCents,
      idempotencyKey,
      entryType: WalletEntryType.RELEASE,
      referenceType: WalletReferenceType.ORDER,
      referenceId,
      apply: (wallet, amount) => {
        if (wallet.reservedBalanceCents < amount) {
          throw new BadRequestException('Insufficient reserved balance');
        }
        wallet.reservedBalanceCents -= amount;
        wallet.availableBalanceCents += amount;
      },
      manager,
    });
    return mutation.wallet;
  }

  async settleDebit(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    referenceId: string,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const mutation = await this.mutateWallet({
      userId,
      amountCents,
      idempotencyKey,
      entryType: WalletEntryType.SETTLE_DEBIT,
      referenceType: WalletReferenceType.TRADE,
      referenceId,
      apply: (wallet, amount) => {
        if (wallet.reservedBalanceCents < amount) {
          throw new BadRequestException('Insufficient reserved balance');
        }
        wallet.reservedBalanceCents -= amount;
      },
      manager,
    });
    return mutation.wallet;
  }

  async settleCredit(
    userId: string,
    amountCents: number,
    idempotencyKey: string,
    referenceId: string,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const mutation = await this.mutateWallet({
      userId,
      amountCents,
      idempotencyKey,
      entryType: WalletEntryType.SETTLE_CREDIT,
      referenceType: WalletReferenceType.TRADE,
      referenceId,
      apply: (wallet, amount) => {
        wallet.availableBalanceCents += amount;
      },
      manager,
    });
    return mutation.wallet;
  }

  private async mutateWallet(params: {
    userId: string;
    amountCents: number;
    idempotencyKey: string;
    entryType: WalletEntryType;
    referenceType: WalletReferenceType;
    referenceId: string;
    apply: (wallet: Wallet, amountCents: number) => void;
    manager?: EntityManager;
  }): Promise<MutationResult> {
    this.assertPositiveAmount(params.amountCents);
    this.assertIdempotencyKey(params.idempotencyKey);

    const runMutation = async (manager: EntityManager): Promise<MutationResult> => {
      const walletRepo = manager.getRepository(Wallet);
      const entryRepo = manager.getRepository(WalletEntry);

      const wallet = await walletRepo.findOne({
        where: { userId: params.userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found for user');
      }

      const existing = await entryRepo.findOne({
        where: {
          walletId: wallet.id,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existing) {
        return { wallet, idempotentReplay: true };
      }

      params.apply(wallet, params.amountCents);
      this.assertNonNegative(wallet);

      const savedWallet = await walletRepo.save(wallet);
      const entry = entryRepo.create({
        walletId: savedWallet.id,
        entryType: params.entryType,
        amountCents: params.amountCents,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        idempotencyKey: params.idempotencyKey,
      });
      await entryRepo.save(entry);

      return { wallet: savedWallet, idempotentReplay: false };
    };

    if (params.manager) {
      return runMutation(params.manager);
    }

    return this.dataSource.transaction(async (manager) => runMutation(manager));
  }

  private assertPositiveAmount(amountCents: number): void {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be a positive integer in cents');
    }
  }

  private assertIdempotencyKey(idempotencyKey: string): void {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestException('Idempotency key must be at least 8 characters');
    }
  }

  private assertNonNegative(wallet: Wallet): void {
    if (wallet.availableBalanceCents < 0 || wallet.reservedBalanceCents < 0) {
      throw new BadRequestException('Wallet balances cannot be negative');
    }
  }
}