import Link from 'next/link';
import type { ReactElement } from 'react';

export default function HomePage(): ReactElement {
  return (
    <main className="min-h-screen bg-foam px-6 py-20 text-ink">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section className="flex flex-col gap-7">
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            Outcome Liquidity Exchange
          </h1>

          <p className="max-w-2xl text-lg leading-8 text-tide">
            Backend-first trading infrastructure, now with a thin browser experience for auth, wallet,
            markets, and orders. This UI runs at port 3001 while the API remains at port 3000.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/register"
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-foam hover:bg-tide"
            >
              Create account
            </Link>
            <Link
              href="/markets"
              className="rounded-md border border-ink/20 px-4 py-2 text-sm font-semibold text-ink hover:border-ink/40"
            >
              Browse markets
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-tide">Demo Flow</h2>
          <ol className="mt-4 space-y-3 text-sm text-tide">
            <li>1. Register or login</li>
            <li>2. Deposit demo funds</li>
            <li>3. Place YES or NO orders</li>
            <li>4. Watch order-book and balance updates</li>
          </ol>
        </section>
      </div>
    </main>
  );
}