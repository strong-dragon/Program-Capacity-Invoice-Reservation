import { BadRequestException } from '@nestjs/common';

export class ProgramInactiveException extends BadRequestException {
  constructor(id: string) {
    super(`Program ${id} is inactive`);
  }
}
