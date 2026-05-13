'use client';

import type { ReactElement } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps): ReactElement {
  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-2xl px-6 py-16">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-black text-red-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-red-800">
          The page hit an unexpected error. You can retry without losing your session.
        </p>
        <p className="mt-3 rounded bg-white/70 px-3 py-2 font-mono text-xs text-red-900">{error.message}</p>

        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
