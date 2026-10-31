import type { Metadata } from 'next';
import { LEGAL, LegalPage } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Privacy Policy · Telenotify' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro={`This policy explains what data ${LEGAL.company} collects when you use Telenotify, and when businesses use Telenotify to message you.`}>
      <section>
        <h2>1. If you use the developer portal</h2>
        <ul>
          <li><b>Account data:</b> name, email, password (stored only as a secure hash), and Google account ID if you sign in with Google.</li>
          <li><b>Organization data:</b> organization names, teammates, API key names, webhook URLs, plan and usage, and an audit log of changes.</li>
          <li><b>Business verification (optional):</b> if you ask for the Verified business badge, your registered business name, TIN, trade license number and website. We use them only to check your registration; the public check page shows only the business name, website and verification date.</li>
          <li><b>Technical data:</b> IP addresses and request logs, used for security, rate limiting and debugging.</li>
        </ul>
      </section>
      <section>
        <h2>2. If a business messages you through Telenotify</h2>
        <p>We process this data on behalf of the business you dealt with, only to deliver their messages:</p>
        <ul>
          <li>the customer ID the business uses for you, and your phone number if they provide it or you share it;</li>
          <li>your Telegram chat ID and username, once you press Start on the business&apos;s bot;</li>
          <li>the messages sent to you and any replies you send to the bot, and whether delivery succeeded;</li>
          <li>for phone verification, the number you choose to share with the bot.</li>
        </ul>
        <p>You can stop receiving messages at any time by blocking the bot in Telegram. For other requests about this data, contact the business, or us at {LEGAL.email}.</p>
      </section>
      <section>
        <h2>2a. Telenotify Pass (only if you join)</h2>
        <p>
          Telenotify Pass is optional. If you join, we keep your Telegram-verified phone number, your Telegram user ID and your chat with the Pass bot, so that when a business on
          Telenotify asks to confirm that number, we can send you a Yes/No request.
        </p>
        <ul>
          <li>Nothing is shared with a business unless you tap Yes on its request. If you tap No, the business only learns that the request was declined.</li>
          <li>Businesses can&apos;t look up whether a number is in Telenotify Pass.</li>
          <li>We limit how often you can be asked, and stop requests from a business you decline twice in a day.</li>
          <li>Send /stop to the Pass bot, or block it, and we delete your number and Telegram IDs right away.</li>
        </ul>
      </section>
      <section>
        <h2>3. How we use data</h2>
        <p>To provide and secure the service, deliver messages and webhook events, prevent abuse, send account emails (verification, password reset, usage alerts), and comply with the law. We don&apos;t sell personal data or use customer messages for advertising.</p>
      </section>
      <section>
        <h2>4. Who we share it with</h2>
        <ul>
          <li><b>Telegram</b>, to deliver messages and receive replies;</li>
          <li>our <b>hosting and email providers</b>, to run the service and send account emails;</li>
          <li>the <b>business</b> that sent a message, through their dashboard and webhooks;</li>
          <li>authorities, when required by law.</li>
        </ul>
      </section>
      <section>
        <h2>5. Retention</h2>
        <p>We keep account data while your account exists. Message and webhook logs are kept to provide delivery history and may be deleted after they&apos;re no longer needed. Deleting an organization deletes its customers, messages and logs; deleting your account removes your personal account data.</p>
      </section>
      <section>
        <h2>6. Security</h2>
        <p>Data is encrypted in transit; bot tokens are encrypted at rest; passwords and API keys are stored as one-way hashes; webhook events are signed. No system is perfectly secure, and we&apos;ll notify affected users of a breach as required by law.</p>
      </section>
      <section>
        <h2>7. Your rights</h2>
        <p>You can access and correct your account data in the portal, delete your account at any time, and ask us about any data we hold about you at {LEGAL.email}.</p>
      </section>
    </LegalPage>
  );
}
