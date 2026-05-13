import type { ReactElement } from 'react';

import type { TradeCreatedMessage } from '@/lib/realtime';
import type { OrderBookView } from '@/lib/types';

type OrderBookPanelProps = {
  isLoading: boolean;
  isError: boolean;
  data: OrderBookView | undefined;
  realtimeStatus: string;
  lastRealtimeAt: number | null;
  realtimeError: string | null;
  recentTrades: TradeCreatedMessage['data'][];
};

type OrderBookLevel = OrderBookView['yes'][number];

type OrderBookSideProps = {
  side: 'YES' | 'NO';
  prefix: 'yes' | 'no';
  levels: OrderBookLevel[];
};

function OrderBookSide({ side, prefix, levels }: OrderBookSideProps): ReactElement {
  return (
    <div className="rounded-md border border-ink/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-tide">{side}</p>
      {levels.length === 0 ? (
        <p className="mt-2 text-sm text-tide/70">No levels</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {levels.map((level) => (
            <li key={`${prefix}-${level.priceCents}`} className="flex justify-between">
              <span>{level.priceCents}c</span>
              <span>{level.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentTradesPanel({ recentTrades }: { recentTrades: TradeCreatedMessage['data'][] }): ReactElement {
  return (
    <div className="rounded-md border border-ink/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-tide">Recent Trades</p>
      {recentTrades.length === 0 ? (
        <p className="mt-2 text-sm text-tide/70">Waiting for trade-created events...</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm text-ink">
          {recentTrades.map((trade) => (
            <li
              key={trade.id}
              className="flex items-center justify-between gap-2 rounded bg-foam px-2 py-1.5"
            >
              <span className="font-semibold">
                YES {trade.yesPriceCents}c / NO {trade.noPriceCents}c
              </span>
              <span className="text-tide">Qty {trade.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrderBookPanel({
  isLoading,
  isError,
  data,
  realtimeStatus,
  lastRealtimeAt,
  realtimeError,
  recentTrades,
}: OrderBookPanelProps): ReactElement {
  return (
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

      {isLoading ? <p className="mt-4 text-sm text-tide">Loading order book...</p> : null}

      {isError ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Unable to load order book.</p>
      ) : null}

      {!isLoading && data ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <OrderBookSide side="YES" prefix="yes" levels={data.yes} />
            <OrderBookSide side="NO" prefix="no" levels={data.no} />
          </div>
          <RecentTradesPanel recentTrades={recentTrades} />
        </div>
      ) : null}
    </div>
  );
}
