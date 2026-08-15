import { getAuthToken as getSharedAuthToken } from './authStorage.js';

const normalizeApiBase = (value: string) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) {
    return '';
  }

  return /\/api$/i.test(raw) ? raw.replace(/\/api$/i, '') : raw;
};

const apiBase = normalizeApiBase(String(import.meta.env.VITE_API_URL || ''));

function getAuthToken(): string | null {
  return getSharedAuthToken();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.message === 'string' && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // Keep default message when body is not JSON.
    }

    throw new Error(message);
  }

  return response.json();
}

export type SubscriptionStatus = {
  hasActiveSubscription: boolean;
  status: string;
  priceId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export type CatalogPrice = {
  priceId: string;
  configured: boolean;
  amountUsd: number;
};

export type CatalogPlan = {
  planId: string;
  name: string;
  tagline: string;
  badge: string;
  monthly: CatalogPrice;
  annual: CatalogPrice;
};

export type ProductCatalogResponse = {
  source: string;
  plans: CatalogPlan[];
};

export const subscriptionService = {
  getSubscriptionStatus: () => request<SubscriptionStatus>('/api/billing/subscription', { method: 'GET' }),

  getProductCatalog: () => request<ProductCatalogResponse>('/api/payments/catalog', { method: 'GET' }),

  createCheckoutSession: (payload: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    plan?: string;
    billingCycle?: 'monthly' | 'annual';
  }) =>
    request<{ sessionId: string; url: string }>('/api/billing/checkout-session', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createPortalSession: (payload: { returnUrl: string }) =>
    request<{ url: string }>('/api/billing/portal-session', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
