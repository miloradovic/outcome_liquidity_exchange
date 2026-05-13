import { io, Socket } from 'socket.io-client';

import { WS_BASE_URL } from './env';
import type { OrderBookView } from './types';

export type OrderBookUpdateMessage = {
  event: 'order-book-update';
  marketId: string;
  timestamp: number;
  data: OrderBookView;
};

export type TradeCreatedMessage = {
  event: 'trade-created';
  marketId: string;
  timestamp: number;
  data: {
    id: string;
    marketId: string;
    yesOrderId: string;
    noOrderId: string;
    yesPriceCents: number;
    noPriceCents: number;
    quantity: number;
    status: string;
    createdAt: string;
  };
};

export type BalanceUpdateMessage = {
  event: 'balance-update';
  userId: string;
  timestamp: number;
  data: {
    availableBalanceCents: number;
    reservedBalanceCents: number;
  };
};

function createSocket(namespace: '/order-book' | '/balance'): Socket {
  return io(`${WS_BASE_URL}${namespace}`, {
    autoConnect: false,
    transports: ['websocket'],
    withCredentials: false,
  });
}

export function createOrderBookSocket(): Socket {
  return createSocket('/order-book');
}

export function createBalanceSocket(): Socket {
  return createSocket('/balance');
}
