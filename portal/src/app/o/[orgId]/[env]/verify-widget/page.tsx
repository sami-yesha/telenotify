'use client';

import { Globe, KeyRound, MousePointerClick, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, CodeBlock, PageHeader, Secret, Skeleton } from '@/components/ui';
import { api, ApiError, API_BASE_URL } from '@/lib/api';
import { cn } from '@/lib/cn';
import { envPath, useEnvironment, useOrgParams } from '@/lib/hooks';
import type { EnvironmentInfo } from '@/lib/types';

type Tab = 'html' | 'react' | 'server';

export default function VerifyWidgetPage() {
  const { orgId, env } = useOrgParams();
  const { data: environment, mutate } = useEnvironment();
  const [tab, setTab] = useState<Tab>('html');
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  if (!environment) return <Skeleton className="h-96" />;
  const key = environment.publishableKey ?? '';
  const live = env === 'live';

  async function rotate() {
    if (!confirm('Create a new publishable key? Pages using the old one stop working until you update them.')) return;
    mutate(await api<EnvironmentInfo>(`${envPath(orgId, env)}/verify-widget/rotate-key`, { method: 'POST' }), false);
  }

  const snippets: Record<Tab, { label: string; language: string; code: string }> = {
    html: {
      label: 'HTML',
      language: 'html',
      code: `<script src="${origin}/verify.js" defer></script>

<telenotify-verify key="${key}"></telenotify-verify>

<script>
  document.querySelector('telenotify-verify').addEventListener('verified', async (event) => {
    // event.detail = { id, phone, token }: send the token to your server to check it
    await fetch('/api/phone-verified', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: event.detail.token }),
    });
  });
</script>`,
    },
    react: {
      label: 'React',
      language: 'javascript',
      code: `// Load once, e.g. in your root layout:
// <script src="${origin}/verify.js" defer></script>

function VerifyPhoneButton({ onVerified }) {
  async function verify() {
    const result = await window.Telenotify.verify({ key: '${key}' });
    if (result.status === 'VERIFIED') {
      await fetch('/api/phone-verified', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
      });
      onVerified(result.phone);
    }
  }
  return <button onClick={verify}>Verify with Telegram</button>;
}`,
    },
    server: {
      label: 'Redirect (server)',
      language: 'javascript',
      code: `// No front-end code: create the verification on your server and redirect.
const verification = await telenotify.verifications.create({
  externalId: user.id,               // allowed here: your server is trusted
  returnUrl: 'https://yourapp.example/phone-verified',
});
res.redirect(verification.hostedUrl);

// Telenotify sends the person back to:
// /phone-verified?telenotify_verification=<id>&telenotify_token=<signed result>`,
    },
  };

  const checkCode = `// On your server, with your signing secret (Webhooks page):
import { verifications } from '@telenotify/node';

const result = verifications.verifyToken(req.body.token, process.env.TELENOTIFY_SIGNING_SECRET);
if (result?.status === 'VERIFIED') {
  // result.phone is the verified number, e.g. "251911223344"
  await db.users.update(currentUser.id, { phone: result.phone, phoneVerified: true });
}

// Or, without the token: GET ${API_BASE_URL}/v1/verifications/<id> with your secret API key.`;

  return (
    <>
      <PageHeader
        title="Verify widget"
        description="A ready-made “Verify with Telegram” button for your website. One script tag, no backend endpoint to start the flow, and a signed result you check on your server."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card icon={KeyRound} title="Publishable key" description="Safe to put in your web page: it can only start phone verifications." actions={<Button variant="ghost" onClick={rotate}><RefreshCw className="size-4" /> Rotate</Button>}>
            <Secret value={key} />
          </Card>

          <AllowedWebsites environment={environment} onSaved={(next) => mutate(next, false)} live={live} />

          <Card title="Add it to your site">
            <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-line bg-subtle p-0.5 text-sm">
              {(Object.keys(snippets) as Tab[]).map((id) => (
                <button key={id} onClick={() => setTab(id)} className={cn('rounded-lg px-3 py-1.5 font-medium', tab === id ? 'bg-surface text-ink shadow-soft ring-1 ring-line' : 'text-muted hover:text-ink')}>
                  {snippets[id].label}
                </button>
              ))}
            </div>
            <CodeBlock language={snippets[tab].language} code={snippets[tab].code} />
          </Card>

          <Card icon={ShieldCheck} title="Check the result on your server" description="Never trust the browser alone: the token is signed with your signing secret and expires after 10 minutes.">
            <CodeBlock language="javascript" code={checkCode} />
          </Card>
        </div>

        <div className="space-y-6">
          <Preview publishableKey={key} portalOrigin={origin} live={live} />
          <Card title="How it works">
            <ol className="space-y-3 text-sm text-muted">
              {[
                'The customer clicks the button on your site.',
                'Our verify page opens with your organization’s name: one tap opens Telegram (or scan the QR code on a computer).',
                'They tap “Share my phone number”. Telegram confirms the number belongs to them.',
                'The popup closes and your page gets a “verified” event with the phone and a signed token.',
                'Your server checks the token and saves the verified number.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function AllowedWebsites({ environment, live, onSaved }: { environment: EnvironmentInfo; live: boolean; onSaved: (env: EnvironmentInfo) => void }) {
  const { orgId, env } = useOrgParams();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(origins: string[]) {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api<EnvironmentInfo>(`${envPath(orgId, env)}/verify-widget/origins`, { method: 'PUT', body: { origins } }));
      setDraft('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      icon={Globe}
      title="Allowed websites"
      description={live ? 'The button only works on these sites. Add each address your customers use, e.g. https://shop.example.com.' : 'The sandbox works on any website, including localhost, so you can test freely. Live needs a list.'}
    >
      <div className="flex flex-wrap gap-2">
        {environment.allowedOrigins.length === 0 && <p className="text-sm text-muted">{live ? 'No websites yet: the live button won’t work until you add one.' : 'None needed in the sandbox.'}</p>}
        {environment.allowedOrigins.map((site) => (
          <span key={site} className="inline-flex items-center gap-1.5 rounded-lg bg-subtle py-1 pl-2.5 pr-1 font-mono text-xs text-ink ring-1 ring-inset ring-line">
            {site}
            <button onClick={() => save(environment.allowedOrigins.filter((s) => s !== site))} className="rounded p-0.5 text-muted hover:bg-surface hover:text-ink" aria-label={`Remove ${site}`}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (draft.trim()) void save([...environment.allowedOrigins, draft.trim()]);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://yourapp.example"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-ink shadow-soft placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
        />
        <Button type="submit" variant="secondary" loading={saving}>
          <Plus className="size-4" /> Add
        </Button>
      </form>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

// The real button, loaded from /verify.js, running against this environment.
function Preview({ publishableKey, portalOrigin, live }: { publishableKey: string; portalOrigin: string; live: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!portalOrigin || !publishableKey) return;
    const ready = () => setLoaded(true);
    if ((window as unknown as { Telenotify?: unknown }).Telenotify) return ready();
    const script = document.createElement('script');
    script.src = `${portalOrigin}/verify.js`;
    script.onload = ready;
    document.head.appendChild(script);
  }, [portalOrigin, publishableKey]);

  useEffect(() => {
    const el = holder.current;
    if (!loaded || !el) return;
    el.innerHTML = '';
    const button = document.createElement('telenotify-verify');
    button.setAttribute('key', publishableKey);
    const show = (event: Event) => setResult(JSON.stringify((event as CustomEvent).detail, null, 2));
    ['verified', 'failed', 'cancel'].forEach((name) => button.addEventListener(name, show));
    el.appendChild(button);
  }, [loaded, publishableKey]);

  return (
    <Card icon={MousePointerClick} title="Try it" description={live ? 'Live mode: works here only if this portal’s address is in your allowed websites.' : 'Uses the sandbox bot. Verify your own number to see the event your page receives.'}>
      <div className="grid place-items-center rounded-xl border border-dashed border-line bg-subtle/40 px-4 py-8">
        <div ref={holder}>{!loaded && <Skeleton className="h-11 w-60" />}</div>
      </div>
      {result && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
            Event received <Badge tone="green">postMessage</Badge>
          </p>
          <CodeBlock language="json" code={result} />
        </div>
      )}
    </Card>
  );
}
