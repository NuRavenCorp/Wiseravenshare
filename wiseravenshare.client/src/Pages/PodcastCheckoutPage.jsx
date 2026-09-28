import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './PodcastCheckoutPage.css';

const PodcastCheckoutPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState('growth_suite');
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
      monthlyPriceId: 'price_1U43yMGSLShTSiwXw25X6tAF',
      annualPriceId: 'price_1U43zuGSLShTSiwXdTTWzIwV',
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
      monthlyPriceId: 'price_1U4440GSLShTSiwXpvkfcoql',
      annualPriceId: 'price_1U445KGSLShTSiwX8taoEF7y',
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
      monthlyPriceId: 'price_1UKgrHGSLShTSiwXUne9ghm5',
      annualPriceId: 'price_1UKgseGSLShTSiwXg6aUMLpE',
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
    const session = searchParams.get('session_id');
    const cancelled = searchParams.get('cancelled');

    if (session) {
      showSuccessMessage('Payment successful! Features are unlocking...');
      setTimeout(() => navigate('/podcast-studio'), 2000);
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
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
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
