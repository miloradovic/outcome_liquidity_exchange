import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

@Entity('wallets')
@Check('CHK_wallets_available_non_negative', 'available_balance_cents >= 0')
@Check('CHK_wallets_reserved_non_negative', 'reserved_balance_cents >= 0')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'currency_code', length: 10, default: 'USD' })
  currencyCode!: string;

  @Column({ name: 'available_balance_cents', type: 'int', default: 0 })
  availableBalanceCents!: number;

  @Column({ name: 'reserved_balance_cents', type: 'int', default: 0 })
  reservedBalanceCents!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}