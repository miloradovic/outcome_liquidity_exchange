'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { OrderBookPanel } from './_components/order-book-panel';
import { OrderTicket } from './_components/order-ticket';
import { useOrderBookRealtime } from './_hooks/use-order-book-realtime';

import { useAuth } from '@/components/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import type { OutcomeSide } from '@/lib/types';

type PendingAdminAction = 'close' | 'resolve' | null;

export default function MarketDetailPage(): ReactElement {
  const params = useParams<{ marketId: string }>();
  const marketId = params.marketId;
  const queryClient = useQueryClient();
  const { token, isAuthenticated, user } = useAuth();
  const [pendingAdminAction, setPendingAdminAction] = useState<PendingAdminAction>(null);

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

  const closeMarketMutation = useMutation({
    mutationFn: () => apiClient.closeMarket(token!, marketId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['market', marketId] }),
        queryClient.invalidateQueries({ queryKey: ['markets'] }),
      ]);
    },
  });

  const resolveMarketMutation = useMutation({
    mutationFn: (winningSide: OutcomeSide) => apiClient.resolveMarket(token!, marketId, winningSide),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['market', marketId] }),
        queryClient.invalidateQueries({ queryKey: ['markets'] }),
      ]);
    },
  });

  const isAdmin = user?.role === 'ADMIN';
  const isAdminActionBusy = closeMarketMutation.isPending || resolveMarketMutation.isPending;
  const adminActionError = closeMarketMutation.error ?? resolveMarketMutation.error;
  const adminActionErrorMessage =
    adminActionError instanceof Error ? adminActionError.message : null;

  const onConfirmCloseMarket = (): void => {
    if (isAdminActionBusy) {
      return;
    }

    setPendingAdminAction(null);
    closeMarketMutation.mutate();
  };

  const onResolveSelection = (winningSide: OutcomeSide): void => {
    if (isAdminActionBusy) {
      return;
    }

    setPendingAdminAction(null);
    resolveMarketMutation.mutate(winningSide);
  };

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

          {isAdmin && token ? (
            <section className="mt-4 rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Operator controls</p>
              <p className="mt-1 text-sm text-tide">Manage this market lifecycle from the UI.</p>

              {marketQuery.data.status === 'OPEN' ? (
                <div className="mt-3">
                  {pendingAdminAction === 'close' ? (
                    <div className="rounded-md border border-ink/15 bg-foam p-3">
                      <p className="text-sm text-ink">
                        Close this market for new trading?
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={onConfirmCloseMarket}
                          disabled={isAdminActionBusy}
                          className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-foam disabled:opacity-60"
                        >
                          {closeMarketMutation.isPending ? 'Closing...' : 'Yes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingAdminAction(null)}
                          disabled={isAdminActionBusy}
                          className="rounded-md border border-ink/25 px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingAdminAction(null)}
                          disabled={isAdminActionBusy}
                          className="rounded-md border border-ink/25 px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingAdminAction('close')}
                      disabled={isAdminActionBusy}
                      className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-foam disabled:opacity-60"
                    >
                      Close market
                    </button>
                  )}
                </div>
              ) : null}

              {marketQuery.data.status === 'CLOSED' ? (
                <div className="mt-3">
                  {pendingAdminAction === 'resolve' ? (
                    <div className="rounded-md border border-ink/15 bg-foam p-3">
                      <p className="text-sm text-ink">Choose winning side:</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onResolveSelection('YES')}
                          disabled={isAdminActionBusy}
                          className="rounded-md bg-mint px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                        >
                          {resolveMarketMutation.isPending ? 'Resolving...' : 'Yes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onResolveSelection('NO')}
                          disabled={isAdminActionBusy}
                          className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                        >
                          {resolveMarketMutation.isPending ? 'Resolving...' : 'No'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingAdminAction(null)}
                          disabled={isAdminActionBusy}
                          className="rounded-md border border-ink/20 px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingAdminAction('resolve')}
                      disabled={isAdminActionBusy}
                      className="rounded-md bg-mint px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                    >
                      Resolve market
                    </button>
                  )}
                </div>
              ) : null}

              {marketQuery.data.status === 'RESOLVED' ? (
                <p className="mt-3 text-sm text-tide">
                  Market already resolved{marketQuery.data.resolvedOutcome ? `: ${marketQuery.data.resolvedOutcome}` : ''}.
                </p>
              ) : null}

              {adminActionErrorMessage ? (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {adminActionErrorMessage}
                </p>
              ) : null}
            </section>
          ) : null}
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