import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { CapacityService } from '../capacity/capacity.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('programs')
@UseGuards(JwtAuthGuard)
export class ProgramsController {
  constructor(
    private readonly programsService: ProgramsService,
    private readonly capacityService: CapacityService,
  ) {}

  @Post()
  async create(@Body() createProgramDto: CreateProgramDto) {
    return this.programsService.create(createProgramDto);
  }

  @Get()
  async findAll() {
    return this.programsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.programsService.findOne(id);
  }

  @Get(':id/availability')
  async getAvailability(@Param('id', ParseUUIDPipe) id: string) {
    return this.capacityService.getAvailability(id);
  }
}
