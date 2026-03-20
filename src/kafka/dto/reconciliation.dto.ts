import {
  IsString,
  IsNotEmpty,
  IsNumberString,
  IsArray,
  ValidateNested,
  IsIn,
  Length,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReconciliationReservation {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsNumberString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsIn(['active', 'released'])
  status: 'active' | 'released';
}

export class ReconciliationMessage {
  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsNumberString()
  @IsNotEmpty()
  totalCapacity: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconciliationReservation)
  reservations: ReconciliationReservation[];

  @IsDateString()
  timestamp: string;
}
