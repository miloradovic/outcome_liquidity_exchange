import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { OutcomeSide } from '../enums/outcome-side.enum';
import { Market } from './market.entity';

@Entity('outcomes')
export class Outcome {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Market, (market) => market.outcomes)
  @JoinColumn({ name: 'market_id' })
  market!: Market;

  @Column({ type: 'enum', enum: OutcomeSide })
  side!: OutcomeSide;
}
