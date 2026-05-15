import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { MarketStatus } from '../enums/market-status.enum';
import { OutcomeSide } from '../enums/outcome-side.enum';
import { Outcome } from './outcome.entity';
import { Order } from './order.entity';
import { Trade } from './trade.entity';

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

  @Column({
    name: 'resolved_outcome',
    type: 'enum',
    enum: OutcomeSide,
    enumName: 'outcomes_side_enum',
    nullable: true,
  })
  resolvedOutcome!: OutcomeSide | null;

  @OneToMany(() => Outcome, (outcome) => outcome.market, { cascade: true })
  outcomes!: Outcome[];

  @OneToMany(() => Order, (order) => order.market)
  orders!: Order[];

  @OneToMany(() => Trade, (trade) => trade.market)
  trades!: Trade[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
