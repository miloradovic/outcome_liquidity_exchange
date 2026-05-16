'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';
import { OrderBookPanel } from './_components/order-book-panel';
import { OrderTicket } from './_components/order-ticket';
import { useOrderBookRealtime } from './_hooks/use-order-book-realtime';

import { useAuth } from '@/components/providers/auth-provider';
import { apiClient } from '@/lib/api-client';

export default function MarketDetailPage(): ReactElement {
  const params = useParams<{ marketId: string }>();
  const marketId = params.marketId;
  const { token, isAuthenticated } = useAuth();

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

  const { recentTrades, realtimeError, lastRealtimeAt, realtimeStatus } = useOrderBookRealtime({
    marketId,
    token,
  });

  const statusLabel = marketQuery.data
    ? `${marketQuery.data.status}${
        marketQuery.data.status === 'RESOLVED' && marketQuery.data.resolvedOutcome
          ? ` - ${marketQuery.data.resolvedOutcome} wins`
          : ''
      }`
    : null;

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
            {statusLabel} - /{marketQuery.data.slug}
          </p>
        </>
      ) : null}

      <section className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
        <OrderBookPanel
          isLoading={orderBookQuery.isLoading}
          isError={orderBookQuery.isError}
          data={orderBookQuery.data}
          realtimeStatus={realtimeStatus}
          lastRealtimeAt={lastRealtimeAt}
          realtimeError={realtimeError}
          recentTrades={recentTrades}
        />
        <OrderTicket marketId={marketId} token={token} isAuthenticated={isAuthenticated} />
      </section>
    </main>
  );
}