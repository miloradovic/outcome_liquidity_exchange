import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import {
  createOrderBookSocket,
  type OrderBookUpdateMessage,
  type TradeCreatedMessage,
} from '@/lib/realtime';
import type { OrderBookView } from '@/lib/types';

type UseOrderBookRealtimeOptions = {
  marketId: string;
  token: string | null;
};

type UseOrderBookRealtimeResult = {
  recentTrades: TradeCreatedMessage['data'][];
  realtimeError: string | null;
  lastRealtimeAt: number | null;
  realtimeStatus: string;
};

const MAX_RECENT_TRADES = 8;

export function useOrderBookRealtime({
  marketId,
  token,
}: UseOrderBookRealtimeOptions): UseOrderBookRealtimeResult {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [lastRealtimeAt, setLastRealtimeAt] = useState<number | null>(null);
  const [recentTrades, setRecentTrades] = useState<TradeCreatedMessage['data'][]>([]);

  useEffect(() => {
    if (!marketId) {
      return;
    }

    setRecentTrades([]);
    setLastRealtimeAt(null);

    const socket = createOrderBookSocket();

    const subscribeToMarket = (): void => {
      setIsConnected(true);
      setReconnectAttempt(0);
      setRealtimeError(null);
      socket.emit('subscribe', { marketId });
    };

    const handleDisconnect = (): void => {
      setIsConnected(false);
    };

    const handleConnectError = (error: Error): void => {
      setRealtimeError(error.message || 'Realtime connection failed');
    };

    const handleReconnectAttempt = (attempt: number): void => {
      setReconnectAttempt(attempt);
    };

    const handleOrderBookUpdate = (message: OrderBookUpdateMessage): void => {
      if (message.marketId !== marketId) {
        return;
      }

      queryClient.setQueryData<OrderBookView>(['order-book', marketId], message.data);
      setLastRealtimeAt(message.timestamp);
    };

    const handleTradeCreated = (message: TradeCreatedMessage): void => {
      if (message.marketId !== marketId) {
        return;
      }

      setRecentTrades((currentTrades) => {
        const nextTrades = [
          message.data,
          ...currentTrades.filter((trade) => trade.id !== message.data.id),
        ];

        return nextTrades.slice(0, MAX_RECENT_TRADES);
      });
      setLastRealtimeAt(message.timestamp);
      void queryClient.invalidateQueries({ queryKey: ['order-book', marketId] });

      if (token) {
        void queryClient.invalidateQueries({ queryKey: ['orders', token] });
      }
    };

    socket.on('connect', subscribeToMarket);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('order-book-update', handleOrderBookUpdate);
    socket.on('trade-created', handleTradeCreated);

    socket.connect();
    if (socket.connected) {
      subscribeToMarket();
    }

    return () => {
      socket.emit('unsubscribe', { marketId });
      socket.off('connect', subscribeToMarket);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('order-book-update', handleOrderBookUpdate);
      socket.off('trade-created', handleTradeCreated);
      socket.disconnect();
    };
  }, [marketId, queryClient, token]);

  const realtimeStatus = useMemo(() => {
    if (isConnected) {
      return 'live';
    }

    if (reconnectAttempt > 0) {
      return `reconnecting (${reconnectAttempt})`;
    }

    return 'polling fallback';
  }, [isConnected, reconnectAttempt]);

  return {
    recentTrades,
    realtimeError,
    lastRealtimeAt,
    realtimeStatus,
  };
}
