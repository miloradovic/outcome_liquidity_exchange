'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { apiClient } from '@/lib/api-client';

export default function MarketsPage(): ReactElement {
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: () => apiClient.getMarkets(),
  });

  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-6xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-ink">Markets</h1>
          <p className="mt-1 text-sm text-tide">Binary YES/NO markets from the existing API.</p>
        </div>
      </div>

      {marketsQuery.isLoading ? <p className="mt-6 text-sm text-tide">Loading markets...</p> : null}

      {marketsQuery.isError ? (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Unable to load markets. Check API availability.
        </p>
      ) : null}

      {!marketsQuery.isLoading && marketsQuery.data && marketsQuery.data.length === 0 ? (
        <p className="mt-6 text-sm text-tide">No markets available.</p>
      ) : null}

      {!marketsQuery.isLoading && marketsQuery.data && marketsQuery.data.length > 0 ? (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {marketsQuery.data.map((market) => (
            <li key={market.id} className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">{market.status}</p>
              <h2 className="mt-2 text-xl font-bold text-ink">{market.title}</h2>
              <p className="mt-1 text-xs text-tide/80">/{market.slug}</p>

              <div className="mt-4 flex items-center gap-2 text-xs text-tide">
                {market.outcomes.map((outcome) => (
                  <span key={outcome.id} className="rounded-full bg-mint/20 px-2 py-1 font-semibold text-tide">
                    {outcome.side}
                  </span>
                ))}
              </div>

              <Link
                href={`/markets/${market.id}`}
                className="mt-5 inline-flex rounded-md bg-ink px-3 py-2 text-sm font-semibold text-foam hover:bg-tide"
              >
                Open market
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}