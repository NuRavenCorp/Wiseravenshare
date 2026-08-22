import React from 'react';

const Section = ({ title, children }) => (
    <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-color)', marginBottom: '8px' }}>{title}</h2>
        <div style={{ color: 'var(--light-color)', lineHeight: 1.7, fontSize: '14px' }}>{children}</div>
    </section>
);

const TermsOfServicePage = ({ onBack }) => (
    <div style={{
        maxWidth: '740px',
        margin: '0 auto',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        padding: '32px 36px'
    }}>
        {onBack && (
            <button
                onClick={onBack}
                style={{
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--light-color)',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    marginBottom: '24px'
                }}
            >
                ← Back
            </button>
        )}

        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-color)' }}>
            Terms of Service
        </h1>
        <p style={{ color: 'var(--light-color)', fontSize: '13px', marginBottom: '28px' }}>
            Effective date: August 4, 2026 &nbsp;·&nbsp; wise-ravens.com/terms
        </p>

        <Section title="1. Agreement to Terms">
            By accessing or using Wise-Ravens.com ("WiseRaven Share", "Ravensight", "we", "us", or "our"), operated by NuRaven Corp, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.
        </Section>

        <Section title="2. Account Registration">
            You must provide accurate information when creating an account. You are responsible for safeguarding your account credentials and for all activities that occur under your account.
        </Section>

        <Section title="3. User Content & Ownership">
            You retain ownership of all content, media, and artwork you create or upload to WiseRaven Share or Ravensight Studio. By posting or streaming content, you grant us a non-exclusive license to host, display, and distribute that content as required to operate the service.
        </Section>

        <Section title="4. Third-Party Social Media Integrations">
            WiseRaven Share provides integration with third-party social platforms including Facebook, Instagram, TikTok, YouTube, Twitter/X, and LinkedIn. Your use of these integrated features is subject to the respective terms and policies of each platform (e.g., Meta Terms of Service, YouTube Terms of Service).
        </Section>

        <Section title="5. Acceptable Use">
            You agree not to use the platform to transmit unlawful, harmful, defamatory, or deceptive content, or to attempt unauthorized access to our systems, servers, or other users' accounts.
        </Section>

        <Section title="6. Subscriptions & Payments">
            Paid subscription tiers and premium features are billed through Stripe. Subscription fees are charged on a recurring basis until cancelled. You may cancel your subscription at any time through your account settings.
        </Section>

        <Section title="7. Contact & Legal Notices">
            For questions regarding these Terms of Service, contact us at{' '}
            <a href="mailto:legal@wise-ravens.com" style={{ color: 'var(--highlight-color)' }}>
                legal@wise-ravens.com
            </a>{' '}
            or write to NuRaven Corp, wise-ravens.com.
        </Section>

        <p style={{ fontSize: '12px', color: 'var(--light-color)', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
            © {new Date().getFullYear()} NuRaven Corp · wise-ravens.com/terms
        </p>
    </div>
);

export default TermsOfServicePage;
