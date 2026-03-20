import { NotFoundException } from '@nestjs/common';

export class ReservationNotFoundException extends NotFoundException {
  constructor(id: string) {
    super(`Reservation ${id} not found`);
  }
}
