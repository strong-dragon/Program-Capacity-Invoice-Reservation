import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('exchange_rates')
@Unique(['fromCurrency', 'toCurrency'])
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 3 })
  fromCurrency: string;

  @Column({ length: 3 })
  toCurrency: string;

  @Column('decimal', { precision: 18, scale: 6 })
  rate: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
