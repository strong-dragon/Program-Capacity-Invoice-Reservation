import { NotFoundException } from '@nestjs/common';

export class ProgramNotFoundException extends NotFoundException {
  constructor(id: string) {
    super(`Program ${id} not found`);
  }
}
