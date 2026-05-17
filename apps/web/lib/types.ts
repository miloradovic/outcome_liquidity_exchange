export type OutcomeSide = 'YES' | 'NO';

export type OrderStatus =
  | 'OPEN'
  | 'MATCH_PENDING'
  | 'MATCHED'
  | 'CANCELLED'
  | 'SETTLEMENT_FAILED';

export type MarketStatus = 'OPEN' | 'CLOSED' | 'RESOLVED';

export type WalletEntryType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'RESERVE'
  | 'RELEASE'
  | 'SETTLE_DEBIT'
  | 'SETTLE_CREDIT';

export type UserRole = 'USER' | 'ADMIN';

export type UserProfile = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  accessToken: string;
  user: UserProfile;
};

export type Wallet = {
  id: string;
  userId: string;
  currencyCode: string;
  availableBalanceCents: number;
  reservedBalanceCents: number;
  createdAt: string;
  updatedAt: string;
};

export type WalletEntry = {
  id: string;
  walletId: string;
  entryType: WalletEntryType;
  amountCents: number;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  createdAt: string;
};

export type DepositResponse = {
  wallet: Wallet;
  amountCents: number;
  idempotencyKey: string;
};

export type WithdrawResponse = {
  wallet: Wallet;
  amountCents: number;
  idempotencyKey: string;
};

export type Outcome = {
  id: string;
  side: OutcomeSide;
};

export type Market = {
  id: string;
  slug: string;
  title: string;
  status: MarketStatus;
  closesAt: string | null;
  resolvedOutcome: OutcomeSide | null;
  outcomes: Outcome[];
  createdAt: string;
};

export type Order = {
  id: string;
  userId: string;
  marketId: string;
  side: OutcomeSide;
  priceCents: number;
  quantity: number;
  reservedCents: number;
  status: OrderStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderBookLevel = {
  priceCents: number;
  quantity: number;
};

export type OrderBookView = {
  marketId: string;
  yes: OrderBookLevel[];
  no: OrderBookLevel[];
};

export type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};
