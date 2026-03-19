import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { CapacityService, ReserveResult } from '../capacity/capacity.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    private readonly capacityService: CapacityService,
  ) {}

  async create(
    programId: string,
    createReservationDto: CreateReservationDto,
  ): Promise<ReserveResult> {
    return this.capacityService.reserve(
      programId,
      createReservationDto.invoiceId,
      createReservationDto.amount,
      createReservationDto.currency,
    );
  }

  async release(reservationId: string) {
    return this.capacityService.release(reservationId);
  }

  async findOne(id: string): Promise<Reservation | null> {
    return this.reservationRepository.findOne({
      where: { id },
    });
  }

  async findByProgram(programId: string): Promise<Reservation[]> {
    return this.reservationRepository.find({
      where: { programId },
      order: { createdAt: 'DESC' },
    });
  }
}
