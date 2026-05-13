'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '@/components/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { createIdempotencyKey } from '@/lib/idempotency';
import {
  createOrderBookSocket,
  type OrderBookUpdateMessage,
  type TradeCreatedMessage,
} from '@/lib/realtime';
import type { OrderBookView } from '@/lib/types';

const placeOrderSchema = z.object({
  side: z.enum(['YES', 'NO']),
  priceCents: z.number().int().min(1).max(99),
  quantity: z.number().int().min(1),
});

type PlaceOrderFormValues = z.infer<typeof placeOrderSchema>;

export default function MarketDetailPage(): ReactElement {
  const params = useParams<{ marketId: string }>();
  const marketId = params.marketId;

  const queryClient = useQueryClient();
  const { token, isAuthenticated } = useAuth();
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [lastRealtimeAt, setLastRealtimeAt] = useState<number | null>(null);
  const [recentTrades, setRecentTrades] = useState<TradeCreatedMessage['data'][]>([]);

  const marketQuery = useQuery({
    queryKey: ['market', marketId],
    queryFn: () => apiClient.getMarket(marketId),
    enabled: Boolean(marketId),
  });

  const orderBookQuery = useQuery({
    queryKey: ['order-book', marketId],
    queryFn: () => apiClient.getOrderBook(marketId),
    enabled: Boolean(marketId),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!marketId) {
      return;
    }

    const socket = createOrderBookSocket();

    const subscribeToMarket = () => {
      setIsRealtimeConnected(true);
      setReconnectAttempt(0);
      setRealtimeError(null);
      socket.emit('subscribe', { marketId });
    };

    const handleDisconnect = () => {
      setIsRealtimeConnected(false);
    };

    const handleConnectError = (error: Error) => {
      setRealtimeError(error.message || 'Realtime connection failed');
    };

    const handleReconnectAttempt = (attempt: number) => {
      setReconnectAttempt(attempt);
    };

    const handleOrderBookUpdate = (message: OrderBookUpdateMessage) => {
      if (message.marketId !== marketId) {
        return;
      }

      queryClient.setQueryData<OrderBookView>(['order-book', marketId], message.data);
      setLastRealtimeAt(message.timestamp);
    };

    const handleTradeCreated = (message: TradeCreatedMessage) => {
      if (message.marketId !== marketId) {
        return;
      }

      setRecentTrades((currentTrades) => {
        const nextTrades = [message.data, ...currentTrades.filter((trade) => trade.id !== message.data.id)];
        return nextTrades.slice(0, 8);
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlaceOrderFormValues>({
    resolver: zodResolver(placeOrderSchema),
    defaultValues: {
      side: 'YES',
      priceCents: 50,
      quantity: 1,
    },
  });

  const orderMutation = useMutation({
    mutationFn: async (values: PlaceOrderFormValues) => {
      return apiClient.placeOrder(token!, {
        marketId,
        side: values.side,
        priceCents: values.priceCents,
        quantity: values.quantity,
        idempotencyKey: createIdempotencyKey('order'),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order-book', marketId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', token] }),
      ]);
    },
  });

  const onPlaceOrder = handleSubmit(async (values: PlaceOrderFormValues) => {
    setOrderError(null);

    if (!isAuthenticated || !token) {
      setOrderError('Please login first');
      return;
    }

    try {
      await orderMutation.mutateAsync(values);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to place order';
      setOrderError(message);
    }
  });

  const realtimeStatus = isRealtimeConnected
    ? 'live'
    : reconnectAttempt > 0
      ? `reconnecting (${reconnectAttempt})`
      : 'polling fallback';

  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-6xl px-6 py-10">
      {marketQuery.isLoading ? <p className="text-sm text-tide">Loading market...</p> : null}

      {marketQuery.isError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Unable to load market details.
        </p>
      ) : null}

      {marketQuery.data ? (
        <>
          <h1 className="text-3xl font-black text-ink">{marketQuery.data.title}</h1>
          <p className="mt-1 text-sm text-tide">
            {marketQuery.data.status} - /{marketQuery.data.slug}
          </p>
        </>
      ) : null}

      <section className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Order Book</h2>
          <p className="mt-1 text-xs text-tide">
            Stream: {realtimeStatus}
            {lastRealtimeAt ? ` - updated ${new Date(lastRealtimeAt).toLocaleTimeString()}` : ''}
          </p>
          {realtimeError ? (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Realtime notice: {realtimeError}
            </p>
          ) : null}
          {orderBookQuery.isLoading ? <p className="mt-4 text-sm text-tide">Loading order book...</p> : null}

          {orderBookQuery.isError ? (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Unable to load order book.
            </p>
          ) : null}

          {!orderBookQuery.isLoading && orderBookQuery.data ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-ink/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-tide">YES</p>
                  {orderBookQuery.data.yes.length === 0 ? (
                    <p className="mt-2 text-sm text-tide/70">No levels</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-ink">
                      {orderBookQuery.data.yes.map((level: OrderBookView['yes'][number]) => (
                        <li key={`yes-${level.priceCents}`} className="flex justify-between">
                          <span>{level.priceCents}c</span>
                          <span>{level.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-md border border-ink/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-tide">NO</p>
                  {orderBookQuery.data.no.length === 0 ? (
                    <p className="mt-2 text-sm text-tide/70">No levels</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-ink">
                      {orderBookQuery.data.no.map((level: OrderBookView['no'][number]) => (
                        <li key={`no-${level.priceCents}`} className="flex justify-between">
                          <span>{level.priceCents}c</span>
                          <span>{level.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-ink/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-tide">Recent Trades</p>
                {recentTrades.length === 0 ? (
                  <p className="mt-2 text-sm text-tide/70">Waiting for trade-created events...</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm text-ink">
                    {recentTrades.map((trade) => (
                      <li key={trade.id} className="flex items-center justify-between gap-2 rounded bg-foam px-2 py-1.5">
                        <span className="font-semibold">
                          YES {trade.yesPriceCents}c / NO {trade.noPriceCents}c
                        </span>
                        <span className="text-tide">Qty {trade.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Order Ticket</h2>

          {!isAuthenticated ? (
            <p className="mt-3 text-sm text-tide">
              Login to place an order.{' '}
              <Link href="/login" className="font-semibold text-ink underline">
                Go to login
              </Link>
            </p>
          ) : null}

          <form onSubmit={onPlaceOrder} className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-tide">
              Side
              <select
                {...register('side')}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
            </label>

            <label className="block text-sm font-semibold text-tide">
              Price (cents)
              <input
                type="number"
                min="1"
                max="99"
                {...register('priceCents', { valueAsNumber: true })}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
              />
              {errors.priceCents ? (
                <span className="mt-1 block text-xs text-red-600">{errors.priceCents.message}</span>
              ) : null}
            </label>

            <label className="block text-sm font-semibold text-tide">
              Quantity
              <input
                type="number"
                min="1"
                {...register('quantity', { valueAsNumber: true })}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
              />
              {errors.quantity ? (
                <span className="mt-1 block text-xs text-red-600">{errors.quantity.message}</span>
              ) : null}
            </label>

            {orderError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{orderError}</p> : null}

            <button
              type="submit"
              disabled={!isAuthenticated || isSubmitting || orderMutation.isPending}
              className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-foam disabled:opacity-60"
            >
              {orderMutation.isPending ? 'Placing order...' : 'Place order'}
            </button>
          </form>
        </aside>
      </section>
    </main>
  );
}