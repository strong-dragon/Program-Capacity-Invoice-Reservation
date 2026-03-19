import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientCapacityException extends HttpException {
  constructor(
    programId: string,
    requested: string,
    available: string,
    currency: string,
  ) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Insufficient Capacity',
        message: `Insufficient capacity for program ${programId}. Requested: ${requested} ${currency}, Available: ${available} ${currency}`,
        details: {
          programId,
          requested,
          available,
          currency,
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
