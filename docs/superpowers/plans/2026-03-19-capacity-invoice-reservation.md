# Plan: Program Capacity & Invoice Reservation System

## Goal

Build a NestJS module that tracks financing program capacity in real-time:
- Accept invoice reservations (reduce available capacity)
- Process releases/repayments (restore capacity)
- Consume Kafka messages from treasury system
- Handle multi-currency operations
- Expose authenticated REST API

## Architectural Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                         REST API (Auth)                         │
├─────────────────────────────────────────────────────────────────┤
│  POST /programs/:id/reservations    - Reserve capacity          │
│  DELETE /reservations/:id           - Release reservation       │
│  GET /programs/:id/availability     - Get available capacity    │
│  GET /programs/:id                  - Get program details       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Capacity Service                           │
│  - Atomic reservation/release operations                        │
│  - Currency conversion                                          │
│  - Optimistic locking for concurrency                          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────┐         ┌──────────────────────┐
│    PostgreSQL DB     │         │   Kafka Consumer     │
│  - Programs          │         │  - capacity.update   │
│  - Reservations      │         │  - reconciliation    │
│  - Currency rates    │         └──────────────────────┘
└──────────────────────┘
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| PostgreSQL | ACID transactions for financial data integrity |
| Optimistic locking | Prevent race conditions on capacity updates |
| Decimal.js | Precise financial calculations (avoid floating point) |
| JWT Auth | Stateless, standard approach |
| In-memory currency rates | Simplicity; real system would use external service |
| Docker Compose | Local dev with Kafka + PostgreSQL |

## Assumptions & Trade-offs

1. **Currency conversion**: Using static rates table; production would integrate with FX service
2. **Reconciliation**: Bulk message replaces all reservations for a program (full sync)
3. **Idempotency**: Reservations have external `invoiceId` for idempotent retries
4. **No distributed locks**: Single instance assumed; would need Redis for multi-instance

## Tech Stack

- **Framework**: NestJS 11
- **Database**: PostgreSQL 15 + TypeORM
- **Messaging**: KafkaJS
- **Auth**: @nestjs/passport + JWT
- **Validation**: class-validator, class-transformer
- **Math**: decimal.js (precise decimal arithmetic)
- **Testing**: Jest (unit + e2e)
- **Local env**: Docker Compose

## File Structure

```
src/
├── main.ts
├── app.module.ts
├── config/
│   ├── config.module.ts
│   └── configuration.ts
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   ├── jwt-auth.guard.ts
│   └── dto/
│       └── login.dto.ts
├── programs/
│   ├── programs.module.ts
│   ├── programs.controller.ts
│   ├── programs.service.ts
│   ├── entities/
│   │   └── program.entity.ts
│   └── dto/
│       ├── create-program.dto.ts
│       └── program-availability.dto.ts
├── reservations/
│   ├── reservations.module.ts
│   ├── reservations.controller.ts
│   ├── reservations.service.ts
│   ├── entities/
│   │   └── reservation.entity.ts
│   └── dto/
│       ├── create-reservation.dto.ts
│       └── reservation-response.dto.ts
├── capacity/
│   ├── capacity.module.ts
│   ├── capacity.service.ts
│   └── capacity.service.spec.ts
├── currency/
│   ├── currency.module.ts
│   ├── currency.service.ts
│   └── entities/
│       └── exchange-rate.entity.ts
├── kafka/
│   ├── kafka.module.ts
│   ├── kafka.consumer.ts
│   └── dto/
│       ├── capacity-update.dto.ts
│       └── reconciliation.dto.ts
└── common/
    ├── filters/
    │   └── http-exception.filter.ts
    └── interceptors/
        └── logging.interceptor.ts

docker-compose.yml
.env.example
```

---

## Tasks

### Phase 1: Infrastructure Setup

#### Task 1.1: Install dependencies
```bash
npm install @nestjs/config @nestjs/typeorm typeorm pg \
  @nestjs/passport passport passport-jwt @nestjs/jwt \
  class-validator class-transformer decimal.js kafkajs \
  @types/passport-jwt
```
- [ ] Run command
- [ ] Verify: `npm ls @nestjs/typeorm` shows installed

#### Task 1.2: Create Docker Compose
- [ ] Create `docker-compose.yml` with PostgreSQL and Kafka
- [ ] Create `.env.example` with all required variables
- [ ] Verify: `docker-compose up -d` starts services
- [ ] Verify: `docker-compose ps` shows healthy containers

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: capacity
      POSTGRES_PASSWORD: capacity_secret
      POSTGRES_DB: capacity_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

volumes:
  postgres_data:
```

#### Task 1.3: Create Config Module
- [ ] Create `src/config/configuration.ts`
- [ ] Create `src/config/config.module.ts`
- [ ] Update `app.module.ts` to import ConfigModule
- [ ] Verify: `npm run start:dev` starts without errors

---

### Phase 2: Database Entities

#### Task 2.1: Create Program Entity
- [ ] Create `src/programs/entities/program.entity.ts`
- [ ] Fields: id, name, currency, totalCapacity, version (optimistic lock)
- [ ] Verify: TypeORM recognizes entity

```typescript
// src/programs/entities/program.entity.ts
@Entity('programs')
export class Program {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ length: 3 })
  currency: string; // ISO 4217 (USD, EUR, etc.)

  @Column('decimal', { precision: 18, scale: 2 })
  totalCapacity: string; // Store as string, use Decimal.js

  @Column({ default: true })
  isActive: boolean;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Reservation, (r) => r.program)
  reservations: Reservation[];
}
```

#### Task 2.2: Create Reservation Entity
- [ ] Create `src/reservations/entities/reservation.entity.ts`
- [ ] Fields: id, invoiceId, amount, currency, programId, status
- [ ] Verify: Entity compiles

```typescript
// src/reservations/entities/reservation.entity.ts
export enum ReservationStatus {
  ACTIVE = 'active',
  RELEASED = 'released',
}

@Entity('reservations')
@Unique(['invoiceId']) // Idempotency key
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoiceId: string; // External invoice reference

  @Column('decimal', { precision: 18, scale: 2 })
  amount: string;

  @Column({ length: 3 })
  currency: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amountInProgramCurrency: string; // Converted amount

  @Column({ type: 'enum', enum: ReservationStatus, default: ReservationStatus.ACTIVE })
  status: ReservationStatus;

  @ManyToOne(() => Program, (p) => p.reservations)
  @JoinColumn({ name: 'programId' })
  program: Program;

  @Column()
  programId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### Task 2.3: Create Exchange Rate Entity
- [ ] Create `src/currency/entities/exchange-rate.entity.ts`
- [ ] Seed initial rates in migration/seed

```typescript
@Entity('exchange_rates')
@Unique(['fromCurrency', 'toCurrency'])
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 3 })
  fromCurrency: string;

  @Column({ length: 3 })
  toCurrency: string;

  @Column('decimal', { precision: 18, scale: 6 })
  rate: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### Task 2.4: Setup TypeORM in AppModule
- [ ] Configure TypeORM with entities
- [ ] Enable synchronize for dev (disable in prod)
- [ ] Verify: `npm run start:dev` creates tables in PostgreSQL

---

### Phase 3: Authentication

#### Task 3.1: Create Auth Module Structure
- [ ] Create `src/auth/auth.module.ts`
- [ ] Create `src/auth/dto/login.dto.ts`
- [ ] Verify: Module compiles

#### Task 3.2: Implement JWT Strategy
- [ ] Create `src/auth/jwt.strategy.ts`
- [ ] Create `src/auth/jwt-auth.guard.ts`
- [ ] Verify: Guard can be imported

```typescript
// src/auth/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, username: payload.username };
  }
}
```

#### Task 3.3: Implement Auth Service & Controller
- [ ] Create `src/auth/auth.service.ts` with login (mock user validation)
- [ ] Create `src/auth/auth.controller.ts` with POST /auth/login
- [ ] Verify: `curl -X POST localhost:3000/auth/login -d '{"username":"admin","password":"admin"}'` returns JWT

---

### Phase 4: Currency Service

#### Task 4.1: Create Currency Module & Service
- [ ] Create `src/currency/currency.module.ts`
- [ ] Create `src/currency/currency.service.ts`
- [ ] Methods: `convert(amount, from, to)`, `getRate(from, to)`
- [ ] Verify: Unit test passes

```typescript
// src/currency/currency.service.spec.ts
describe('CurrencyService', () => {
  it('should convert USD to EUR', async () => {
    const result = await service.convert('100', 'USD', 'EUR');
    expect(result).toBeDefined();
  });

  it('should return 1 for same currency', async () => {
    const result = await service.convert('100', 'USD', 'USD');
    expect(result).toBe('100');
  });
});
```

---

### Phase 5: Capacity Service (Core Logic)

#### Task 5.1: Create Capacity Module Structure
- [ ] Create `src/capacity/capacity.module.ts`
- [ ] Create `src/capacity/capacity.service.ts` (empty methods)
- [ ] Verify: Module imports correctly

#### Task 5.2: Implement reserve() method
- [ ] Write failing test: reserve reduces available capacity
- [ ] Implement with transaction + optimistic locking
- [ ] Verify: Test passes

```typescript
// src/capacity/capacity.service.spec.ts
describe('reserve', () => {
  it('should reduce available capacity', async () => {
    // Given program with $1000 capacity
    // When reserve $100
    // Then available = $900
  });

  it('should reject if insufficient capacity', async () => {
    // Given program with $100 capacity
    // When reserve $200
    // Then throw InsufficientCapacityError
  });

  it('should handle concurrent reservations', async () => {
    // Given program with $1000 capacity
    // When 2 concurrent reservations of $600
    // Then one succeeds, one fails (optimistic lock)
  });
});
```

#### Task 5.3: Implement release() method
- [ ] Write failing test: release restores capacity
- [ ] Implement: mark reservation as RELEASED
- [ ] Verify: Test passes

#### Task 5.4: Implement getAvailability() method
- [ ] Write failing test: returns correct available amount
- [ ] Implement: totalCapacity - SUM(active reservations)
- [ ] Verify: Test passes

```typescript
async getAvailability(programId: string): Promise<AvailabilityDto> {
  const program = await this.programRepo.findOneOrFail({
    where: { id: programId }
  });

  const reserved = await this.reservationRepo
    .createQueryBuilder('r')
    .select('SUM(r.amountInProgramCurrency)', 'total')
    .where('r.programId = :programId', { programId })
    .andWhere('r.status = :status', { status: ReservationStatus.ACTIVE })
    .getRawOne();

  const total = new Decimal(program.totalCapacity);
  const used = new Decimal(reserved.total || '0');

  return {
    programId,
    currency: program.currency,
    totalCapacity: total.toString(),
    reservedAmount: used.toString(),
    availableAmount: total.minus(used).toString(),
  };
}
```

---

### Phase 6: REST API

#### Task 6.1: Create Programs Controller
- [ ] Create `src/programs/programs.module.ts`
- [ ] Create `src/programs/programs.service.ts`
- [ ] Create `src/programs/programs.controller.ts`
- [ ] Endpoints: GET /:id, GET /:id/availability, POST (create)
- [ ] Apply `@UseGuards(JwtAuthGuard)` to all routes
- [ ] Verify: Endpoints require auth

#### Task 6.2: Create DTOs for Programs
- [ ] Create `src/programs/dto/create-program.dto.ts`
- [ ] Create `src/programs/dto/program-availability.dto.ts`
- [ ] Add class-validator decorators
- [ ] Verify: Invalid requests return 400

#### Task 6.3: Create Reservations Controller
- [ ] Create `src/reservations/reservations.module.ts`
- [ ] Create `src/reservations/reservations.service.ts`
- [ ] Create `src/reservations/reservations.controller.ts`
- [ ] Endpoints: POST /programs/:id/reservations, DELETE /reservations/:id
- [ ] Verify: E2E test passes

#### Task 6.4: Create DTOs for Reservations
- [ ] Create `src/reservations/dto/create-reservation.dto.ts`
- [ ] Create `src/reservations/dto/reservation-response.dto.ts`
- [ ] Verify: Validation works

```typescript
// src/reservations/dto/create-reservation.dto.ts
export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsNumberString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @Length(3, 3)
  currency: string;
}
```

---

### Phase 7: Kafka Integration

#### Task 7.1: Create Kafka Module
- [ ] Create `src/kafka/kafka.module.ts`
- [ ] Configure KafkaJS with env variables
- [ ] Verify: Module loads without error

#### Task 7.2: Implement Capacity Update Consumer
- [ ] Create `src/kafka/kafka.consumer.ts`
- [ ] Subscribe to `capacity.update` topic
- [ ] Update program totalCapacity on message
- [ ] Verify: Manual test with kafka-console-producer

```typescript
// Message format for capacity.update
interface CapacityUpdateMessage {
  programId: string;
  newTotalCapacity: string;
  currency: string;
  timestamp: string;
}
```

#### Task 7.3: Implement Reconciliation Consumer
- [ ] Subscribe to `capacity.reconciliation` topic
- [ ] Replace all reservations for program with message data
- [ ] Use transaction for atomic update
- [ ] Verify: Test with sample message

```typescript
// Message format for reconciliation
interface ReconciliationMessage {
  programId: string;
  totalCapacity: string;
  reservations: Array<{
    invoiceId: string;
    amount: string;
    currency: string;
    status: 'active' | 'released';
  }>;
  timestamp: string;
}
```

---

### Phase 8: Error Handling & Validation

#### Task 8.1: Create Custom Exceptions
- [ ] Create `src/common/exceptions/insufficient-capacity.exception.ts`
- [ ] Create `src/common/exceptions/program-not-found.exception.ts`
- [ ] Verify: Exceptions return proper HTTP codes

#### Task 8.2: Create Global Exception Filter
- [ ] Create `src/common/filters/http-exception.filter.ts`
- [ ] Register globally in main.ts
- [ ] Verify: Errors return consistent JSON format

#### Task 8.3: Enable Validation Pipe
- [ ] Add `ValidationPipe` in main.ts
- [ ] Configure whitelist + forbidNonWhitelisted
- [ ] Verify: Invalid requests rejected with details

---

### Phase 9: Testing

#### Task 9.1: Unit Tests for CapacityService
- [ ] Test reserve with sufficient capacity
- [ ] Test reserve with insufficient capacity
- [ ] Test release existing reservation
- [ ] Test release already released (idempotent)
- [ ] Test currency conversion in reservation
- [ ] Verify: `npm test` all pass

#### Task 9.2: Unit Tests for CurrencyService
- [ ] Test conversion with known rates
- [ ] Test same currency returns original
- [ ] Test unknown currency throws error
- [ ] Verify: `npm test` all pass

#### Task 9.3: E2E Tests
- [ ] Test auth flow (login, use token)
- [ ] Test create program
- [ ] Test reserve → check availability → release
- [ ] Test idempotent reservation (same invoiceId)
- [ ] Verify: `npm run test:e2e` all pass

---

### Phase 10: Documentation & Cleanup

#### Task 10.1: Create .env.example
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=capacity
DB_PASSWORD=capacity_secret
DB_DATABASE=capacity_db

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=1h

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_GROUP_ID=capacity-service

# App
PORT=3000
```

#### Task 10.2: Update README
- [ ] Add setup instructions
- [ ] Document API endpoints
- [ ] List assumptions and trade-offs
- [ ] Add example curl commands

#### Task 10.3: Final Verification
- [ ] `docker-compose up -d` - services start
- [ ] `npm run start:dev` - app starts
- [ ] `npm test` - all tests pass
- [ ] `npm run test:e2e` - e2e tests pass
- [ ] Manual test: login → create program → reserve → check → release

---

## API Reference

### Authentication
```bash
POST /auth/login
Body: { "username": "admin", "password": "admin" }
Response: { "access_token": "eyJ..." }
```

### Programs
```bash
# Create program
POST /programs
Headers: Authorization: Bearer <token>
Body: { "name": "Program A", "currency": "USD", "totalCapacity": "10000000" }

# Get program
GET /programs/:id
Headers: Authorization: Bearer <token>

# Get availability
GET /programs/:id/availability
Headers: Authorization: Bearer <token>
Response: {
  "programId": "...",
  "currency": "USD",
  "totalCapacity": "10000000",
  "reservedAmount": "500000",
  "availableAmount": "9500000"
}
```

### Reservations
```bash
# Create reservation
POST /programs/:id/reservations
Headers: Authorization: Bearer <token>
Body: { "invoiceId": "INV-001", "amount": "50000", "currency": "USD" }

# Release reservation
DELETE /reservations/:id
Headers: Authorization: Bearer <token>
```

---

## Execution Recommendation

**Recommended approach**: Execute tasks inline in this session since they're interdependent and build on each other sequentially. Start with Phase 1 (Infrastructure) and proceed through each phase.

Estimated time: 2-3 hours for full implementation with tests.
