import { IsString, IsNotEmpty, IsNumberString, Length } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsNumberString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @Length(3, 3)
  currency: string;
}
