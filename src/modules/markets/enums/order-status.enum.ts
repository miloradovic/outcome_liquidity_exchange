export enum OrderStatus {
  OPEN = 'OPEN',
  MATCH_PENDING = 'MATCH_PENDING',
  MATCHED = 'MATCHED',
  CANCELLED = 'CANCELLED',
  // Deprecated: kept for backward compatibility with existing DB enum values.
  EXPIRED = 'EXPIRED',
  SETTLEMENT_FAILED = 'SETTLEMENT_FAILED',
}
