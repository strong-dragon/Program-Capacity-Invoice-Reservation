import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Program } from '../../programs/entities/program.entity';

export enum ReservationStatus {
  ACTIVE = 'active',
  RELEASED = 'released',
}

@Entity('reservations')
@Unique(['invoiceId'])
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoiceId: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: string;

  @Column({ length: 3 })
  currency: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amountInProgramCurrency: string;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.ACTIVE,
  })
  status: ReservationStatus;

  @ManyToOne(() => Program, (program) => program.reservations)
  @JoinColumn({ name: 'programId' })
  program: Program;

  @Column()
  programId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
