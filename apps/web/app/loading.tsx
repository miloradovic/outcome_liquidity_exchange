import type { ReactElement } from 'react';

export default function RootLoading(): ReactElement {
  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-6xl px-6 py-10">
      <div className="space-y-3">
        <div className="h-6 w-44 animate-pulse rounded bg-ink/10" />
        <div className="h-4 w-72 animate-pulse rounded bg-ink/10" />
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-xl border border-ink/10 bg-white" />
        <div className="h-40 animate-pulse rounded-xl border border-ink/10 bg-white" />
      </section>
    </main>
  );
}
