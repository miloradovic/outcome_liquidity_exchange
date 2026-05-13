'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/components/providers/auth-provider';

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage(): ReactElement {
  const router = useRouter();
  const { login, isAuthenticating, isHydrated, isAuthenticated } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace('/wallet');
    }
  }, [isHydrated, isAuthenticated, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await login(values);
      router.push('/wallet');
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        return;
      }

      setFormError('Login failed');
    }
  });

  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-lg px-6 py-16">
      <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-black text-ink">Welcome Back</h1>
        <p className="mt-2 text-sm text-tide">Sign in to access wallet, orders, and private balance updates.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-tide">
            Email
            <input
              type="email"
              {...register('email')}
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
            />
            {errors.email ? <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span> : null}
          </label>

          <label className="block text-sm font-semibold text-tide">
            Password
            <input
              type="password"
              {...register('password')}
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
            />
            {errors.password ? (
              <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>
            ) : null}
          </label>

          {formError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting || isAuthenticating}
            className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-foam disabled:opacity-60"
          >
            {isSubmitting || isAuthenticating ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-sm text-tide">
          No account yet?{' '}
          <Link href="/register" className="font-semibold text-ink underline">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}