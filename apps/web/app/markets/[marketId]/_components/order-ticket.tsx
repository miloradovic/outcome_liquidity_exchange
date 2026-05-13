'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiClient } from '@/lib/api-client';
import { createIdempotencyKey } from '@/lib/idempotency';

const placeOrderSchema = z.object({
  side: z.enum(['YES', 'NO']),
  priceCents: z.number().int().min(1).max(99),
  quantity: z.number().int().min(1),
});

type PlaceOrderFormValues = z.infer<typeof placeOrderSchema>;

type OrderTicketProps = {
  marketId: string;
  token: string | null;
  isAuthenticated: boolean;
};

export function OrderTicket({ marketId, token, isAuthenticated }: OrderTicketProps): ReactElement {
  const queryClient = useQueryClient();
  const [orderError, setOrderError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlaceOrderFormValues>({
    resolver: zodResolver(placeOrderSchema),
    defaultValues: {
      side: 'YES',
      priceCents: 50,
      quantity: 1,
    },
  });

  const orderMutation = useMutation({
    mutationFn: async (values: PlaceOrderFormValues) => {
      if (!token) {
        throw new Error('Please login first');
      }

      return apiClient.placeOrder(token, {
        marketId,
        side: values.side,
        priceCents: values.priceCents,
        quantity: values.quantity,
        idempotencyKey: createIdempotencyKey('order'),
      });
    },
    onSuccess: async () => {
      const invalidations: Array<Promise<unknown>> = [
        queryClient.invalidateQueries({ queryKey: ['order-book', marketId] }),
      ];

      if (token) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['orders', token] }));
      }

      await Promise.all(invalidations);
    },
  });

  const onPlaceOrder = handleSubmit(async (values: PlaceOrderFormValues) => {
    setOrderError(null);

    if (!isAuthenticated || !token) {
      setOrderError('Please login first');
      return;
    }

    try {
      await orderMutation.mutateAsync(values);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to place order';
      setOrderError(message);
    }
  });

  return (
    <aside className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Order Ticket</h2>

      {!isAuthenticated ? (
        <p className="mt-3 text-sm text-tide">
          Login to place an order.{' '}
          <Link href="/login" className="font-semibold text-ink underline">
            Go to login
          </Link>
        </p>
      ) : null}

      <form onSubmit={onPlaceOrder} className="mt-4 space-y-3">
        <label className="block text-sm font-semibold text-tide">
          Side
          <select
            {...register('side')}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        </label>

        <label className="block text-sm font-semibold text-tide">
          Price (cents)
          <input
            type="number"
            min="1"
            max="99"
            {...register('priceCents', { valueAsNumber: true })}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
          />
          {errors.priceCents ? (
            <span className="mt-1 block text-xs text-red-600">{errors.priceCents.message}</span>
          ) : null}
        </label>

        <label className="block text-sm font-semibold text-tide">
          Quantity
          <input
            type="number"
            min="1"
            {...register('quantity', { valueAsNumber: true })}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-2 outline-none focus:border-mint"
          />
          {errors.quantity ? (
            <span className="mt-1 block text-xs text-red-600">{errors.quantity.message}</span>
          ) : null}
        </label>

        {orderError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{orderError}</p> : null}

        <button
          type="submit"
          disabled={!isAuthenticated || isSubmitting || orderMutation.isPending}
          className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-foam disabled:opacity-60"
        >
          {orderMutation.isPending ? 'Placing order...' : 'Place order'}
        </button>
      </form>
    </aside>
  );
}
