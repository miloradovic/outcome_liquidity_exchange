# Outcome Liquidity Exchange (V1 Baseline)

A NestJS modular monolith for trading binary outcome tokens with exact-price exact-quantity matching. Built in 4 weeks with PostgreSQL as canonical state, Redis as projection layer, and WebSocket for realtime updates.

## Quick Start (Docker)

```bash
# Start all services (app, PostgreSQL, Redis)
docker compose up --build

# Run migrations
docker compose exec app npm run migration:run

# Run seeds (populate demo users and markets)
docker compose exec app npm run seed

# View Swagger API docs
open http://localhost:3000/docs
```

## Architecture Overview

### Core Principles

1. **Canonical State**: PostgreSQL holds all users, wallets, wallets entries, markets, orders, and trades. This is never lost.
2. **Fast Projection**: Redis holds the live order book projection (sorted sets per market/side). Rebuilds from PostgreSQL on startup.
3. **Money as Integers**: All currency values stored as cents to avoid floating-point errors.
4. **Exact Matching**: V1 supports only exact-price exact-quantity matching. No partial fills.
5. **Idempotent Mutations**: All wallet operations include an idempotency key to prevent duplicate charges under retries.
6. **Row-Level Locking**: PostgreSQL pessimistic write locks enforce serializable reserve/release/settle flows.

### Technology Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL 16 (canonical state)
- **Cache**: Redis 7 (projections)
- **Realtime**: Socket.io for WebSocket broadcasts
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest + Supertest + BullMQ testing utilities
- **Task Queue**: BullMQ for settlement and expiry jobs

### Module Architecture

```
src/modules/
├── auth/              # JWT, password hashing, login/register
├── users/             # User entities and queries
├── wallet/            # Balance tracking, ledger entries, reserve/release/settle
├── markets/           # Markets, outcomes, orders, trades persistence
├── matching-engine/   # Redis order book projection and matching logic
├── jobs/              # BullMQ settlement and expiry workers
├── realtime/          # WebSocket gateways for public/private updates
└── health/            # Liveness and dependency status
```

## API Surface

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Get JWT access token
- `GET /api/me` - Get current user profile

### Wallet (Protected)
- `GET /api/wallet` - Get wallet balance (available + reserved)
- `GET /api/wallet/entries` - Get transaction history
- `POST /api/wallet/deposit` - Deposit demo funds

### Markets (Public)
- `GET /api/markets` - List all markets
- `GET /api/markets/:marketId` - Get market details and outcomes
- `GET /api/markets/:marketId/order-book` - Get live order book

### Orders (Protected)
- `POST /api/orders` - Place a new order
- `DELETE /api/orders/:orderId` - Cancel an open order
- `GET /api/orders/me` - Get current user's orders

### Realtime Updates (WebSocket)
- **Public**: `ws://localhost:3000/order-book`
  - Subscribe to `order-book:marketId` for live order book updates
  - Receive `trade-created` events for matches
- **Private**: `ws://localhost:3000/balance`
  - Authenticate with JWT token
  - Receive `balance-update` events after trades settle

## Domain Model

### Wallet & Entries
```
Wallet:
  - id (UUID, PK)
  - user_id (UUID, FK)
  - available_balance_cents (integer)
  - reserved_balance_cents (integer)
  - created_at, updated_at

WalletEntry (immutable ledger):
  - id (UUID, PK)
  - wallet_id (UUID, FK)
  - entry_type (DEPOSIT | RESERVE | RELEASE | SETTLE_DEBIT | SETTLE_CREDIT)
  - amount_cents (integer)
  - reference_type (ORDER | TRADE | MANUAL_DEPOSIT)
  - reference_id (UUID)
  - idempotency_key (string, unique)
  - created_at
```

### Markets & Orders
```
Market:
  - id (UUID, PK)
  - slug, title (metadata)
  - status (OPEN | CLOSED | RESOLVED)
  - closes_at (timestamp)

Outcome:
  - id (UUID, PK)
  - market_id (UUID, FK)
  - side (YES | NO)

Order:
  - id (UUID, PK)
  - user_id (UUID, FK)
  - market_id (UUID, FK)
  - side (YES | NO)
  - price_cents (1-99)
  - quantity (positive integer)
  - reserved_cents (price_cents * quantity)
  - status (OPEN | MATCH_PENDING | MATCHED | CANCELLED | EXPIRED | SETTLEMENT_FAILED)
  - idempotency_key (string, unique per user)
  - created_at

Trade:
  - id (UUID, PK)
  - market_id (UUID, FK)
  - yes_order_id, no_order_id (FKs)
  - yes_price_cents, no_price_cents (always sum to 100)
  - quantity (matched quantity)
  - status (PENDING_SETTLEMENT | SETTLED | FAILED)
  - created_at
```

## Core Flows

### Place Order
1. Validate market is OPEN
2. Calculate reserved amount = price × quantity
3. **Atomic transaction** (DB lock):
   - Reserve funds (check available >= reserved, then move to reserved)
   - Persist order as OPEN
   - Record wallet entry
4. Project order to Redis order book
5. Best-effort matching: find complementary order at (100 - price)
6. If match found: persist trade, enqueue settlement job

### Cancel Order
1. **Atomic transaction** (DB lock):
   - Mark order as CANCELLED
   - Release reserved funds back to available
   - Record wallet entry
2. Remove order from Redis

### Settle Trade (BullMQ Worker)
1. **Atomic transaction** (DB lock):
   - Mark orders as MATCHED, trade as SETTLED
   - Convert reserved → committed wallet entries
2. Emit balance update via WebSocket
3. Emit trade event for public subscribers

### Redis Projection Rebuild
- On app startup: load all OPEN orders from PostgreSQL
- For each order: insert into sorted set `orderbook:marketId:side`
- Log duration and order count

## Testing

### Unit Tests
```bash
npm test
```
Tests core business logic: wallet math, matching rules, idempotency, etc.

### E2E Tests
```bash
npm run test:e2e
```
Tests full flows: register → deposit → place → match → settle

Key scenarios covered:
- Register and deposit flow
- Place order, view order book
- Order matching and balance updates
- Order cancellation and fund release
- Idempotency under duplicate requests
- Authentication and authorization

### Local Verification
```bash
# Full test suite
npm run lint && npm run build && npm test && npm run test:e2e

# Or via Docker
docker compose run --rm app npm run lint
docker compose run --rm app npm run build
docker compose run --rm app npm run test
docker compose run --rm app npm run test:e2e
```

## V1 Scope (Intentional Boundaries)

### In Scope
- Binary YES/NO markets
- Exact-price exact-quantity matching (no partial fills)
- Demo funds only (no real payments)
- One deployable monolith
- Atomic wallet operations with no double-spend
- WebSocket realtime updates

### Out of Scope
- Microservices, Kafka, RabbitMQ, Kubernetes
- Partial fills, market orders, limit orders with time windows
- Real money, external identity providers, compliance
- Market resolution and payout logic
- Admin UI, player dashboard

## Architecture Decision Records (ADRs)

See [docs/adr/](docs/adr/) for detailed design decisions:

- **ADR-001**: Canonical state in PostgreSQL, projection in Redis
- **ADR-002**: Exact-price exact-quantity matching only
- **ADR-003**: Integer cents for money representation
- **ADR-004**: Row-level locking for wallet safety
- **ADR-005**: Idempotency keys for all mutations

## Future Evolution

Once V1 is stable, the natural split for microservices is:

1. **Gateway Service**: Auth, REST API, WebSocket, rate limiting
2. **Wallet Service**: PostgreSQL-backed ledger with isolated scaling
3. **Engine Service**: Redis-backed order book with independent matching logic

Because V1 already separates persistence, projection, and queue layers, the split is primarily a deployment and transport layer change, not a domain rewrite.

## Troubleshooting

### Port already in use
```bash
# Change PORT env var or kill existing process
PORT=3001 npm run start:dev
```

## Contributing

1. Follow the module structure
2. Add tests alongside features
3. Keep wallet logic isolated to `wallet.service.ts`
4. All DB mutations use transactions with locks
5. Idempotency keys for all wallet operations

## License

UNLICENSED (Prototype/Portfolio)

