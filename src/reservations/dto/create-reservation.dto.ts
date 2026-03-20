import { IsString, IsNotEmpty, IsNumberString, Length } from 'class-validator';
import { IsPositiveDecimal } from '../../common/validators/positive-decimal.validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsNumberString()
  @IsNotEmpty()
  @IsPositiveDecimal({
    message: 'amount must be a positive number greater than zero',
  })
  amount: string;

  @IsString()
  @Length(3, 3)
  currency: string;
}
