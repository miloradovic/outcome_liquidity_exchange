'use client';

import type { ReactElement } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps): ReactElement {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-16">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-2xl font-black text-red-900">Application error</h1>
            <p className="mt-2 text-sm text-red-800">
              A global rendering error occurred. Retry once, then refresh if it persists.
            </p>
            <p className="mt-3 rounded bg-white/70 px-3 py-2 font-mono text-xs text-red-900">
              {error.message}
            </p>

            <button
              type="button"
              onClick={reset}
              className="mt-5 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
