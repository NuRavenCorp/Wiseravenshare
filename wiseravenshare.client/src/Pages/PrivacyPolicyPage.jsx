import React from 'react';

const Section = ({ title, children }) => (
    <section style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-color)', marginBottom: '8px' }}>{title}</h2>
        <div style={{ color: 'var(--light-color)', lineHeight: 1.7, fontSize: '14px' }}>{children}</div>
    </section>
);

const PrivacyPolicyPage = ({ onBack }) => (
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
            Privacy Policy
        </h1>
        <p style={{ color: 'var(--light-color)', fontSize: '13px', marginBottom: '28px' }}>
            Effective date: August 4, 2026 &nbsp;·&nbsp; wise-ravens.com
        </p>

        <Section title="1. Who We Are">
            Wise-Ravens.com ("we", "us", or "our") is a social media and news intelligence platform operated by
            NuRaven Corp. You can reach our privacy team at{' '}
            <a href="mailto:privacy@wise-ravens.com" style={{ color: 'var(--highlight-color)' }}>
                privacy@wise-ravens.com
            </a>.
        </Section>

        <Section title="2. Information We Collect">
            <p style={{ marginBottom: '8px' }}>We collect information you provide directly and information generated through your use of the platform:</p>
            <ul style={{ paddingLeft: '20px', marginBottom: '0' }}>
                <li style={{ marginBottom: '6px' }}><strong>Account data</strong> — name, email address, password (stored as a secure hash), optional profile photo, bio, and location.</li>
                <li style={{ marginBottom: '6px' }}><strong>Content you create</strong> — posts, comments, messages, bookmarks, media uploads, and planner entries.</li>
                <li style={{ marginBottom: '6px' }}><strong>Usage data</strong> — pages visited, features used, search queries, clicks, and session duration.</li>
                <li style={{ marginBottom: '6px' }}><strong>Device &amp; connection data</strong> — IP address, browser type, operating system, and time zone.</li>
                <li><strong>Payment data</strong> — if you subscribe to a paid plan, payment is processed by Stripe. We store only your subscription status; full card details are never held by us.</li>
            </ul>
        </Section>

        <Section title="3. How We Use Your Information">
            <ul style={{ paddingLeft: '20px' }}>
                <li style={{ marginBottom: '6px' }}>Provide, maintain, and improve the platform and its features.</li>
                <li style={{ marginBottom: '6px' }}>Authenticate your identity and keep your account secure.</li>
                <li style={{ marginBottom: '6px' }}>Personalize your feed, Truth Seeker results, and AI News summaries.</li>
                <li style={{ marginBottom: '6px' }}>Process subscription payments and manage billing.</li>
                <li style={{ marginBottom: '6px' }}>Send service-related notifications (security alerts, reminders you configure).</li>
                <li style={{ marginBottom: '6px' }}>Detect and prevent abuse, spam, and illegal activity.</li>
                <li>Comply with applicable laws and legal obligations.</li>
            </ul>
        </Section>

        <Section title="4. Sharing Your Information">
            <p style={{ marginBottom: '8px' }}>We do not sell your personal data. We share information only in these circumstances:</p>
            <ul style={{ paddingLeft: '20px' }}>
                <li style={{ marginBottom: '6px' }}><strong>Service providers</strong> — cloud hosting (DigitalOcean), payment processing (Stripe), and email delivery (SMTP provider). Each is bound by a data processing agreement.</li>
                <li style={{ marginBottom: '6px' }}><strong>Advertising partners</strong> — we display Google AdSense ads. Google may collect data about your visit per its own privacy policy at <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--highlight-color)' }}>policies.google.com/privacy</a>.</li>
                <li style={{ marginBottom: '6px' }}><strong>Legal requirements</strong> — when required by law, court order, or to protect the rights and safety of our users.</li>
                <li><strong>Business transfers</strong> — in the event of a merger, acquisition, or sale of assets, user data may be transferred as part of that transaction.</li>
            </ul>
        </Section>

        <Section title="5. Cookies and Tracking">
            We use browser local storage and session cookies to keep you signed in and remember your preferences.
            Google AdSense and analytics services may also set third-party cookies on your device.
            You can disable cookies in your browser settings; some features may not function correctly without them.
        </Section>

        <Section title="6. Data Retention">
            We retain your account data for as long as your account is active. If you delete your account we will
            remove your personal data within 30 days, except where retention is required by law or for fraud-prevention purposes.
            Aggregated, anonymised analytics data may be kept indefinitely.
        </Section>

        <Section title="7. Your Rights">
            <p style={{ marginBottom: '8px' }}>Depending on your jurisdiction you may have the right to:</p>
            <ul style={{ paddingLeft: '20px' }}>
                <li style={{ marginBottom: '6px' }}><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
                <li style={{ marginBottom: '6px' }}><strong>Correction</strong> — ask us to correct inaccurate data.</li>
                <li style={{ marginBottom: '6px' }}><strong>Deletion</strong> — request deletion of your personal data ("right to be forgotten").</li>
                <li style={{ marginBottom: '6px' }}><strong>Portability</strong> — receive your data in a structured, machine-readable format.</li>
                <li><strong>Objection / restriction</strong> — object to or restrict certain processing activities.</li>
            </ul>
            <p style={{ marginTop: '8px' }}>
                To exercise any of these rights, email{' '}
                <a href="mailto:privacy@wise-ravens.com" style={{ color: 'var(--highlight-color)' }}>
                    privacy@wise-ravens.com
                </a>.
                We will respond within 30 days.
            </p>
        </Section>

        <Section title="8. Children's Privacy">
            Wise-Ravens.com is not directed at children under the age of 13. We do not knowingly collect personal
            information from children. If you believe a child has provided us with personal information, please
            contact us and we will promptly delete it.
        </Section>

        <Section title="9. Security">
            We use industry-standard measures including TLS encryption in transit, hashed password storage, and
            access controls to protect your data. No method of transmission over the internet is 100% secure, however,
            and we cannot guarantee absolute security.
        </Section>

        <Section title="10. Third-Party Links">
            The platform may contain links to external websites. We are not responsible for the privacy practices
            of those sites and encourage you to review their policies before providing any information.
        </Section>

        <Section title="11. Changes to This Policy">
            We may update this Privacy Policy from time to time. Material changes will be communicated via an
            in-app notice or email at least 7 days before they take effect. The "Effective date" at the top of this
            page will always reflect the current version.
        </Section>

        <Section title="12. Contact Us">
            For privacy questions or concerns, contact us at{' '}
            <a href="mailto:privacy@wise-ravens.com" style={{ color: 'var(--highlight-color)' }}>
                privacy@wise-ravens.com
            </a>{' '}
            or write to NuRaven Corp, wise-ravens.com.
        </Section>

        <p style={{ fontSize: '12px', color: 'var(--light-color)', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
            © {new Date().getFullYear()} NuRaven Corp · wise-ravens.com
        </p>
    </div>
);

export default PrivacyPolicyPage;
