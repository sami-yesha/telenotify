'use client';

import { FileText, Languages, Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, CodeBlock, Dialog, Empty, Input, PageHeader, Select, Skeleton, timeAgo } from '@/components/ui';
import { api, API_BASE_URL, ApiError, fetcher } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useOrgParams } from '@/lib/hooks';
import type { Locale, MessageTemplate } from '@/lib/types';

const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'am', label: 'Amharic · አማርኛ' },
  { id: 'om', label: 'Afaan Oromo' },
  { id: 'ti', label: 'Tigrinya · ትግርኛ' },
];
const label = (id: string) => LOCALES.find((l) => l.id === id)?.label ?? id;
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
const findPlaceholders = (text: string) => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];

export default function TemplatesPage() {
  const { orgId } = useOrgParams();
  const path = `/portal/orgs/${orgId}/templates`;
  const { data: templates, mutate } = useSWR<MessageTemplate[]>(path, fetcher);
  const [editing, setEditing] = useState<MessageTemplate | 'new' | null>(null);

  async function remove(t: MessageTemplate) {
    if (!confirm(`Delete template "${t.key}"? Sends that use it will fail until you recreate it.`)) return;
    await api(`${path}/${t.id}`, { method: 'DELETE' });
    mutate();
  }

  return (
    <>
      <PageHeader
        title="Templates"
        description="Write a message once in English, Amharic, Afaan Oromo or Tigrinya. Send it by key with values for its {{placeholders}}; each customer gets their own language."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New template
          </Button>
        }
      />

      {!templates ? (
        <Skeleton className="h-40" />
      ) : templates.length === 0 ? (
        <Card>
          <Empty title="No templates yet" icon={FileText}>
            Templates keep your wording consistent and translated, e.g. a payment receipt in English and Amharic.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-line bg-surface p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{t.name}</p>
                  <code className="font-mono text-xs text-muted">{t.key}</code>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(t)} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Edit">
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => remove(t)} className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" aria-label="Delete">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 rounded-xl bg-subtle px-3 py-2 text-sm text-ink">{t.variants[t.defaultLocale]}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Languages className="size-3.5 text-muted" />
                {Object.keys(t.variants).map((l) => (
                  <Badge key={l} tone={l === t.defaultLocale ? 'blue' : 'gray'}>
                    {l}
                    {l === t.defaultLocale ? ' · default' : ''}
                  </Badge>
                ))}
                <span className="ml-auto text-xs text-muted">updated {timeAgo(t.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditor
        template={editing}
        path={path}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          mutate();
        }}
      />
    </>
  );
}

function TemplateEditor({ template, path, onClose, onSaved }: { template: MessageTemplate | 'new' | null; path: string; onClose: () => void; onSaved: () => void }) {
  const isNew = template === 'new';
  const existing = template && template !== 'new' ? template : null;
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [variants, setVariants] = useState<Partial<Record<Locale, string>>>({});
  const [defaultLocale, setDefaultLocale] = useState<Locale>('en');
  const [active, setActive] = useState<Locale>('en');
  const [sample, setSample] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setKey(existing?.key ?? '');
    setName(existing?.name ?? '');
    setVariants(existing?.variants ?? { en: '', am: '' });
    setDefaultLocale(existing?.defaultLocale ?? 'en');
    setActive(existing?.defaultLocale ?? 'en');
    setSample({});
    setError(null);
  }, [template]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => [...new Set(Object.values(variants).flatMap((t) => findPlaceholders(t ?? '')))], [variants]);
  const preview = (variants[active] ?? '').replace(PLACEHOLDER, (m, n: string) => sample[n] || m);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const filled = Object.fromEntries(Object.entries(variants).filter(([, text]) => text?.trim()));
      const body = { name, variants: filled, defaultLocale };
      if (isNew) await api(path, { method: 'POST', body: { key, ...body } });
      else await api(`${path}/${existing!.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const sendExample = `curl -X POST ${API_BASE_URL}/v1/messages \\\n  -H "x-api-key: tn_…" -H "content-type: application/json" \\\n  -d '${JSON.stringify({ to: 'customer_123', template: key || 'your_key', params: Object.fromEntries(names.map((n) => [n, sample[n] || '…'])) })}'`;

  return (
    <Dialog wide open={Boolean(template)} onClose={onClose} title={isNew ? 'New template' : `Edit ${existing?.key}`} description="Use {{name}} for values you fill in when sending.">
      <form onSubmit={save} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Payment received" required />
          <Input
            label="Key (used in the API)"
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="payment_received"
            required
            disabled={!isNew}
          />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            {LOCALES.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => setActive(l.id)}
                className={cn('rounded-lg px-2.5 py-1 text-xs font-medium', active === l.id ? 'bg-ink text-page' : variants[l.id] ? 'bg-subtle text-ink' : 'text-muted hover:bg-subtle')}
              >
                {l.label}
                {variants[l.id] ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <textarea
            value={variants[active] ?? ''}
            onChange={(e) => setVariants({ ...variants, [active]: e.target.value })}
            rows={4}
            maxLength={4096}
            placeholder={active === 'am' ? 'ከ{{payer}} {{amount}} ብር ተቀብለዋል።' : 'Payment of {{amount}} ETB received from {{payer}}.'}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-soft focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            Default language
            <Select value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value as Locale)} className="py-1.5">
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {label(l.id)}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {names.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Placeholders · sample values for the preview</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {names.map((n) => (
                <Input key={n} placeholder={n} value={sample[n] ?? ''} onChange={(e) => setSample({ ...sample, [n]: e.target.value })} />
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-[#0e1621] p-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Preview · {label(active)}</p>
          <div className="w-fit max-w-full whitespace-pre-wrap rounded-xl rounded-bl-md bg-[#182533] px-3 py-2 text-sm text-white">{preview || <span className="text-slate-500">Nothing written in this language yet</span>}</div>
        </div>

        <CodeBlock language="send it" code={sendExample} />

        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isNew ? 'Create template' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
