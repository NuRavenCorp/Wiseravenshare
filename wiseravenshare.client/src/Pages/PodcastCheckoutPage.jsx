import React, { useState, useEffect } from 'react';
import './PodcastCheckoutPage.css';

const PLAN_PAYMENT_LINKS = {
  growth_suite: {
    monthly: 'https://buy.stripe.com/test_aFa8wQc2K6CZ1NC1yO5ZC07',
    annual: 'https://buy.stripe.com/test_dRmfZic2K0eB4ZOfpE5ZC08'
  },
  studio_plus: {
    monthly: 'https://buy.stripe.com/test_6oU4gAfeW5yVdwkelA5ZC09',
    annual: 'https://buy.stripe.com/test_28EcN6c2K8L7gIw2CS5ZC0a'
  },
  podcast_pro: {
    monthly: 'https://buy.stripe.com/test_bJebJ2eaS8L7fEs0uK5ZC0b',
    annual: 'https://buy.stripe.com/test_3cIbJ2d6Of9veAo2CS5ZC0c'
  }
};

const redirectToPaymentLink = (planId, cycle) => {
  const normalizedPlan = String(planId || '').trim().toLowerCase();
  const billingCycle = String(cycle || 'monthly').toLowerCase() === 'annual' ? 'annual' : 'monthly';
  const link = PLAN_PAYMENT_LINKS[normalizedPlan]?.[billingCycle] || '';

  if (!link) {
    return false;
  }

  window.location.href = link;
  return true;
};

const PodcastCheckoutPage = ({ onNavigate, initialPlan }) => {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState(initialPlan || 'growth_suite');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState([]);

  const plans = {
    growth_suite: {
      id: 'growth_suite',
      name: 'WRS Growth Suite',
      tagline: 'Analytics, audience insights, trending content',
      features: [
        'Growth analytics & trending content dashboard',
        'Audience sentiment tracking across platforms',
        '30-day performance history',
        'Topic recommendations based on trends',
        'Monthly download reports'
      ],
      monthlyPrice: 39,
      annualPrice: 390,
      monthlyPriceId: 'price_1UCjXjK4zW843WGui7qNCPPC',
      annualPriceId: 'price_1UCjXEK4zW843WGuVAfHpHuK',
      trialDays: 14,
      badge: 'Best for growth',
      color: '#6366f1'
    },
    studio_plus: {
      id: 'studio_plus',
      name: 'WRS Studio Plus',
      tagline: 'Team workflows, collaboration, role-based editing',
      features: [
        'Everything in Growth Suite',
        'Team review workflows (unlimited reviewers)',
        'Assignment & approval chains',
        'Permission-based editing roles',
        'Team member analytics & activity logs',
        'Multi-role simultaneous editing',
        'Team workspace with shared assets'
      ],
      monthlyPrice: 79,
      annualPrice: 790,
      monthlyPriceId: 'price_1UCjVuK4zW843WGuq7fhuyjh',
      annualPriceId: 'price_1UCjV2K4zW843WGuLyklflF8',
      trialDays: 7,
      badge: 'For teams',
      color: '#8b5cf6'
    },
    podcast_pro: {
      id: 'podcast_pro',
      name: 'WRS Podcast Pro Bundle',
      tagline: 'Full studio + Growth + Studio Plus + priority support',
      features: [
        'Everything in Growth Suite',
        'Everything in Studio Plus',
        '24/7 priority email support',
        'Monthly strategy calls with our team',
        'Custom episode templates',
        'Advanced analytics export'
      ],
      monthlyPrice: 149,
      annualPrice: 1490,
      monthlyPriceId: 'price_1UKhbdK4zW843WGusq2WmkmY',
      annualPriceId: 'price_1UKhbgK4zW843WGuWtDANdOH',
      trialDays: 30,
      badge: 'Best value',
      color: '#ec4899'
    }
  };

  useEffect(() => {
    fetchCatalog();
    checkRedirectStatus();
  }, []);

  const checkRedirectStatus = () => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session_id');
    const cancelled = params.get('cancelled');

    if (session) {
      showSuccessMessage('Payment successful! Features are unlocking...');
      setTimeout(() => {
        window.location.href = '/?page=podcast-studio';
      }, 2000);
    }

    if (cancelled) {
      setError('Checkout cancelled. Please try again.');
    }
  };

  const fetchCatalog = async () => {
    try {
      const response = await fetch('/api/payments/catalog');
      if (response.ok) {
        const data = await response.json();
        setCatalog(data.plans || []);
      }
    } catch (err) {
      console.warn('Could not fetch catalog, using local defaults');
    }
  };

  const showSuccessMessage = (message) => {
    const msgEl = document.createElement('div');
    msgEl.className = 'checkout-success-message';
    msgEl.textContent = message;
    document.body.appendChild(msgEl);
    setTimeout(() => msgEl.remove(), 3000);
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      const plan = plans[selectedPlan];
      if (!plan) {
        throw new Error('Invalid plan selected');
      }

      const priceId = billingCycle === 'annual' 
        ? plan.annualPriceId
        : plan.monthlyPriceId;

      const response = await fetch('/api/payments/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          billingCycle: billingCycle,
          priceId: priceId,
          successUrl: `${window.location.origin}/podcast-checkout?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/podcast-checkout?cancelled=true`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create checkout session');
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        const redirected = redirectToPaymentLink(selectedPlan, billingCycle);
        if (!redirected) {
          throw new Error('No checkout URL returned');
        }
      }
    } catch (err) {
      const redirected = redirectToPaymentLink(selectedPlan, billingCycle);
      if (!redirected) {
        setError(err.message || 'An error occurred. Please try again.');
      }
      console.error('Checkout error:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentPlan = plans[selectedPlan];
  const price = billingCycle === 'annual' 
    ? currentPlan.annualPrice 
    : currentPlan.monthlyPrice;
  const annualSavings = Math.round((currentPlan.monthlyPrice * 12 - currentPlan.annualPrice) / currentPlan.monthlyPrice);

  return (
    <div className="podcast-checkout-page">
      <div className="checkout-container">
        <div className="checkout-header">
          {onNavigate && (
            <button
              onClick={() => onNavigate('ravensight')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--light-color)', fontSize: '13px', padding: '0 0 12px 0',
                display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.75
              }}
            >
              ← Back to Podcast Studio
            </button>
          )}
          <h1>Podcast Studio Plans</h1>
          <p>Choose your tier and start your free trial today — no credit card required</p>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="billing-toggle">
          <button
            className={`toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
            onClick={() => setBillingCycle('monthly')}
          >
            Monthly
          </button>
          <button
            className={`toggle-btn ${billingCycle === 'annual' ? 'active' : ''}`}
            onClick={() => setBillingCycle('annual')}
          >
            Annual
            {billingCycle === 'annual' && <span className="savings">Save {annualSavings}%</span>}
          </button>
        </div>

        {/* Plans Grid */}
        <div className="plans-grid">
          {Object.entries(plans).map(([key, plan]) => (
            <div
              key={key}
              className={`plan-card ${selectedPlan === key ? 'selected' : ''}`}
              onClick={() => setSelectedPlan(key)}
              style={{ borderColor: selectedPlan === key ? plan.color : '#e5e7eb' }}
            >
              <div className="plan-header" style={{ backgroundColor: plan.color + '10', borderLeft: `4px solid ${plan.color}` }}>
                <h3>{plan.name}</h3>
                <span className="badge" style={{ backgroundColor: plan.color + '20', color: plan.color }}>
                  {plan.badge}
                </span>
                <p className="tagline">{plan.tagline}</p>
              </div>

              <div className="plan-pricing">
                <div className="price">
                  <span className="amount">${price.toFixed(0)}</span>
                  <span className="period">/{billingCycle === 'annual' ? 'year' : 'month'}</span>
                </div>
                <p className="trial-info">
                  Try {plan.trialDays} days free — no credit card required
                </p>
              </div>

              <div className="plan-features">
                <ul>
                  {plan.features.map((feature, idx) => (
                    <li key={idx}>
                      <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                className={`plan-button ${selectedPlan === key ? 'selected-btn' : ''}`}
                style={{
                  backgroundColor: selectedPlan === key ? plan.color : '#f3f4f6',
                  color: selectedPlan === key ? 'white' : '#374151'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlan(key);
                }}
              >
                {selectedPlan === key ? 'Selected' : 'Choose Plan'}
              </button>
            </div>
          ))}
        </div>

        {/* Checkout Section */}
        <div className="checkout-section">
          <div className="checkout-summary">
            <h3>Order Summary</h3>
            <div className="summary-item">
              <span>{currentPlan.name}</span>
              <span>${price.toFixed(0)}/{billingCycle === 'annual' ? 'year' : 'month'}</span>
            </div>
            <div className="summary-item highlight">
              <span>Trial Period</span>
              <span>{currentPlan.trialDays} days free</span>
            </div>
            <div className="summary-total">
              <span>Today's charge:</span>
              <span className="free-text">$0 (Trial)</span>
            </div>
            <p className="summary-note">
              Your first billing cycle will start after your {currentPlan.trialDays}-day trial ends.
            </p>
          </div>

          {error && (
            <div className="error-message">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            className="checkout-button"
            onClick={handleCheckout}
            disabled={loading}
            style={{ backgroundColor: currentPlan.color }}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              `Start ${currentPlan.trialDays}-day free trial`
            )}
          </button>

          <p className="checkout-note">
            You'll be taken to Stripe's secure checkout. Your payment information is safe and encrypted.
          </p>
        </div>

        {/* FAQ Section */}
        <div className="faq-section">
          <h3>Frequently Asked Questions</h3>
          <div className="faq-items">
            <div className="faq-item">
              <h4>Do you charge during the trial?</h4>
              <p>No. We'll only charge you after your trial period ends. You can cancel anytime before then at no cost.</p>
            </div>
            <div className="faq-item">
              <h4>Can I switch plans?</h4>
              <p>Yes! You can upgrade, downgrade, or cancel your subscription anytime from your billing settings.</p>
            </div>
            <div className="faq-item">
              <h4>What payment methods do you accept?</h4>
              <p>We accept all major credit cards (Visa, Mastercard, American Express, Discover) via Stripe.</p>
            </div>
            <div className="faq-item">
              <h4>How do I get support?</h4>
              <p>Studio Plus and Podcast Pro Bundle subscribers get priority support. Contact our team at support@wiseravenshare.com</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PodcastCheckoutPage;
