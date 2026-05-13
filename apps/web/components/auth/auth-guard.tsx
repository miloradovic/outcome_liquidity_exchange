'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';
import { useEffect } from 'react';

import { useAuth } from '@/components/providers/auth-provider';

type AuthGuardProps = {
  children: ReactNode;
  redirectTo?: string;
};

export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps): ReactElement | null {
  const router = useRouter();
  const { isHydrated, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isHydrated, isAuthenticated, redirectTo, router]);

  if (!isHydrated) {
    return <p className="px-6 py-10 text-sm text-tide/80">Restoring session...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}