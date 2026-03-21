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

**Runtime:**
- Node.js 22.22.0
- npm 10.9.4

**Framework & Core:**
- NestJS 11.0.1
- TypeScript 5.7.3

**Database:**
- PostgreSQL 15
- TypeORM 0.3.28

**Authentication:**
- @nestjs/jwt 11.0.2
- Passport + passport-jwt
- bcrypt 6.0.0

**Messaging:**
- KafkaJS 2.2.4

**Validation:**
- class-validator 0.15.1
- class-transformer 0.5.1

**API Documentation:**
- @nestjs/swagger 11.2.6

**Utilities:**
- decimal.js 10.6.0 (financial calculations)

**Testing:**
- Jest 30.0.0
- Supertest 7.0.0

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
docker compose up -d

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

1. **PostgreSQL + Pessimistic Locking**: ACID transactions ensure financial data integrity. Pessimistic locking prevents race conditions during concurrent reservations.

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

## Swagger UI

After starting the server, open in browser:

```
http://localhost:3000/api
```

### How to test via Swagger (step by step)

**Step 1: Get token**
1. Open `POST /auth/login`
2. Click "Try it out"
3. Enter:
```json
{
  "username": "admin",
  "password": "admin"
}
```
4. Click "Execute"
5. Copy the `access_token` value from response (only the token itself, without quotes!)

**Step 2: Authorize**
1. Click "Authorize" button (top right corner)
2. Paste the token **WITHOUT QUOTES** (only `eyJhbGci...`, not `"eyJhbGci..."`)
3. Click "Authorize"
4. Click "Close"

**Step 3: Create a program**
1. Open `POST /programs`
2. "Try it out" → enter:
```json
{
  "name": "Test Program",
  "currency": "USD",
  "totalCapacity": "5000000"
}
```
3. "Execute" → you will get a program with `id`

**Step 4: Create a reservation**
1. Open `POST /programs/{programId}/reservations`
2. In the `programId` field paste the program ID
3. In Request body:
```json
{
  "invoiceId": "INV-100",
  "amount": "100000",
  "currency": "USD"
}
```
4. "Execute" → you will see `reservedAmount` and `availableAmount`

**Step 5: Check availability**
1. Open `GET /programs/{id}/availability`
2. Paste the program ID
3. "Execute" → you will see current capacity state

**Step 6: Release reservation**
1. Open `DELETE /reservations/{id}`
2. Paste the reservation ID
3. "Execute" → capacity returns to initial value

## Manual Testing (curl)

```bash
# 1. Get JWT token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'
# Response: {"access_token":"eyJhbGciOiJIUzI1NiIs..."}

# 2. Create a program with $5M capacity
curl -X POST http://localhost:3000/programs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Program", "currency": "USD", "totalCapacity": "5000000"}'

# 3. Create a reservation for $100,000
curl -X POST http://localhost:3000/programs/<programId>/reservations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId": "INV-100", "amount": "100000", "currency": "USD"}'
# Response: reservedAmount: 100000.00, availableAmount: 4900000.00

# 4. Check availability
curl http://localhost:3000/programs/<programId>/availability \
  -H "Authorization: Bearer <token>"

# 5. Release reservation
curl -X DELETE http://localhost:3000/reservations/<reservationId> \
  -H "Authorization: Bearer <token>"
# Response: reservedAmount: 0.00, availableAmount: 5000000.00
```

## Unit Tests

16 tests covering:
- **CapacityService**: reservation creation, release, availability calculation, idempotency, insufficient capacity, cross-currency conversion
- **CurrencyService**: same currency conversion, direct/inverse rate lookup
- **AuthService**: login validation, JWT token generation

```bash
npm test
# Test Suites: 3 passed, 3 total
# Tests: 16 passed, 16 total
```

## License

MIT
