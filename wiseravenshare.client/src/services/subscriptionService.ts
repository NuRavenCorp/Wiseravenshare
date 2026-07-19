const apiBase = import.meta.env.VITE_API_URL || '';

function getAuthToken(): string | null {
  return localStorage.getItem('ws.accessToken') ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('wise-raven-token');
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

export const subscriptionService = {
  getSubscriptionStatus: () => request<SubscriptionStatus>('/api/billing/subscription', { method: 'GET' }),

  createCheckoutSession: (payload: { priceId: string; successUrl: string; cancelUrl: string }) =>
    request<{ sessionId: string; url: string }>('/api/billing/checkout-session', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createPortalSession: (payload: { returnUrl: string }) =>
    request<{ url: string }>('/api/billing/portal-session', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelSubscription: (cancelAtPeriodEnd = true) =>
    request<SubscriptionStatus>('/api/billing/subscription/cancel', {
      method: 'POST',
      body: JSON.stringify({ cancelAtPeriodEnd }),
    }),
};
