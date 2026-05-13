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

const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters'),
    email: z.email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password must be at most 100 characters'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage(): ReactElement {
  const router = useRouter();
  const { register: registerUser, isAuthenticating, isHydrated, isAuthenticated } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
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
      await registerUser({
        username: values.username,
        email: values.email,
        password: values.password,
      });
      router.push('/wallet');
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        return;
      }

      setFormError('Registration failed');
    }
  });

  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-lg px-6 py-16">
      <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-black text-ink">Create Your Account</h1>
        <p className="mt-2 text-sm text-tide">Start with demo funds and trade binary YES/NO markets.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-tide">
            Username
            <input
              type="text"
              {...register('username')}
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
            />
            {errors.username ? (
              <span className="mt-1 block text-xs text-red-600">{errors.username.message}</span>
            ) : null}
          </label>

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

          <label className="block text-sm font-semibold text-tide">
            Confirm password
            <input
              type="password"
              {...register('confirmPassword')}
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
            />
            {errors.confirmPassword ? (
              <span className="mt-1 block text-xs text-red-600">{errors.confirmPassword.message}</span>
            ) : null}
          </label>

          {formError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting || isAuthenticating}
            className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-foam disabled:opacity-60"
          >
            {isSubmitting || isAuthenticating ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-sm text-tide">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-ink underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}