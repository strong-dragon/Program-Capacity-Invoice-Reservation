import { ReservationStatus } from '../entities/reservation.entity';

export class ReservationResponseDto {
  id: string;
  invoiceId: string;
  amount: string;
  currency: string;
  amountInProgramCurrency: string;
  status: ReservationStatus;
  programId: string;
  createdAt: Date;
}
