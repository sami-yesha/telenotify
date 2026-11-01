import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL, LegalPage } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Terms of Service · Telenotify' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" intro={`These terms govern your use of Telenotify, a service operated by ${LEGAL.company} that lets businesses send notifications and verify phone numbers through Telegram. By creating an account you agree to them.`}>
      <section>
        <h2>1. Your account</h2>
        <p>You must give accurate information and keep your password and API keys secret. You're responsible for everything done with your account and keys, including by teammates you invite. Tell us immediately at {LEGAL.email} if you suspect unauthorized use.</p>
      </section>
      <section>
        <h2>2. The service</h2>
        <p>Telenotify delivers messages you send through our API to customers who have connected Telegram to your bot, verifies phone numbers that customers choose to share, and reports delivery results to you. Telegram is operated by a third party; we can&apos;t guarantee that Telegram will always be available or will accept every message. When a customer can&apos;t be reached, we tell you so you can use your own fallback channel.</p>
      </section>
      <section>
        <h2>3. Acceptable use</h2>
        <p>You may only message people who have chosen to receive messages from you, about your relationship with them. You must not use Telenotify to:</p>
        <ul>
          <li>send spam, unsolicited marketing, or messages to people who haven&apos;t connected to your bot;</li>
          <li>send fraudulent, misleading, illegal, hateful or harassing content, or impersonate another business;</li>
          <li>collect data you aren&apos;t entitled to, or break Telegram&apos;s terms;</li>
          <li>probe, overload or attempt to bypass the security or limits of the service.</li>
        </ul>
        <p>We may suspend accounts that violate these rules, especially when customers report abuse or Telegram restricts a bot.</p>
      </section>
      <section>
        <h2>4. Your customers&apos; data</h2>
        <p>You remain responsible for having a lawful basis to message your customers and for the content you send. We process your customers&apos; data only to provide the service, as described in our <Link href="/privacy" className="text-brand">Privacy Policy</Link>.</p>
      </section>
      <section>
        <h2>5. Price and limits</h2>
        <p>Telenotify is free to use; we don&apos;t take payments. Each organization has a fair-use limit of live messages and verifications per month (currently 1,000 for new organizations); when it&apos;s reached, live messages are rejected until the next month begins. You can request a higher limit in the portal, and we may approve or decline it; and we may change the limit with at least 30 days&apos; notice. The source code is available under the GNU Affero General Public License v3.0, so you can also run Telenotify yourself.</p>
      </section>
      <section>
        <h2>6. Availability and changes</h2>
        <p>We work to keep Telenotify available but don&apos;t promise uninterrupted service. We may change or discontinue features; we&apos;ll give reasonable notice of changes that materially affect paying customers.</p>
      </section>
      <section>
        <h2>7. Liability</h2>
        <p>To the extent the law allows, Telenotify is provided &quot;as is&quot;, and our total liability for any claim is limited to the amount you paid us in the three months before it arose. We aren&apos;t liable for indirect losses, or for messages not delivered because of Telegram, your customers, or your own systems.</p>
      </section>
      <section>
        <h2>8. Ending your account</h2>
        <p>You can delete your organization or account at any time from the portal. We may terminate accounts that breach these terms. Sections on liability and data continue to apply after termination.</p>
      </section>
      <section>
        <h2>9. Governing law</h2>
        <p>These terms are governed by the laws of the Federal Democratic Republic of Ethiopia, and disputes will be handled by the competent courts in Addis Ababa.</p>
      </section>
    </LegalPage>
  );
}
