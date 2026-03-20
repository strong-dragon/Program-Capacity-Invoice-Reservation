import {
  IsString,
  IsNotEmpty,
  IsNumberString,
  Length,
  IsDateString,
} from 'class-validator';

export class CapacityUpdateMessage {
  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsNumberString()
  @IsNotEmpty()
  newTotalCapacity: string;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsDateString()
  timestamp: string;
}
