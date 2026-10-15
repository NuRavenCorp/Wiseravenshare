import React from "react";
import LegalLayout, { LegalSection } from "@/components/legal/LegalLayout";

const EFFECTIVE_DATE = "October 13, 2026";
const CONTACT_EMAIL = "privacy@wiseravenshare.com";

export default function CookiePolicy() {
  return (
    <LegalLayout title="Cookie Policy" subtitle="How WiseRavenShare uses cookies and similar technologies." lastUpdated={EFFECTIVE_DATE}>
      <LegalSection title="1. What Are Cookies">
        <p>
          Cookies are small text files placed on your device when you visit a website. They allow the site to remember your
          actions and preferences over a period of time. WiseRavenShare also uses similar technologies such as local storage
          and web beacons, which together with cookies are referred to here as "cookies."
        </p>
      </LegalSection>

      <LegalSection title="2. Types of Cookies We Use">
        <p><strong className="text-foreground">Essential cookies:</strong> required for the Platform to function, including authentication, session maintenance, and security. These cannot be disabled, as the Platform would not work without them.</p>
        <p><strong className="text-foreground">Preference cookies:</strong> remember your settings, such as theme and display choices, so the Platform works the way you expect.</p>
        <p><strong className="text-foreground">Analytics cookies:</strong> help us understand how visitors use the Platform so we can measure and improve performance and features.</p>
        <p><strong className="text-foreground">Functional cookies:</strong> enable enhanced features, such as connected third-party accounts and embedded media.</p>
      </LegalSection>

      <LegalSection title="3. Third-Party Cookies">
        <p>
          Some cookies are set by third-party services we use, including:
        </p>
        <ul className="list-disc pl-6 space-y-1.5">
          <li><strong className="text-foreground">Google</strong> for sign-in, analytics, and connected services (Drive, Calendar).</li>
          <li><strong className="text-foreground">Stripe</strong> for secure payment processing.</li>
          <li><strong className="text-foreground">Social platforms</strong> (TikTok, LinkedIn, Facebook, Instagram) when you connect or share content.</li>
        </ul>
        <p>
          These providers may use cookies to deliver and improve their own services. Their use of cookies is governed by
          their respective privacy policies.
        </p>
      </LegalSection>

      <LegalSection title="4. Managing Cookies">
        <p>
          Most browsers allow you to control cookies through their settings. You can usually block or delete cookies, and
          set preferences for individual sites. Note that disabling essential cookies will prevent the Platform from
          functioning correctly, and disabling analytics or preference cookies may reduce your experience quality.
        </p>
        <p>
          Common controls include browser settings, private or incognito browsing modes, and device-level tracking
          preferences. For details, consult your browser's help documentation.
        </p>
      </LegalSection>

      <LegalSection title="5. Cookies and Advertising">
        <p>
          Where WiseRavenShare participates in advertising or analytics programs that use cookies for ad personalization,
          those cookies are subject to this policy and the relevant provider's controls. You may opt out of
          interest-based advertising through industry tools such as the Digital Advertising Alliance or your device's
          advertising identifier settings.
        </p>
      </LegalSection>

      <LegalSection title="6. Changes to This Policy">
        <p>
          We may update this Cookie Policy as we introduce new features or partners. Changes will be posted on this page
          with an updated date.
        </p>
      </LegalSection>

      <LegalSection title="7. Contact">
        <p>Questions about cookies can be sent to {CONTACT_EMAIL}.</p>
      </LegalSection>
    </LegalLayout>
  );
}