import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";

const EFFECTIVE_DATE = "October 13, 2026";
const CONTACT_EMAIL = "legal@wiseravenshare.com";

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" subtitle="The rules and expectations for using WiseRavenShare." lastUpdated={EFFECTIVE_DATE}>
      <LegalSection title="1. Acceptance of Terms">
        <p>
          These Terms of Service ("Terms") govern your access to and use of WiseRavenShare (the "Platform"). By creating an
          account or using any feature, you agree to be bound by these Terms and our Privacy Policy. If you do not agree,
          do not use the Platform.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility and Accounts">
        <p>
          You must be at least 13 years old (or the minimum age of digital consent in your jurisdiction) to create an
          account. You agree to provide accurate information, keep your credentials secure, and be responsible for all
          activity under your account. Administrators are admitted through an invite-based approval process and require an
          admin-prefixed user identifier.
        </p>
      </LegalSection>

      <LegalSection title="3. User Content">
        <p>
          You retain ownership of content you create and upload, including posts, media, music, podcasts, and comments. By
          publishing content on the Platform, you grant WiseRavenShare a worldwide, non-exclusive, royalty-free license to
          host, store, reproduce, display, and distribute that content solely to operate and promote the Platform features
          you use.
        </p>
        <p>You represent and warrant that your content:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Does not infringe the intellectual property or privacy rights of others.</li>
          <li>Is lawful and does not violate any applicable law or regulation.</li>
          <li>Does not contain malware, spyware, or harmful code.</li>
        </ul>
        <p>
          You are solely responsible for your content. We may remove content or restrict access that violates these Terms
          or applicable law.
        </p>
      </LegalSection>

      <LegalSection title="4. Truth Scoring and Content Verification">
        <p>
          The Platform provides AI-assisted truth scores and verification indicators on content. These outputs are
          automated assessments based on available signals and do not constitute a factual determination, legal opinion,
          or endorsement. Truth scores may be challenged through the community challenge workflow. We are not liable for
          the accuracy or consequences of any truth score or verification status.
        </p>
      </LegalSection>

      <LegalSection title="5. Creator Rewards and WiseCoins">
        <p>
          WiseRavenShare may award WiseCoins and other rewards for participation, productivity, and value creation. Reward
          amounts, eligibility, and categories are determined at our discretion and may change. WiseCoins have no cash
          value unless explicitly stated and may be revoked for fraudulent activity or violations of these Terms.
        </p>
      </LegalSection>

      <LegalSection title="6. Payments and Subscriptions">
        <p>
          Certain features require paid subscriptions or one-time purchases, processed by Stripe. Subscription fees are
          billed in advance on a recurring basis until cancelled. You can cancel at any time; cancellation takes effect at
          the end of the current billing period. Refunds, where applicable, are handled according to the terms of the
          specific purchase and applicable law.
        </p>
      </LegalSection>

      <LegalSection title="7. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Harass, threaten, or harm other users.</li>
          <li>Upload or share content that is illegal, hateful, sexually explicit, or exploitative.</li>
          <li>Impersonate another person or misrepresent your affiliation.</li>
          <li>Attempt to access data or systems you are not authorized to access.</li>
          <li>Interfere with the Platform's operation or overload its infrastructure.</li>
          <li>Use the Platform to distribute spam or unauthorized commercial messages.</li>
          <li>Circumvent truth-scoring or verification mechanisms.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Intellectual Property and DMCA">
        <p>
          The Platform, including its software, design, and branding, is owned by WiseRavenShare and protected by
          intellectual property laws. We respect the intellectual property rights of others. If you believe content on
          the Platform infringes your copyright, you may submit a takedown notice through our copyright report workflow,
          including your contact information, identification of the work, and a good-faith statement. We will process
          valid notices and counter-notices in accordance with applicable law.
        </p>
      </LegalSection>

      <LegalSection title="9. Third-Party Services">
        <p>
          The Platform integrates with third-party services (Google, Dropbox, Stripe, social platforms, and others). Your
          use of those services is subject to their own terms and privacy policies. We are not responsible for the
          practices of third-party providers, and you connect them at your own discretion.
        </p>
      </LegalSection>

      <LegalSection title="10. Disclaimers">
        <p>
          The Platform is provided "as is" and "as available" without warranties of any kind. We do not guarantee that the
          Platform will be uninterrupted, error-free, or secure, or that any content, truth score, or reward will be
          accurate. To the fullest extent permitted by law, we disclaim all implied warranties.
        </p>
      </LegalSection>

      <LegalSection title="11. Limitation of Liability">
        <p>
          To the fullest extent permitted by law, WiseRavenShare and its affiliates shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or any loss of data, revenue, or goodwill, arising
          from your use of or inability to use the Platform.
        </p>
      </LegalSection>

      <LegalSection title="12. Indemnification">
        <p>
          You agree to indemnify and hold harmless WiseRavenShare from claims, damages, and expenses arising from your
          content, your breach of these Terms, or your violation of any law or third-party right.
        </p>
      </LegalSection>

      <LegalSection title="13. Termination">
        <p>
          You may delete your account at any time. We may suspend or terminate your access if you violate these Terms or
          for any operational reason. Upon termination, certain licenses and rights granted under these Terms end, while
          provisions that by their nature should survive will remain in effect.
        </p>
      </LegalSection>

      <LegalSection title="14. Governing Law and Disputes">
        <p>
          These Terms are governed by the laws of the jurisdiction in which WiseRavenShare operates, without regard to
          conflict-of-laws principles. We will seek to resolve disputes informally; any unresolved dispute shall be
          submitted to the exclusive jurisdiction of the competent courts.
        </p>
      </LegalSection>

      <LegalSection title="15. Changes to These Terms">
        <p>
          We may revise these Terms from time to time. Material changes will be posted on this page with an updated
          effective date. Continued use after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="16. Contact">
        <p>Questions about these Terms can be sent to {CONTACT_EMAIL}.</p>
      </LegalSection>
    </LegalLayout>
  );
}