import { NotFoundException } from '@nestjs/common';

export class ProgramNotFoundException extends NotFoundException {
  constructor(programId: string) {
    super(`Program with ID ${programId} not found`);
  }
}
