import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { Program } from './entities/program.entity';
import { CapacityModule } from '../capacity/capacity.module';

@Module({
  imports: [TypeOrmModule.forFeature([Program]), CapacityModule],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
