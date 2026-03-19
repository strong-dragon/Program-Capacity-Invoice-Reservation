import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { Program } from '../programs/entities/program.entity';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/entities/reservation.entity';
import { CurrencyService } from '../currency/currency.service';
import { InsufficientCapacityException } from '../common/exceptions/insufficient-capacity.exception';
import { ProgramNotFoundException } from '../common/exceptions/program-not-found.exception';

export interface AvailabilityDto {
  programId: string;
  currency: string;
  totalCapacity: string;
  reservedAmount: string;
  availableAmount: string;
}

export interface ReserveResult {
  reservation: Reservation;
  availability: AvailabilityDto;
}

@Injectable()
export class CapacityService {
  private readonly logger = new Logger(CapacityService.name);

  constructor(
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly currencyService: CurrencyService,
    private readonly dataSource: DataSource,
  ) {}

  async getAvailability(programId: string): Promise<AvailabilityDto> {
    const program = await this.programRepository.findOne({
      where: { id: programId },
    });

    if (!program) {
      throw new ProgramNotFoundException(programId);
    }

    const result = await this.reservationRepository
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r."amountInProgramCurrency"::numeric), 0)', 'total')
      .where('r.programId = :programId', { programId })
      .andWhere('r.status = :status', { status: ReservationStatus.ACTIVE })
      .getRawOne();

    const total = new Decimal(program.totalCapacity);
    const reserved = new Decimal(result?.total ?? '0');

    return {
      programId,
      currency: program.currency,
      totalCapacity: total.toFixed(2),
      reservedAmount: reserved.toFixed(2),
      availableAmount: total.minus(reserved).toFixed(2),
    };
  }

  async reserve(
    programId: string,
    invoiceId: string,
    amount: string,
    currency: string,
  ): Promise<ReserveResult> {
    return this.dataSource.transaction(async (manager) => {
      const programRepo = manager.getRepository(Program);
      const reservationRepo = manager.getRepository(Reservation);

      // Check for existing reservation (idempotency)
      const existing = await reservationRepo.findOne({
        where: { invoiceId },
      });

      if (existing) {
        this.logger.log(
          `Reservation already exists for invoice ${invoiceId}, returning existing`,
        );
        const availability = await this.getAvailability(programId);
        return { reservation: existing, availability };
      }

      // Get program with lock
      const program = await programRepo.findOne({
        where: { id: programId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!program) {
        throw new ProgramNotFoundException(programId);
      }

      // Convert amount to program currency
      const amountInProgramCurrency = await this.currencyService.convert(
        amount,
        currency,
        program.currency,
      );

      // Calculate current reserved amount
      const result = await reservationRepo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r."amountInProgramCurrency"::numeric), 0)', 'total')
        .where('r.programId = :programId', { programId })
        .andWhere('r.status = :status', { status: ReservationStatus.ACTIVE })
        .getRawOne();

      const totalCapacity = new Decimal(program.totalCapacity);
      const currentReserved = new Decimal(result?.total ?? '0');
      const requestedAmount = new Decimal(amountInProgramCurrency);
      const availableCapacity = totalCapacity.minus(currentReserved);

      // Check capacity
      if (requestedAmount.greaterThan(availableCapacity)) {
        throw new InsufficientCapacityException(
          programId,
          requestedAmount.toFixed(2),
          availableCapacity.toFixed(2),
          program.currency,
        );
      }

      // Create reservation
      const reservation = reservationRepo.create({
        invoiceId,
        amount,
        currency,
        amountInProgramCurrency,
        programId,
        status: ReservationStatus.ACTIVE,
      });

      await reservationRepo.save(reservation);

      this.logger.log(
        `Created reservation ${reservation.id} for invoice ${invoiceId}: ${amount} ${currency} (${amountInProgramCurrency} ${program.currency})`,
      );

      const availability: AvailabilityDto = {
        programId,
        currency: program.currency,
        totalCapacity: totalCapacity.toFixed(2),
        reservedAmount: currentReserved.plus(requestedAmount).toFixed(2),
        availableAmount: availableCapacity.minus(requestedAmount).toFixed(2),
      };

      return { reservation, availability };
    });
  }

  async release(reservationId: string): Promise<AvailabilityDto> {
    return this.dataSource.transaction(async (manager) => {
      const reservationRepo = manager.getRepository(Reservation);

      const reservation = await reservationRepo.findOne({
        where: { id: reservationId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new ProgramNotFoundException(
          `Reservation ${reservationId} not found`,
        );
      }

      // Idempotent: if already released, just return current availability
      if (reservation.status === ReservationStatus.RELEASED) {
        this.logger.log(
          `Reservation ${reservationId} already released, returning current availability`,
        );
        return this.getAvailability(reservation.programId);
      }

      reservation.status = ReservationStatus.RELEASED;
      await reservationRepo.save(reservation);

      this.logger.log(
        `Released reservation ${reservationId} for invoice ${reservation.invoiceId}`,
      );

      return this.getAvailability(reservation.programId);
    });
  }

  async updateProgramCapacity(
    programId: string,
    newCapacity: string,
  ): Promise<Program> {
    const program = await this.programRepository.findOne({
      where: { id: programId },
    });

    if (!program) {
      throw new ProgramNotFoundException(programId);
    }

    program.totalCapacity = newCapacity;
    await this.programRepository.save(program);

    this.logger.log(
      `Updated program ${programId} capacity to ${newCapacity} ${program.currency}`,
    );

    return program;
  }

  async reconcile(
    programId: string,
    totalCapacity: string,
    reservations: Array<{
      invoiceId: string;
      amount: string;
      currency: string;
      status: 'active' | 'released';
    }>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const programRepo = manager.getRepository(Program);
      const reservationRepo = manager.getRepository(Reservation);

      const program = await programRepo.findOne({
        where: { id: programId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!program) {
        throw new ProgramNotFoundException(programId);
      }

      // Update program capacity
      program.totalCapacity = totalCapacity;
      await programRepo.save(program);

      // Delete existing reservations for this program
      await reservationRepo.delete({ programId });

      // Insert new reservations
      for (const res of reservations) {
        const amountInProgramCurrency = await this.currencyService.convert(
          res.amount,
          res.currency,
          program.currency,
        );

        const reservation = reservationRepo.create({
          invoiceId: res.invoiceId,
          amount: res.amount,
          currency: res.currency,
          amountInProgramCurrency,
          programId,
          status:
            res.status === 'active'
              ? ReservationStatus.ACTIVE
              : ReservationStatus.RELEASED,
        });

        await reservationRepo.save(reservation);
      }

      this.logger.log(
        `Reconciled program ${programId}: capacity=${totalCapacity}, reservations=${reservations.length}`,
      );
    });
  }
}
