import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";

const EFFECTIVE_DATE = "October 13, 2026";
const CONTACT_EMAIL = "privacy@wiseravenshare.com";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" subtitle="How WiseRavenShare collects, uses, and protects your information." lastUpdated={EFFECTIVE_DATE}>
      <LegalSection title="1. Introduction">
        <p>
          WiseRavenShare ("we," "us," or "the Platform") is a creator-focused media platform offering AI-verified truth
          scoring, music production, multi-camera podcasting, community sharing, and tiered creator rewards. This Privacy
          Policy explains what information we collect, how we use it, and the choices you have. By creating an account or
          using any feature of the Platform, you consent to the practices described here.
        </p>
      </LegalSection>

      <LegalSection title="2. Information We Collect">
        <p><strong className="text-foreground">Account information:</strong> your name, email address, and authentication credentials when you register or sign in (including via Google, Apple, Microsoft, or Facebook single sign-on).</p>
        <p><strong className="text-foreground">Profile information:</strong> display name, bio, avatar, cover image, location, and website links you choose to add.</p>
        <p><strong className="text-foreground">Content you create:</strong> posts, media files (music, video, photos), podcasts, jam sessions, comments, messages, and other material you upload or publish.</p>
        <p><strong className="text-foreground">Usage and analytics:</strong> device information, approximate location, interaction data, and feature usage, collected to operate and improve the Platform.</p>
        <p><strong className="text-foreground">Payment information:</strong> when you purchase subscriptions or premium content, billing is processed by our payment provider, Stripe. We do not store full card numbers on our servers.</p>
        <p><strong className="text-foreground">Connected accounts:</strong> when you link a third-party service (Google Drive, Dropbox, Google Calendar, TikTok, LinkedIn, Facebook, Instagram), we access only the data you authorize through that service's permission prompts.</p>
      </LegalSection>

      <LegalSection title="3. How We Use Your Information">
        <p>We use your information to:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Provide, maintain, and improve Platform features and your account.</li>
          <li>Verify content authenticity through our AI truth-scoring engine and community challenge workflow.</li>
          <li>Process payments, issue creator rewards (WiseCoins), and manage subscriptions.</li>
          <li>Send service notifications, security alerts, and administrative messages.</li>
          <li>Generate aggregated, de-identified analytics about Platform usage.</li>
          <li>Detect, prevent, and address fraud, abuse, and policy violations.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. AI Truth Scoring and Content Analysis">
        <p>
          To support our integrity mission, content you publish may be analyzed by automated systems that compute a truth
          score, assess music characteristics (tempo, key, fingerprint), and generate verification reports. These analyses
          are displayed on your content and your profile. You may challenge a truth score through the community challenge
          workflow. Analysis outputs are derived from your content and do not reveal your content to additional parties
          beyond what is necessary to operate the feature.
        </p>
      </LegalSection>

      <LegalSection title="5. How We Share Information">
        <p>We share information only as described below:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong className="text-foreground">Public content:</strong> posts, media, and profile details you publish may be visible to other users and, where applicable, the public.</li>
          <li><strong className="text-foreground">Service providers:</strong> trusted processors that help us operate, including Stripe (payments), Google (sign-in, Drive, Calendar, analytics), and cloud storage partners.</li>
          <li><strong className="text-foreground">Legal obligations:</strong> when required by law, court order, or to protect rights, safety, or property.</li>
          <li><strong className="text-foreground">Business transfers:</strong> in connection with a merger, acquisition, or asset sale, subject to confidentiality obligations.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="6. Cookies and Tracking">
        <p>
          We use cookies and similar technologies to operate the Platform, preserve your session, remember preferences,
          and understand usage. Third-party services may also set cookies for analytics and, where applicable, advertising.
          See our <a href="/cookies" className="text-primary underline hover:text-primary/80">Cookie Policy</a> for details and controls.
        </p>
      </LegalSection>

      <LegalSection title="7. Data Retention">
        <p>
          We retain your account information for as long as your account is active. Content and usage data are retained
          according to our operational needs and legal obligations. You may request deletion of your account and
          associated content at any time; certain data may be retained where required by law or for legitimate business
          records.
        </p>
      </LegalSection>

      <LegalSection title="8. Your Rights">
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Access and receive a copy of your personal information.</li>
          <li>Correct inaccurate or incomplete information.</li>
          <li>Request deletion of your personal information.</li>
          <li>Withdraw consent to certain processing.</li>
          <li>Object to or restrict certain processing.</li>
        </ul>
        <p>To exercise these rights, contact us at {CONTACT_EMAIL}.</p>
      </LegalSection>

      <LegalSection title="9. Children's Privacy">
        <p>
          The Platform is not directed to children under 13 (or the minimum age in your jurisdiction), and we do not
          knowingly collect personal information from them. If you believe a child has provided us information, contact us
          and we will take steps to delete it.
        </p>
      </LegalSection>

      <LegalSection title="10. Security">
        <p>
          We use reasonable administrative, technical, and physical safeguards to protect your information. No method of
          transmission or storage is completely secure, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection title="11. International Users">
        <p>
          The Platform is operated from the United States. If you access it from outside the U.S., your information may be
          transferred to and processed in the U.S., where data protection laws may differ from your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material changes by posting the
          updated policy on this page and, where appropriate, through in-app or email notification. Continued use after
          changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact Us">
        <p>
          Questions about this Privacy Policy can be sent to {CONTACT_EMAIL}. We will respond in accordance with applicable
          law.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}