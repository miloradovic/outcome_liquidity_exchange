'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { useAuth } from '@/components/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import type { Order } from '@/lib/types';

function OrdersContent(): ReactElement {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['orders', token],
    queryFn: () => apiClient.getMyOrders(token!),
    enabled: Boolean(token),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.cancelOrder(token!, orderId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', token] });
    },
  });

  const onCancelOrder = async (orderId: string): Promise<void> => {
    setCancelError(null);
    setCancellingOrderId(orderId);

    try {
      await cancelMutation.mutateAsync(orderId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to cancel order';
      setCancelError(message);
    } finally {
      setCancellingOrderId(null);
    }
  };

  return (
    <main className="mx-auto min-h-[calc(100vh-60px)] w-full max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-black text-ink">My Orders</h1>
      <p className="mt-1 text-sm text-tide">Open and historical orders for the authenticated user.</p>

      {ordersQuery.isLoading ? <p className="mt-6 text-sm text-tide">Loading orders...</p> : null}

      {ordersQuery.isError ? (
        <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Unable to load orders.
        </p>
      ) : null}

      {cancelError ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{cancelError}</p>
      ) : null}

      {!ordersQuery.isLoading && ordersQuery.data && ordersQuery.data.length === 0 ? (
        <p className="mt-6 text-sm text-tide">No orders yet.</p>
      ) : null}

      {!ordersQuery.isLoading && ordersQuery.data && ordersQuery.data.length > 0 ? (
        <ul className="mt-6 divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white px-5 shadow-sm">
          {ordersQuery.data.map((order: Order) => (
            <li key={order.id} className="grid grid-cols-[1fr_auto] gap-4 py-4">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {order.side} @ {order.priceCents}c x {order.quantity}
                </p>
                <p className="text-xs text-tide/80">
                  {order.status} - {new Date(order.createdAt).toLocaleString()}
                </p>
              </div>

              {order.status === 'OPEN' ? (
                <button
                  type="button"
                  onClick={() => void onCancelOrder(order.id)}
                  disabled={cancelMutation.isPending}
                  className="rounded-md border border-red-300 px-3 py-1 text-sm font-semibold text-red-700 disabled:opacity-60"
                >
                  {cancelMutation.isPending && cancellingOrderId === order.id ? 'Cancelling...' : 'Cancel'}
                </button>
              ) : (
                <span className="text-xs text-tide/70">{order.status}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

export default function OrdersPage(): ReactElement {
  return (
    <AuthGuard>
      <OrdersContent />
    </AuthGuard>
  );
}