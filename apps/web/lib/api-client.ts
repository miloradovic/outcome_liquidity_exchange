import { API_BASE_URL } from './env';
import type {
  ApiErrorPayload,
  AuthResponse,
  DepositResponse,
  Market,
  Order,
  OrderBookView,
  OutcomeSide,
  UserProfile,
  Wallet,
  WalletEntry,
} from './types';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  token?: string;
  body?: unknown;
};

const REQUEST_TIMEOUT_MS = 10_000;

type RegisterPayload = {
  email: string;
  password: string;
  username: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type DepositPayload = {
  amountCents: number;
  idempotencyKey: string;
};

type PlaceOrderPayload = {
  marketId: string;
  side: OutcomeSide;
  priceCents: number;
  quantity: number;
  idempotencyKey: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function toMessage(payload: ApiErrorPayload | undefined, fallback: string): string {
  if (!payload) {
    return fallback;
  }

  if (Array.isArray(payload.message)) {
    return payload.message.join(', ');
  }

  return payload.message ?? payload.error ?? fallback;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 408);
    }

    throw new ApiError('Network request failed', 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let payload: ApiErrorPayload | undefined;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = undefined;
    }

    throw new ApiError(toMessage(payload, 'Request failed'), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  register(payload: RegisterPayload): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: payload,
    });
  },

  login(payload: LoginPayload): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: payload,
    });
  },

  getMe(token: string): Promise<UserProfile> {
    return apiRequest<UserProfile>('/me', {
      token,
    });
  },

  getWallet(token: string): Promise<Wallet> {
    return apiRequest<Wallet>('/wallet', {
      token,
    });
  },

  getWalletEntries(token: string): Promise<WalletEntry[]> {
    return apiRequest<WalletEntry[]>('/wallet/entries', {
      token,
    });
  },

  deposit(token: string, payload: DepositPayload): Promise<DepositResponse> {
    return apiRequest<DepositResponse>('/wallet/deposit', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  getMarkets(): Promise<Market[]> {
    return apiRequest<Market[]>('/markets');
  },

  getMarket(marketId: string): Promise<Market> {
    return apiRequest<Market>(`/markets/${marketId}`);
  },

  getOrderBook(marketId: string): Promise<OrderBookView> {
    return apiRequest<OrderBookView>(`/markets/${marketId}/order-book`);
  },

  placeOrder(token: string, payload: PlaceOrderPayload): Promise<Order> {
    return apiRequest<Order>('/orders', {
      method: 'POST',
      token,
      body: payload,
    });
  },

  cancelOrder(token: string, orderId: string): Promise<Order> {
    return apiRequest<Order>(`/orders/${orderId}`, {
      method: 'DELETE',
      token,
    });
  },

  getMyOrders(token: string): Promise<Order[]> {
    return apiRequest<Order[]>('/orders/me', {
      token,
    });
  },
};
