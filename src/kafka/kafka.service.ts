import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CapacityService } from '../capacity/capacity.service';
import { CapacityUpdateMessage } from './dto/capacity-update.dto';
import { ReconciliationMessage } from './dto/reconciliation.dto';

const TOPICS = {
  CAPACITY_UPDATE: 'capacity.update',
  RECONCILIATION: 'capacity.reconciliation',
} as const;

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private consumer: Consumer;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly capacityService: CapacityService,
  ) {
    const brokers = this.configService.get<string[]>('kafka.brokers') ?? [
      'localhost:9092',
    ];
    const groupId =
      this.configService.get<string>('kafka.groupId') ?? 'capacity-service';

    const kafka = new Kafka({ clientId: 'capacity-service', brokers });
    this.consumer = kafka.consumer({ groupId });
  }

  async onModuleInit() {
    try {
      await this.consumer.connect();
      this.isConnected = true;

      await this.consumer.subscribe({
        topics: [TOPICS.CAPACITY_UPDATE, TOPICS.RECONCILIATION],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: (payload) => this.handleMessage(payload),
      });

      this.logger.log('Kafka connected');
    } catch {
      this.logger.warn('Kafka unavailable, continuing without it');
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.consumer.disconnect();
    }
  }

  private async handleMessage({ topic, message }: EachMessagePayload) {
    if (!message.value) return;

    try {
      const raw: unknown = JSON.parse(message.value.toString());

      if (topic === TOPICS.CAPACITY_UPDATE) {
        const msg = await this.validateMessage(CapacityUpdateMessage, raw);
        await this.capacityService.updateProgramCapacity(
          msg.programId,
          msg.newTotalCapacity,
        );
      } else if (topic === TOPICS.RECONCILIATION) {
        const msg = await this.validateMessage(ReconciliationMessage, raw);
        await this.capacityService.reconcile(
          msg.programId,
          msg.totalCapacity,
          msg.reservations,
        );
      }
    } catch (error) {
      this.logger.error(
        `Message processing failed on topic ${topic}: ${(error as Error).message}`,
        { topic, value: message.value?.toString().slice(0, 500) },
      );
    }
  }

  private async validateMessage<T extends object>(
    cls: new () => T,
    raw: unknown,
  ): Promise<T> {
    const instance = plainToInstance(cls, raw);
    const errors = await validate(instance);

    if (errors.length > 0) {
      const msgs = errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('; ');
      throw new Error(`Validation failed: ${msgs}`);
    }

    return instance;
  }
}
