import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { CapacityService } from '../capacity/capacity.service';
import { CapacityUpdateMessage } from './dto/capacity-update.dto';
import { ReconciliationMessage } from './dto/reconciliation.dto';

const TOPICS = {
  CAPACITY_UPDATE: 'capacity.update',
  RECONCILIATION: 'capacity.reconciliation',
};

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
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

    this.kafka = new Kafka({
      clientId: 'capacity-service',
      brokers,
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });

    this.consumer = this.kafka.consumer({ groupId });
  }

  async onModuleInit() {
    try {
      await this.connect();
    } catch (error) {
      this.logger.warn(
        'Failed to connect to Kafka. Service will continue without Kafka.',
        error,
      );
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      await this.consumer.connect();
      this.isConnected = true;
      this.logger.log('Connected to Kafka');

      await this.consumer.subscribe({
        topics: [TOPICS.CAPACITY_UPDATE, TOPICS.RECONCILIATION],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.log(
        `Subscribed to topics: ${Object.values(TOPICS).join(', ')}`,
      );
    } catch (error) {
      this.isConnected = false;
      throw error;
    }
  }

  private async disconnect() {
    if (this.isConnected) {
      await this.consumer.disconnect();
      this.isConnected = false;
      this.logger.log('Disconnected from Kafka');
    }
  }

  private async handleMessage(payload: EachMessagePayload) {
    const { topic, message } = payload;

    if (!message.value) {
      this.logger.warn(`Received empty message on topic ${topic}`);
      return;
    }

    try {
      const value: unknown = JSON.parse(message.value.toString());

      switch (topic) {
        case TOPICS.CAPACITY_UPDATE:
          await this.handleCapacityUpdate(value as CapacityUpdateMessage);
          break;
        case TOPICS.RECONCILIATION:
          await this.handleReconciliation(value as ReconciliationMessage);
          break;
        default:
          this.logger.warn(`Unknown topic: ${topic}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error processing message from ${topic}: ${err.message}`,
        err.stack,
      );
    }
  }

  private async handleCapacityUpdate(message: CapacityUpdateMessage) {
    this.logger.log(
      `Processing capacity update for program ${message.programId}`,
    );

    await this.capacityService.updateProgramCapacity(
      message.programId,
      message.newTotalCapacity,
    );

    this.logger.log(
      `Updated capacity for program ${message.programId} to ${message.newTotalCapacity} ${message.currency}`,
    );
  }

  private async handleReconciliation(message: ReconciliationMessage) {
    this.logger.log(
      `Processing reconciliation for program ${message.programId}`,
    );

    await this.capacityService.reconcile(
      message.programId,
      message.totalCapacity,
      message.reservations,
    );

    this.logger.log(
      `Reconciled program ${message.programId}: capacity=${message.totalCapacity}, reservations=${message.reservations.length}`,
    );
  }
}
