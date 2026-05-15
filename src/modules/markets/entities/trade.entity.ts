import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Order } from './order.entity';
import { Market } from './market.entity';
import { TradeStatus } from '../enums/trade-status.enum';

@Entity('trades')
@Check('CHK_trades_complementary_price', 'yes_price_cents + no_price_cents = 100')
@Check('CHK_trades_quantity_positive', 'quantity > 0')
@Unique('UQ_trades_yes_order', ['yesOrderId'])
@Unique('UQ_trades_no_order', ['noOrderId'])
@Index('IDX_trades_market_status_created', ['marketId', 'status', 'createdAt'])
export class Trade {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'market_id', type: 'uuid' })
  marketId!: string;

  @ManyToOne(() => Market, (market) => market.trades, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'market_id' })
  market!: Market;

  @Column({ name: 'yes_order_id', type: 'uuid' })
  yesOrderId!: string;

  @OneToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'yes_order_id' })
  yesOrder!: Order;

  @Column({ name: 'no_order_id', type: 'uuid' })
  noOrderId!: string;

  @OneToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'no_order_id' })
  noOrder!: Order;

  @Column({ name: 'yes_price_cents', type: 'int' })
  yesPriceCents!: number;

  @Column({ name: 'no_price_cents', type: 'int' })
  noPriceCents!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: TradeStatus,
    default: TradeStatus.PENDING_SETTLEMENT,
  })
  status!: TradeStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
