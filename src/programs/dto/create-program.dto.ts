import { IsString, IsNotEmpty, Length, IsNumberString } from 'class-validator';
import { IsPositiveDecimal } from '../../common/validators/positive-decimal.validator';

export class CreateProgramDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsNumberString()
  @IsNotEmpty()
  @IsPositiveDecimal({
    message: 'totalCapacity must be a positive number greater than zero',
  })
  totalCapacity: string;
}
