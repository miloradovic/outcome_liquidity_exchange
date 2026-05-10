export interface RealtimeEvent {
  event: string;
  timestamp: number;
  data: unknown;
}

export interface OrderBookUpdateEvent extends RealtimeEvent {
  event: 'order-book-update';
  data: {
    marketId: string;
    side: 'YES' | 'NO';
    orders: Array<{
      id: string;
      userId: string;
      priceCents: number;
      quantity: number;
      createdAt: string;
    }>;
  };
}

export interface BalanceUpdateEvent extends RealtimeEvent {
  event: 'balance-update';
  data: {
    userId: string;
    availableBalanceCents: number;
    reservedBalanceCents: number;
  };
}

export interface TradeEvent extends RealtimeEvent {
  event: 'trade-created';
  data: {
    id: string;
    marketId: string;
    yesPriceCents: number;
    noPriceCents: number;
    quantity: number;
    createdAt: string;
  };
}
