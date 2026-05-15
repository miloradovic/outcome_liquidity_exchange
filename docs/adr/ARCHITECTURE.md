# Architecture Decision Record: Outcome Liquidity Exchange V1

## ADR-001: Canonical State (PostgreSQL) + Projection Layer (Redis)

### Status: Accepted

### Context
We need a trading system that is both durable and performant. We must never lose trades or lose user balances, but we also need sub-millisecond order book queries and broadcasts.

### Decision
- PostgreSQL is the canonical, immutable source of truth for users, wallets, orders, and trades.
- Redis holds derived projections: the live order book, indexed by market and side.
- Redis can be cleared and rebuilt from PostgreSQL on startup without loss.

### Rationale
1. **Durability**: PostgreSQL transactions guarantee no double-spending or data loss.
2. **Speed**: Redis sorted sets provide O(log n) order book queries and O(1) subscription broadcasts.
3. **Recoverability**: If Redis crashes, the app rebuilds the order book from PostgreSQL OPEN orders on startup.
4. **Simplicity**: Single source of truth reduces bugs; Redis is purely a cache.

### Consequences
- Order book queries always serve from Redis (fast, eventual consistency).
- Order placement must update PostgreSQL before projecting to Redis (order visibility may lag by milliseconds).
- Cache invalidation is explicit: we remove orders from Redis only after successful DB operations.
- Rebuild on startup may take seconds for large order books (log during rebuild).

### References
- Matching engine: `src/modules/matching-engine/matching-engine.service.ts`
- Orders service: `src/modules/orders/orders.service.ts`

---

## ADR-002: Exact-Price Exact-Quantity Matching Only

### Status: Accepted

### Context
Matching algorithms range from simple (exact match) to complex (aggregated, partial fills). More complexity increases bugs and attack surface for first launch.

### Decision
V1 supports only exact matching:
- One YES order matches exactly one NO order (no partial fills).
- YES order at price P matches NO order at price (100-P).
- Quantity must be identical.
- If no match exists, order rests in book.

### Rationale
1. **Time-boxed delivery**: Exact matching is finite state, testable, auditable.
2. **No edge cases**: Partial fills introduce orphaned reserve amounts and complex settlement logic.
3. **Clear semantics**: Users understand "match or rest"; no surprise partial fills.
4. **Easy to verify**: Tests can assert trade creation deterministically.

### Consequences
- Users cannot partially fill orders; they must cancel and re-place.
- Large orders may never fully fill if counterparts are fragmented.
- Order book can accumulate resting orders if there's no matching demand.
- Future microservice split can add aggregation without touching V1 domain logic.

### References
- Matching logic: `src/modules/matching-engine/matching-engine.service.ts::tryMatchOrder()`

---

## ADR-003: Integer Cents for All Money Values

### Status: Accepted

### Context
Floating-point arithmetic fails for finance: rounding errors accumulate, hidden precision issues appear, and audits fail. We need deterministic money math.

### Decision
All monetary values are stored and computed as **integer cents**:
- `availableBalanceCents`, `reservedBalanceCents` on wallet
- `priceCents` (1-99), `quantityCents` for matching
- `amountCents` for deposits/withdrawals
- `yesPriceCents + noPriceCents = 100` for complementary pricing

### Rationale
1. **Precision**: No rounding errors; 1 cent is the atomic unit.
2. **Audit trail**: Every wallet entry records exact integer amount.
3. **Determinism**: Same logic always produces same result across restarts.
4. **Simplicity**: No decimal library; native JavaScript integers work (up to 2^53).

### Consequences
- API accepts and returns cents (e.g., 10_000 = $100.00).
- Clients must convert cents to display currency.
- No support for sub-cent fractional amounts.
- Database uses `INTEGER` or `BIGINT` columns, never `NUMERIC` for primary calcs.

### References
- Wallet schema: `src/modules/wallet/entities/wallet.entity.ts`
- Order schema: `src/modules/markets/entities/order.entity.ts`

---

## ADR-004: Pessimistic Row-Level Locking for Wallet Safety

### Status: Accepted

### Context
Multiple concurrent requests to place orders can race on wallet reserves. Without locking, two requests might reserve from the same available balance and overdraw the wallet.

### Decision
All wallet mutations (reserve, release, settle) acquire a **pessimistic write lock** on the wallet row:
```typescript
const wallet = await manager
  .getRepository(Wallet)
  .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
wallet.availableBalanceCents -= amount;
await manager.save(wallet);
```

### Rationale
1. **Guarantees**: Lock prevents concurrent mutations; serializable isolation.
2. **Simplicity**: No optimistic retry logic; lock-wait is automatic in database.
3. **Auditability**: Lock order is clear; no hidden race conditions.
4. **PostgreSQL native**: SERIALIZABLE is well-tested; no distributed consensus needed.

### Consequences
- Lock contention under high volume: transactions may queue (acceptable for V1 demo).
- Deadlock risk if multiple operations acquire locks in different orders (mitigated by consistent acquisition order).
- Lock timeout possible if transaction hangs (set `statement_timeout` in PostgreSQL).
- Not suitable for massive scale; future: partition wallets or use event sourcing.

### References
- Wallet service: `src/modules/wallet/wallet.service.ts`
- Settlement worker: `src/modules/jobs/settlement-worker.service.ts`

---

## ADR-005: Idempotency Keys for All Wallet Mutations

### Status: Accepted

### Context
Clients may retry requests (timeout, network flake). Without idempotency, a retry could double-charge a wallet.

### Decision
Every wallet mutation API call requires an **idempotency key** (string, unique per user):
- `POST /api/wallet/deposit` requires `idempotencyKey`
- `POST /api/orders` requires `idempotencyKey`
- Database records unique `(user_id, idempotency_key)` and rejects duplicates
- Duplicate request returns same result as first request (cached or replayed)

### Rationale
1. **Retry safety**: Client can safely retry without side effects.
2. **Audit trail**: Ledger shows which business action each entry belongs to.
3. **User-friendly**: No silent failures; same request = same response.
4. **Standard**: Stripe, Twilio, and other fintech APIs use idempotency keys.

### Consequences
- Client must generate and store idempotency key (UUID or timestamp-based).
- Database must enforce unique constraint on `(user_id, idempotency_key)`.
- Duplicate requests may still be processed (not cached in app; database deduplicates).
- Failed requests that created partial state may need manual reconciliation (rare, logged).

### References
- Wallet service: `src/modules/wallet/wallet.service.ts::mutateWallet()`
- Orders service: `src/modules/orders/orders.service.ts::placeOrder()`

---

## ADR-006: WebSocket for Realtime Broadcasts, REST for Mutations

### Status: Accepted

### Context
Clients need live order book updates and balance notifications. REST alone requires polling (inefficient); WebSocket is ideal for broadcast.

### Decision
- **Write operations** (order, deposit) use REST POST/DELETE (simpler auth, retries, validation).
- **Broadcast operations** (order book updates, balance changes) use WebSocket.
  - Public channel: `order-book:marketId` for order book and trades.
  - Private channel: `balance:userId` (authenticated) for balance updates.

### Rationale
1. **Clear separation**: State changes are REST; notifications are WebSocket.
2. **Simpler auth**: REST can use Bearer token; WebSocket uses Token in auth frame.
3. **Easier testing**: REST is synchronous; WebSocket is best-effort (optional for tests).
4. **Scalability**: WebSocket gateways can be separate from REST app (future).

### Consequences
- Clients must connect to WebSocket endpoint separately from REST.
- WebSocket connection is optional (app works without realtime).
- Missed updates if client disconnects; no message queue.
- Order book updates are eventual consistent (update sent after DB commit, received after transport delay).

### References
- Realtime module: `src/modules/realtime/realtime.module.ts`
- Order book gateway: `src/modules/realtime/gateways/order-book.gateway.ts`
- Balance gateway: `src/modules/realtime/gateways/balance.gateway.ts`

---

## ADR-007: BullMQ for Settlement Only, Sync Matching

### Status: Accepted

### Context
Job queues are useful for async work. We must decide: which operations queue, which are sync?

### Decision
- **Synchronous**: Order placement and matching (happens inside app handler).
- **Queued (BullMQ)**: Trade settlement (multi-step wallet updates, broadcasts).

### Rationale
1. **Matching speed**: Instant feedback to user; no delay for best-effort match.
2. **Settlement isolation**: Long-running wallet operations don't block order book.
3. **Recoverability**: Settlement jobs can retry independently; orders are durable in PostgreSQL.
4. **Simplicity**: No need for generic event sourcing; BullMQ is sufficient.

### Consequences
- Order placement is synchronous (request blocked until order persisted and matched).
- Settlement may lag (BullMQ worker queues); balance updates broadcast asynchronously.
- If settlement worker crashes, trades remain `PENDING_SETTLEMENT` (manual retry possible).
- High-frequency matching workloads may benefit from async but V1 doesn't need it.

### References
- Settlement queue: `src/modules/jobs/settlement-queue.service.ts`
- Settlement worker: `src/modules/jobs/settlement-worker.service.ts`

---

## ADR-008: Modular Monolith with Future Microservice Path

### Status: Accepted

### Context
Monoliths are fast to build; microservices are complex but scale independently. We need a clear path from one to the other.

### Decision
Organize code as **module boundaries** that can later become **service boundaries**:
- `auth` & `users`: Identity (future: auth service)
- `wallet`: Ledger (future: wallet service)
- `markets`, `matching-engine`: Order book and matching (future: engine service)
- `jobs`: Async work (future: shared across services)

### Rationale
1. **Rapid V1**: Start as monolith; no RPC latency, simpler testing.
2. **Clear seams**: Modules are loosely coupled; no tight dependencies across concerns.
3. **Easy migration**: Split modules into services by moving code and adding HTTP/gRPC clients.
4. **Team scaling**: Each module can be owned by one team.

### Consequences
- Monolith scale limit: ~1000 RPS on modest hardware.
- Cross-module calls are function calls (no latency); tight coupling possible if not careful.
- Future split will require API contracts and eventual consistency logic.
- Deployment is all-or-nothing (no independent scaling in V1).

### References
- Module structure: `src/modules/`

---

## ADR-009: Enum Value Lifecycle for Safe Deprecation

### Status: Accepted

### Context
Database enum columns (`markets.status`, `orders.status`) outlive any single release. Removing enum values directly from application code can break reads for historical rows and can make rollbacks unsafe.

### Decision
Use a 4-phase lifecycle for enum value deprecation:
1. **Deprecate in code**: keep enum value in TypeScript and database, but stop writing it from business logic.
2. **Observe**: verify the value is no longer produced and no rows still depend on it.
3. **Backfill**: migrate any remaining rows to supported values.
4. **Drop**: create a dedicated migration to rebuild the Postgres enum type without deprecated values.

### Rationale
1. **Rollback safety**: prior app versions can still read existing enum values.
2. **Operational safety**: avoids destructive migrations until data is clean.
3. **Auditability**: each phase is explicit and reviewable.
4. **Zero surprise**: schema changes happen only after runtime behavior proves readiness.

### Consequences
- Deprecated values may remain in schema for one or more releases.
- Application code should annotate legacy values clearly as compatibility-only.
- Enum-drop migrations must be isolated and never bundled with unrelated features.

### References
- Market statuses: `src/modules/markets/enums/market-status.enum.ts`
- Order statuses: `src/modules/markets/enums/order-status.enum.ts`
- Initial enum DDL: `src/database/migrations/1746909600000-InitialSchema.ts`

---

## Summary Table

| ADR | Title | Status | Impact |
|-----|-------|--------|--------|
| 001 | Canonical PostgreSQL + Redis projection | Accepted | High: durability + speed |
| 002 | Exact matching only | Accepted | High: scoped, simple |
| 003 | Integer cents | Accepted | High: precision, audit |
| 004 | Pessimistic row locking | Accepted | High: wallet safety |
| 005 | Idempotency keys | Accepted | High: retry safety |
| 006 | WebSocket + REST | Accepted | Medium: realtime UX |
| 007 | BullMQ for settlement | Accepted | Medium: isolation |
| 008 | Modular monolith | Accepted | Medium: future path |
| 009 | Enum lifecycle deprecation | Accepted | Medium: migration safety |
