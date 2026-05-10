import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { MarketStatus } from '../enums/market-status.enum';
import { Outcome } from './outcome.entity';

@Entity('markets')
export class Market {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 100 })
  slug!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'enum', enum: MarketStatus, default: MarketStatus.OPEN })
  status!: MarketStatus;

  @Column({ name: 'closes_at', type: 'timestamptz', nullable: true })
  closesAt!: Date | null;

  @OneToMany(() => Outcome, (outcome) => outcome.market, { cascade: true })
  outcomes!: Outcome[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
