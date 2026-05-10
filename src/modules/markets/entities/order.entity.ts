import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { OutcomeSide } from '../enums/outcome-side.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { Market } from './market.entity';

@Entity('orders')
@Check('CHK_orders_price_range', 'price_cents >= 1 AND price_cents <= 99')
@Check('CHK_orders_quantity_positive', 'quantity > 0')
@Check('CHK_orders_reserved_non_negative', 'reserved_cents >= 0')
@Unique('UQ_orders_user_idempotency', ['userId', 'idempotencyKey'])
@Index('IDX_orders_market_status_created', ['marketId', 'status', 'createdAt'])
@Index('IDX_orders_user_created', ['userId', 'createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'market_id', type: 'uuid' })
  marketId!: string;

  @ManyToOne(() => Market, (market) => market.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'market_id' })
  market!: Market;

  @Column({ type: 'enum', enum: OutcomeSide })
  side!: OutcomeSide;

  @Column({ name: 'price_cents', type: 'int' })
  priceCents!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'reserved_cents', type: 'int' })
  reservedCents!: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.OPEN,
  })
  status!: OrderStatus;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
