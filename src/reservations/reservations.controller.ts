import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('programs/:programId/reservations')
  async create(
    @Param('programId', ParseUUIDPipe) programId: string,
    @Body() createReservationDto: CreateReservationDto,
  ) {
    return this.reservationsService.create(programId, createReservationDto);
  }

  @Get('programs/:programId/reservations')
  async findByProgram(@Param('programId', ParseUUIDPipe) programId: string) {
    return this.reservationsService.findByProgram(programId);
  }

  @Get('reservations/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.findOne(id);
  }

  @Delete('reservations/:id')
  async release(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.release(id);
  }
}
