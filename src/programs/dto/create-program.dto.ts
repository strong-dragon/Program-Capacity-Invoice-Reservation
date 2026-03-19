import { IsString, IsNotEmpty, Length, IsNumberString } from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsNumberString()
  @IsNotEmpty()
  totalCapacity: string;
}
