import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { WalletEntryType } from '../enums/wallet-entry-type.enum';
import { WalletReferenceType } from '../enums/wallet-reference-type.enum';
import { Wallet } from './wallet.entity';

@Entity('wallet_entries')
@Unique('UQ_wallet_entries_wallet_idempotency', ['walletId', 'idempotencyKey'])
@Index('IDX_wallet_entries_wallet_created', ['walletId', 'createdAt'])
export class WalletEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => Wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @Column({
    name: 'entry_type',
    type: 'enum',
    enum: WalletEntryType,
  })
  entryType!: WalletEntryType;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({
    name: 'reference_type',
    type: 'enum',
    enum: WalletReferenceType,
  })
  referenceType!: WalletReferenceType;

  @Column({ name: 'reference_id', length: 255 })
  referenceId!: string;

  @Column({ name: 'idempotency_key', length: 100 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}