import { NotFoundException } from '@nestjs/common';

export class ReservationNotFoundException extends NotFoundException {
  constructor(reservationId: string) {
    super(`Reservation ${reservationId} not found`);
  }
}
