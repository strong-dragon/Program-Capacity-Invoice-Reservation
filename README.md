# Program Capacity & Invoice Reservation Service

A NestJS-based microservice for tracking financing program capacity in real-time. Manages invoice reservations, capacity releases, and integrates with external treasury systems via Kafka.

## Features

- **Capacity Management**: Track available financing capacity across programs
- **Invoice Reservations**: Reserve capacity when invoices are approved for early payment
- **Multi-Currency Support**: Handle invoices in different currencies with automatic conversion
- **Kafka Integration**: Receive capacity updates and reconciliation messages from treasury
- **JWT Authentication**: All endpoints secured with JWT tokens
- **Idempotent Operations**: Safe retry handling for reservations

## Tech Stack

- **Framework**: NestJS 11
- **Database**: PostgreSQL 15 + TypeORM
- **Messaging**: KafkaJS
- **Auth**: JWT (Passport)
- **Validation**: class-validator

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose

### Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start infrastructure (PostgreSQL + Kafka)
docker-compose up -d

# Run in development mode
npm run start:dev
```

### Run Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## API Reference

### Authentication

```bash
# Login (get JWT token)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'

# Response: {"access_token": "eyJ..."}
```

### Programs

```bash
# Create program
curl -X POST http://localhost:3000/programs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Program A", "currency": "USD", "totalCapacity": "10000000"}'

# Get all programs
curl http://localhost:3000/programs \
  -H "Authorization: Bearer <token>"

# Get program by ID
curl http://localhost:3000/programs/:id \
  -H "Authorization: Bearer <token>"

# Get program availability
curl http://localhost:3000/programs/:id/availability \
  -H "Authorization: Bearer <token>"
# Response: {
#   "programId": "...",
#   "currency": "USD",
#   "totalCapacity": "10000000.00",
#   "reservedAmount": "500000.00",
#   "availableAmount": "9500000.00"
# }
```

### Reservations

```bash
# Create reservation
curl -X POST http://localhost:3000/programs/:programId/reservations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId": "INV-001", "amount": "50000", "currency": "USD"}'

# Release reservation
curl -X DELETE http://localhost:3000/reservations/:id \
  -H "Authorization: Bearer <token>"

# Get reservations for program
curl http://localhost:3000/programs/:programId/reservations \
  -H "Authorization: Bearer <token>"
```

## Kafka Topics

### capacity.update

Updates program capacity from treasury system.

```json
{
  "programId": "uuid",
  "newTotalCapacity": "15000000",
  "currency": "USD",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### capacity.reconciliation

Full state sync from treasury system.

```json
{
  "programId": "uuid",
  "totalCapacity": "10000000",
  "reservations": [
    {
      "invoiceId": "INV-001",
      "amount": "50000",
      "currency": "USD",
      "status": "active"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Architecture

```
src/
├── auth/           # JWT authentication
├── programs/       # Program CRUD operations
├── reservations/   # Reservation management
├── capacity/       # Core capacity logic
├── currency/       # Currency conversion
├── kafka/          # Kafka consumers
└── common/         # Shared utilities
```

## Design Decisions & Trade-offs

1. **PostgreSQL + Optimistic Locking**: ACID transactions ensure financial data integrity. Version column prevents concurrent modification issues.

2. **Decimal.js**: Used for all financial calculations to avoid floating-point precision errors.

3. **Idempotency via invoiceId**: Reservations use `invoiceId` as unique key, allowing safe retries without duplicate charges.

4. **Static Exchange Rates**: Rates stored in DB, seeded on startup. Production should integrate with external FX service.

5. **Graceful Kafka Degradation**: If Kafka is unavailable, the service continues operating with REST API only.

6. **Single Instance Assumption**: No distributed locks. Multi-instance deployment would require Redis-based locking.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_USERNAME` | Database username | capacity |
| `DB_PASSWORD` | Database password | capacity_secret |
| `DB_DATABASE` | Database name | capacity_db |
| `JWT_SECRET` | JWT signing secret | dev-secret |
| `JWT_EXPIRES_IN` | Token expiry | 1h |
| `KAFKA_BROKERS` | Kafka broker list | localhost:9092 |
| `KAFKA_GROUP_ID` | Consumer group ID | capacity-service |
| `PORT` | Application port | 3000 |

## License

MIT
