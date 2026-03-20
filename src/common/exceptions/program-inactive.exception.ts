import { BadRequestException } from '@nestjs/common';

export class ProgramInactiveException extends BadRequestException {
  constructor(programId: string) {
    super(`Program ${programId} is inactive and cannot accept reservations`);
  }
}
