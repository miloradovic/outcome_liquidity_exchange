'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';

import { useAuth } from '@/components/providers/auth-provider';

export function TopNav(): ReactElement {
  const { isHydrated, isAuthenticated, user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-tide/20 bg-ink text-foam">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-black uppercase tracking-[0.24em] text-mint">
            OLX
          </Link>
          <nav className="flex items-center gap-3 text-sm text-foam/90">
            <Link href="/markets" className="hover:text-mint">
              Markets
            </Link>
            <Link href="/wallet" className="hover:text-mint">
              Wallet
            </Link>
            <Link href="/orders" className="hover:text-mint">
              My Orders
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {isHydrated && isAuthenticated ? (
            <>
              <span className="hidden text-foam/75 sm:inline">{user?.email}</span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md bg-mint px-3 py-1.5 font-semibold text-ink hover:bg-mint/90"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md border border-mint/40 px-3 py-1.5 font-semibold text-mint hover:bg-mint/10"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-mint px-3 py-1.5 font-semibold text-ink hover:bg-mint/90"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}