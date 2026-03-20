import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import Decimal from 'decimal.js';
import { Program } from '../programs/entities/program.entity';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/entities/reservation.entity';
import { CurrencyService } from '../currency/currency.service';
import { InsufficientCapacityException } from '../common/exceptions/insufficient-capacity.exception';
import { ProgramNotFoundException } from '../common/exceptions/program-not-found.exception';
import { ReservationNotFoundException } from '../common/exceptions/reservation-not-found.exception';
import { ProgramInactiveException } from '../common/exceptions/program-inactive.exception';

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

  async getAvailability(
    programId: string,
    manager?: EntityManager,
  ): Promise<AvailabilityDto> {
    const programRepo = manager
      ? manager.getRepository(Program)
      : this.programRepository;
    const reservationRepo = manager
      ? manager.getRepository(Reservation)
      : this.reservationRepository;

    const program = await programRepo.findOne({ where: { id: programId } });
    if (!program) throw new ProgramNotFoundException(programId);

    const result = await reservationRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r."amountInProgramCurrency"::numeric), 0)', 'total')
      .where('r.programId = :programId', { programId })
      .andWhere('r.status = :status', { status: ReservationStatus.ACTIVE })
      .getRawOne<{ total: string }>();

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

      const program = await programRepo.findOne({
        where: { id: programId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!program) throw new ProgramNotFoundException(programId);
      if (!program.isActive) throw new ProgramInactiveException(programId);

      const existing = await reservationRepo
        .createQueryBuilder('r')
        .setLock('pessimistic_write')
        .where('r.invoiceId = :invoiceId', { invoiceId })
        .getOne();

      if (existing) {
        this.logger.log(`Reservation exists for invoice ${invoiceId}`);
        const availability = await this.getAvailability(
          existing.programId,
          manager,
        );
        return { reservation: existing, availability };
      }

      const amountInProgramCurrency = await this.currencyService.convert(
        amount,
        currency,
        program.currency,
      );

      const result = await reservationRepo
        .createQueryBuilder('r')
        .select(
          'COALESCE(SUM(r."amountInProgramCurrency"::numeric), 0)',
          'total',
        )
        .where('r.programId = :programId', { programId })
        .andWhere('r.status = :status', { status: ReservationStatus.ACTIVE })
        .getRawOne<{ total: string }>();

      const totalCapacity = new Decimal(program.totalCapacity);
      const currentReserved = new Decimal(result?.total ?? '0');
      const requestedAmount = new Decimal(amountInProgramCurrency);
      const availableCapacity = totalCapacity.minus(currentReserved);

      if (requestedAmount.greaterThan(availableCapacity)) {
        throw new InsufficientCapacityException(
          requestedAmount.toFixed(2),
          availableCapacity.toFixed(2),
          program.currency,
        );
      }

      const reservation = reservationRepo.create({
        invoiceId,
        amount,
        currency,
        amountInProgramCurrency,
        programId,
        status: ReservationStatus.ACTIVE,
      });

      try {
        await reservationRepo.save(reservation);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          this.logger.warn(
            `Duplicate invoice ${invoiceId}, returning existing`,
          );
          const existing = await reservationRepo.findOne({
            where: { invoiceId },
          });
          if (existing) {
            return {
              reservation: existing,
              availability: await this.getAvailability(
                existing.programId,
                manager,
              ),
            };
          }
        }
        throw error;
      }

      this.logger.log(
        `Created reservation ${reservation.id}: ${amount} ${currency}`,
      );

      return {
        reservation,
        availability: {
          programId,
          currency: program.currency,
          totalCapacity: totalCapacity.toFixed(2),
          reservedAmount: currentReserved.plus(requestedAmount).toFixed(2),
          availableAmount: availableCapacity.minus(requestedAmount).toFixed(2),
        },
      };
    });
  }

  async release(reservationId: string): Promise<AvailabilityDto> {
    return this.dataSource.transaction(async (manager) => {
      const reservationRepo = manager.getRepository(Reservation);

      const reservation = await reservationRepo.findOne({
        where: { id: reservationId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) throw new ReservationNotFoundException(reservationId);

      if (reservation.status === ReservationStatus.RELEASED) {
        return this.getAvailability(reservation.programId, manager);
      }

      reservation.status = ReservationStatus.RELEASED;
      await reservationRepo.save(reservation);

      this.logger.log(`Released reservation ${reservationId}`);

      return this.getAvailability(reservation.programId, manager);
    });
  }

  async updateProgramCapacity(
    programId: string,
    newCapacity: string,
  ): Promise<Program> {
    return this.dataSource.transaction(async (manager) => {
      const programRepo = manager.getRepository(Program);

      const program = await programRepo.findOne({
        where: { id: programId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!program) throw new ProgramNotFoundException(programId);

      program.totalCapacity = newCapacity;
      await programRepo.save(program);

      this.logger.log(
        `Updated program ${programId} capacity to ${newCapacity}`,
      );

      return program;
    });
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
    this.logger.log(`Reconciling program ${programId}`);

    await this.dataSource.transaction(async (manager) => {
      const programRepo = manager.getRepository(Program);
      const reservationRepo = manager.getRepository(Reservation);

      const program = await programRepo.findOne({
        where: { id: programId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!program) throw new ProgramNotFoundException(programId);

      program.totalCapacity = totalCapacity;
      await programRepo.save(program);

      const incomingInvoiceIds = reservations.map((r) => r.invoiceId);

      for (const res of reservations) {
        const amountInProgramCurrency = await this.currencyService.convert(
          res.amount,
          res.currency,
          program.currency,
        );

        await reservationRepo.upsert(
          {
            invoiceId: res.invoiceId,
            amount: res.amount,
            currency: res.currency,
            amountInProgramCurrency,
            programId,
            status:
              res.status === 'active'
                ? ReservationStatus.ACTIVE
                : ReservationStatus.RELEASED,
          },
          ['invoiceId'],
        );
      }

      if (incomingInvoiceIds.length > 0) {
        await reservationRepo
          .createQueryBuilder()
          .delete()
          .where('programId = :programId', { programId })
          .andWhere('invoiceId NOT IN (:...invoiceIds)', {
            invoiceIds: incomingInvoiceIds,
          })
          .execute();
      } else {
        await reservationRepo.delete({ programId });
      }

      this.logger.log(
        `Reconciled: capacity=${totalCapacity}, reservations=${reservations.length}`,
      );
    });
  }
}
