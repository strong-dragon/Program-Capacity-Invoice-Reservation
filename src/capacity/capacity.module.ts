import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapacityService } from './capacity.service';
import { Program } from '../programs/entities/program.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Program, Reservation]),
    CurrencyModule,
  ],
  providers: [CapacityService],
  exports: [CapacityService],
})
export class CapacityModule {}
