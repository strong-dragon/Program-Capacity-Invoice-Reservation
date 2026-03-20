import { UnprocessableEntityException } from '@nestjs/common';

export class InsufficientCapacityException extends UnprocessableEntityException {
  constructor(requested: string, available: string, currency: string) {
    super(
      `Not enough capacity. Requested: ${requested} ${currency}, available: ${available} ${currency}`,
    );
  }
}
