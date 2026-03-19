import { Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { CapacityModule } from '../capacity/capacity.module';

@Module({
  imports: [CapacityModule],
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}
