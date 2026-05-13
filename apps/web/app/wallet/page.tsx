'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AuthGuard } from '@/components/auth/auth-guard';
import { useAuth } from '@/components/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { createIdempotencyKey } from '@/lib/idempotency';
import { dollarsToCents, formatCents } from '@/lib/money';
import { createBalanceSocket, type BalanceUpdateMessage } from '@/lib/realtime';
import type { Wallet } from '@/lib/types';

const depositSchema = z.object({
  amountUsd: z
    .string()
    .trim()
    .min(1, 'Enter amount in USD')
    .refine((value) => dollarsToCents(value) > 0, 'Enter a valid positive amount'),
});

type DepositFormValues = z.infer<typeof depositSchema>;

function WalletContent(): ReactElement {
  const queryClient = useQueryClient();
  const { token, user } = useAuth();
  const [depositError, setDepositError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [lastRealtimeAt, setLastRealtimeAt] = useState<number | null>(null);

  const walletQuery = useQuery({
    queryKey: ['wallet', token],
    queryFn: () => apiClient.getWallet(token!),
    enabled: Boolean(token),
  });

  const entriesQuery = useQuery({
    queryKey: ['wallet-entries', token],
    queryFn: () => apiClient.getWalletEntries(token!),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = createBalanceSocket();

    const authenticate = () => {
      setIsRealtimeConnected(true);
      setReconnectAttempt(0);
      setRealtimeError(null);
      socket.emit('authenticate', { token }, (response?: { status?: string }) => {
        if (response?.status && response.status !== 'authenticated') {
          setIsRealtimeConnected(false);
          setRealtimeError('Balance socket authentication failed');
        }
      });
    };

    const handleDisconnect = () => {
      setIsRealtimeConnected(false);
    };

    const handleConnectError = (error: Error) => {
      setRealtimeError(error.message || 'Realtime connection failed');
    };

    const handleReconnectAttempt = (attempt: number) => {
      setReconnectAttempt(attempt);
    };

    const handleBalanceUpdate = (message: BalanceUpdateMessage) => {
      if (user && message.userId !== user.id) {
        return;
      }

      queryClient.setQueryData<Wallet | undefined>(['wallet', token], (currentWallet) => {
        if (!currentWallet) {
          return currentWallet;
        }

        return {
          ...currentWallet,
          availableBalanceCents: message.data.availableBalanceCents,
          reservedBalanceCents: message.data.reservedBalanceCents,
        };
      });
      setLastRealtimeAt(message.timestamp);
    };

    socket.on('connect', authenticate);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('balance-update', handleBalanceUpdate);

    socket.connect();
    if (socket.connected) {
      authenticate();
    }

    return () => {
      socket.off('connect', authenticate);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('balance-update', handleBalanceUpdate);
      socket.disconnect();
    };
  }, [queryClient, token, user]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DepositFormValues>({
    resolver: zodResolver(depositSchema),
    defaultValues: {
      amountUsd: '1000.00',
    },
  });

  const depositMutation = useMutation({
    mutationFn: async (values: DepositFormValues) => {
      const amountCents = dollarsToCents(values.amountUsd);
      if (amountCents <= 0) {
        throw new Error('Invalid amount');
      }

      return apiClient.deposit(token!, {
        amountCents,
        idempotencyKey: createIdempotencyKey('deposit'),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', token] }),
        queryClient.invalidateQueries({ queryKey: ['wallet-entries', token] }),
      ]);
      reset({ amountUsd: '1000.00' });
    },
  });

  const onDeposit = handleSubmit(async (values) => {
    setDepositError(null);
    try {
      await depositMutation.mutateAsync(values);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Deposit failed';
      setDepositError(message);
    }
  });

  const totalBalance = useMemo(() => {
    const wallet = walletQuery.data;
    if (!wallet) {
      return 0;
    }

    return wallet.availableBalanceCents + wallet.reservedBalanceCents;
  }, [walletQuery.data]);

  const realtimeStatus = isRealtimeConnected
    ? 'connected'
    : reconnectAttempt > 0
      ? `reconnecting (${reconnectAttempt})`
      : 'offline';

  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-black text-ink">Wallet</h1>
      <p className="mt-1 text-sm text-tide">
        Private balance stream: {realtimeStatus}
        {lastRealtimeAt ? ` - updated ${new Date(lastRealtimeAt).toLocaleTimeString()}` : ''}
      </p>
      {realtimeError ? (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Realtime notice: {realtimeError}
        </p>
      ) : null}

      {walletQuery.isLoading ? <p className="mt-4 text-sm text-tide">Loading wallet balances...</p> : null}

      {walletQuery.isError ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Unable to load wallet balances.
        </p>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Total</p>
          <p className="mt-2 text-2xl font-black text-ink">{formatCents(totalBalance)}</p>
        </article>

        <article className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Available</p>
          <p className="mt-2 text-2xl font-black text-ink">
            {formatCents(walletQuery.data?.availableBalanceCents ?? 0)}
          </p>
        </article>

        <article className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Reserved</p>
          <p className="mt-2 text-2xl font-black text-ink">
            {formatCents(walletQuery.data?.reservedBalanceCents ?? 0)}
          </p>
        </article>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Deposit Demo Funds</h2>
          <p className="mt-1 text-sm text-tide">Amount in USD. Backend records cents and idempotency key.</p>

          <form onSubmit={onDeposit} className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-tide">
              Amount (USD)
              <input
                type="number"
                min="0.01"
                step="0.01"
                {...register('amountUsd')}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
              />
              {errors.amountUsd ? (
                <span className="mt-1 block text-xs text-red-600">{errors.amountUsd.message}</span>
              ) : null}
            </label>

            {depositError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{depositError}</p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || depositMutation.isPending}
              className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-foam disabled:opacity-60"
            >
              {isSubmitting || depositMutation.isPending ? 'Depositing...' : 'Deposit'}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Latest Wallet Entries</h2>
          {entriesQuery.isLoading ? <p className="mt-4 text-sm text-tide">Loading entries...</p> : null}

          {entriesQuery.isError ? (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Unable to load wallet entries.
            </p>
          ) : null}

          {!entriesQuery.isLoading && entriesQuery.data && entriesQuery.data.length === 0 ? (
            <p className="mt-4 text-sm text-tide">No wallet entries yet.</p>
          ) : null}

          {!entriesQuery.isLoading && entriesQuery.data && entriesQuery.data.length > 0 ? (
            <ul className="mt-4 divide-y divide-ink/10">
              {entriesQuery.data.map((entry) => (
                <li key={entry.id} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{entry.entryType}</p>
                    <p className="text-xs text-tide/80">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="text-sm font-bold text-ink">{formatCents(entry.amountCents)}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function WalletPage(): ReactElement {
  return (
    <AuthGuard>
      <WalletContent />
    </AuthGuard>
  );
}