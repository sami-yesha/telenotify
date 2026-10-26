'use client';

import { BookOpen, Braces, Check, Clock, Download, KeyRound, Link2, Play, Search, ShieldAlert, Wand2, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { CodeTabs } from '@/components/code-tabs';
import { PasswordInput } from '@/components/password-input';
import { Alert, Badge, Button, CodeBlock, CopyButton, cn, Input, PageHeader, Skeleton } from '@/components/ui';
import { API_BASE_URL } from '@/lib/api';
import { EXAMPLE_RESPONSES } from '@/lib/api-examples';
import { highlight } from '@/lib/highlight';
import { useOrgParams } from '@/lib/hooks';
import { bodyExample, bodyFields, endpoints, type Endpoint, type OpenApiSpec, toPostman } from '@/lib/openapi';
import { type ApiCall, snippets } from '@/lib/snippets';

const methodTone: Record<string, string> = {
  GET: 'bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300',
  POST: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300',
  PUT: 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300',
  PATCH: 'bg-orange-500/12 text-orange-700 ring-orange-500/25 dark:text-orange-300',
  DELETE: 'bg-red-500/12 text-red-700 ring-red-500/25 dark:text-red-300',
};

const KEY_STORAGE = 'tn_explorer_key';

interface Result {
  status: number;
  ms: number;
  size: number;
  body: string;
}

const anchorFor = (e: Endpoint) => `${e.method.toLowerCase()}-${e.path}`;

export default function ApiReferencePage() {
  const { env } = useOrgParams();
  const { data: spec } = useSWR<OpenApiSpec>('/api/docs-json', (url: string) => fetch(url).then((r) => r.json()));
  const list = useMemo(() => (spec ? endpoints(spec) : []), [spec]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = list.find((e) => e.id === selectedId) ?? list[0];
  const [apiKey, setApiKey] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const prefix = env === 'sandbox' ? 'tn_test_' : 'tn_live_';

  useEffect(() => {
    try {
      setApiKey(sessionStorage.getItem(KEY_STORAGE) ?? '');
    } catch {}
  }, []);

  // Open the endpoint named in the URL (#post-/v1/messages), if any.
  useEffect(() => {
    if (!list.length) return;
    const hash = decodeURIComponent(location.hash.slice(1));
    const match = list.find((e) => anchorFor(e) === hash);
    if (match) setSelectedId(match.id);
  }, [list]);

  const select = (e: Endpoint) => {
    setSelectedId(e.id);
    history.replaceState(null, '', `#${anchorFor(e)}`);
  };

  useEffect(() => {
    if (!selected || !spec) return;
    setParams({});
    setResult(null);
    setError(null);
    setBody(bodyExample(spec, selected.op) ?? '');
  }, [selected?.id, spec]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPath = useCallback(
    (e: Endpoint, placeholder = true) => {
      let path = e.path.replace(/\{(\w+)\}/g, (_, name: string) => (params[name] ? encodeURIComponent(params[name]) : placeholder ? `{${name}}` : ''));
      const search = new URLSearchParams();
      for (const p of e.op.parameters ?? []) if (p.in === 'query' && params[p.name]) search.set(p.name, params[p.name]);
      if (search.size) path += `?${search}`;
      return path;
    },
    [params],
  );

  const parsedBody = useMemo((): { ok: true; value: unknown } | { ok: false; error: string } | null => {
    if (!body.trim()) return null;
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [body]);

  async function send() {
    if (!selected || sending) return;
    setError(null);
    setResult(null);
    if (!apiKey.startsWith(prefix)) return setError(`Paste a ${env} key first (it starts with ${prefix}).`);
    if ((selected.op.parameters ?? []).some((p) => p.in === 'path' && !params[p.name])) return setError('Fill in the path parameters.');
    if (parsedBody && !parsedBody.ok) return setError('The request body is not valid JSON.');
    try {
      sessionStorage.setItem(KEY_STORAGE, apiKey);
    } catch {}
    setSending(true);
    const started = performance.now();
    try {
      const response = await fetch(`/api${buildPath(selected)}`, {
        method: selected.method,
        headers: { 'x-api-key': apiKey, ...(parsedBody ? { 'content-type': 'application/json' } : {}) },
        body: parsedBody?.ok ? JSON.stringify(parsedBody.value) : undefined,
      });
      const text = await response.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setResult({ status: response.status, ms: Math.round(performance.now() - started), size: new Blob([text]).size, body: pretty });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function downloadPostman() {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(toPostman(spec, API_BASE_URL), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'telenotify.postman_collection.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!spec) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16" />
        <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const filtered = list.filter((e) => `${e.method} ${e.path} ${e.op.summary ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const tags = [...new Set(filtered.map((e) => e.tag))];
  const fields = selected ? bodyFields(spec, selected.op) : [];
  const parameters = (selected?.op.parameters ?? []).filter((p) => p.in !== 'header');
  const example = selected ? EXAMPLE_RESPONSES[selected.id] : undefined;
  const call: ApiCall | null = selected
    ? { method: selected.method as ApiCall['method'], path: buildPath(selected), body: parsedBody?.ok ? (parsedBody.value as Record<string, unknown>) : undefined }
    : null;

  return (
    <>
      <PageHeader
        title="API reference"
        description="Every public endpoint, generated from the live API. Read the details, then try a call with your own key."
        actions={
          <Button variant="secondary" onClick={downloadPostman}>
            <Download className="size-4" /> Postman collection
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <InfoTile icon={Link2} label="Base URL">
          <span className="flex items-center gap-2">
            <code className="min-w-0 truncate font-mono text-[13px] text-ink">{API_BASE_URL}</code>
            <CopyButton value={API_BASE_URL} label="" />
          </span>
        </InfoTile>
        <InfoTile icon={KeyRound} label="Authentication">
          <code className="font-mono text-[13px] text-ink">x-api-key: {prefix}…</code>
        </InfoTile>
        <InfoTile icon={Braces} label="Format">
          <span className="text-[13px] text-ink">JSON in, JSON out · errors as {'{ message }'}</span>
        </InfoTile>
      </div>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Endpoint list */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter endpoints"
              className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink shadow-soft placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <nav className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto pr-1">
            {tags.map((tag) => (
              <div key={tag}>
                <p className="flex items-center justify-between px-2 pb-1 text-xs font-medium tracking-[-0.005em] text-muted/80">
                  {tag}
                  <span className="font-medium tracking-normal">{filtered.filter((e) => e.tag === tag).length}</span>
                </p>
                <ul className="space-y-0.5">
                  {filtered
                    .filter((e) => e.tag === tag)
                    .map((e) => {
                      const active = selected?.id === e.id;
                      return (
                        <li key={e.id}>
                          <button
                            onClick={() => select(e)}
                            className={cn('relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors', active ? 'text-ink' : 'text-muted hover:text-ink')}
                          >
                            {active && <motion.span layoutId="api-ref-active" className="absolute inset-0 rounded-lg bg-surface shadow-soft ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                            <MethodPill method={e.method} small />
                            <span className="relative truncate font-mono text-xs">{e.path.replace('/v1', '')}</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
            {filtered.length === 0 && <p className="px-2 text-sm text-muted">No endpoint matches “{query}”.</p>}
          </nav>
        </aside>

        {selected && call && (
          <AnimatePresence mode="wait">
            <motion.div key={selected.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="min-w-0 space-y-6">
              {/* Endpoint header */}
              <section className="relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-soft sm:p-6">
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <MethodPill method={selected.method} />
                    <code className="font-mono text-[15px] font-medium text-ink">
                      {selected.path.split(/(\{\w+\})/g).map((part, i) =>
                        part.startsWith('{') ? (
                          <span key={i} className="text-brand">
                            {part}
                          </span>
                        ) : (
                          part
                        ),
                      )}
                    </code>
                    <CopyButton value={`${API_BASE_URL}${selected.path}`} label="" />
                    <Badge tone="gray">{selected.tag}</Badge>
                  </div>
                  <h2 className="mt-3 font-display text-xl font-medium tracking-tight text-ink">{withCode(selected.op.summary ?? `${selected.method} ${selected.path}`)}</h2>
                  {selected.op.description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{withCode(selected.op.description)}</p>}
                </div>
              </section>

              {/* Parameters and body */}
              {(parameters.length > 0 || fields.length > 0) && (
                <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
                  {parameters.length > 0 && (
                    <FieldTable
                      title="Parameters"
                      rows={parameters.map((p) => ({
                        name: p.name,
                        type: p.schema?.type ?? 'string',
                        required: Boolean(p.required),
                        where: p.in,
                        description: p.description,
                        enum: p.schema?.enum,
                      }))}
                    />
                  )}
                  {fields.length > 0 && (
                    <FieldTable
                      title="Request body"
                      rows={fields.map((f) => ({ name: f.name, type: f.type, required: f.required, where: 'body', description: f.description, enum: f.enum }))}
                    />
                  )}
                </section>
              )}

              {/* Try it */}
              <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5 sm:px-6">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
                    <Zap className="size-4 text-brand" /> Try it
                  </h3>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <ShieldAlert className="size-3.5 text-amber-500" />
                    {env === 'live' ? 'Live calls reach real customers.' : 'Sandbox calls are safe to experiment with.'}
                  </p>
                </header>
                <div className="space-y-4 px-5 py-5 sm:px-6">
                  <PasswordInput
                    label={`Your ${env} API key`}
                    placeholder={`${prefix}…`}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value.trim())}
                    autoComplete="off"
                    hint="Kept only in this browser tab."
                  />
                  {parameters.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {parameters.map((p) => (
                        <Input
                          key={p.name}
                          label={`${p.name}${p.required ? '' : ' (optional)'}`}
                          placeholder={p.schema?.enum ? String(p.schema.enum[0]) : p.in === 'path' ? 'required' : ''}
                          hint={p.schema?.enum ? `One of ${p.schema.enum.join(', ')}` : undefined}
                          value={params[p.name] ?? ''}
                          onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}
                        />
                      ))}
                    </div>
                  )}
                  {selected.op.requestBody && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-medium text-ink">Request body</span>
                        <span className="flex items-center gap-2">
                          {parsedBody && (
                            <span className={cn('text-xs', parsedBody.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                              {parsedBody.ok ? (
                                <span className="inline-flex items-center gap-1">
                                  <Check className="size-3" /> Valid JSON
                                </span>
                              ) : (
                                'Invalid JSON'
                              )}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={!parsedBody?.ok}
                            onClick={() => parsedBody?.ok && setBody(JSON.stringify(parsedBody.value, null, 2))}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-subtle hover:text-ink disabled:opacity-40"
                          >
                            <Wand2 className="size-3" /> Format
                          </button>
                        </span>
                      </div>
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            void send();
                          }
                        }}
                        rows={Math.min(16, Math.max(5, body.split('\n').length + 1))}
                        spellCheck={false}
                        className={cn(
                          'w-full rounded-xl border bg-[#030a1c] p-3.5 font-mono text-[13px] leading-relaxed text-slate-100 focus:outline-none focus:ring-4',
                          parsedBody && !parsedBody.ok ? 'border-red-500/60 focus:ring-red-500/15' : 'border-line focus:border-brand focus:ring-brand/15',
                        )}
                      />
                    </div>
                  )}
                  {error && <Alert>{error}</Alert>}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={send} loading={sending}>
                      <Play className="size-4" /> Send request
                    </Button>
                    <span className="text-xs text-muted">
                      or press <kbd className="rounded border border-line bg-subtle px-1 font-sans text-[10px]">⌘</kbd> <kbd className="rounded border border-line bg-subtle px-1 font-sans text-[10px]">Enter</kbd> in the body
                    </span>
                  </div>

                  <AnimatePresence>
                    {result && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="overflow-hidden rounded-xl border border-white/5 bg-[#030a1c]">
                        <div className="flex items-center gap-3 border-b border-white/10 px-3.5 py-2 text-xs">
                          <span
                            className={cn(
                              'rounded-md px-1.5 py-0.5 font-mono font-bold',
                              result.status >= 500 ? 'bg-red-500/20 text-red-300' : result.status >= 400 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300',
                            )}
                          >
                            {result.status}
                          </span>
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="size-3" /> {result.ms} ms
                          </span>
                          <span className="text-slate-500">{formatBytes(result.size)}</span>
                          <span className="ml-auto">
                            <CopyButton value={result.body} dark />
                          </span>
                        </div>
                        <pre className="max-h-96 overflow-auto p-4 text-[13px] leading-relaxed text-slate-200">
                          <code>{highlight(result.body || '(empty)', 'json')}</code>
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

              {/* Generated code */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <BookOpen className="size-4 text-muted" /> Code for this request
                </h3>
                <CodeTabs samples={snippets(call, { baseUrl: API_BASE_URL, apiKey: `${prefix}…` })} title={`${selected.method} ${selected.path}`} />
              </div>

              {example && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                    Example response
                    <span className="rounded-md bg-emerald-500/12 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{example.status}</span>
                  </h3>
                  <CodeBlock language="json" code={JSON.stringify(example.body, null, 2)} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </>
  );
}

function MethodPill({ method, small }: { method: string; small?: boolean }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-md font-mono font-bold ring-1 ring-inset',
        small ? 'w-11 py-0.5 text-[9.5px]' : 'px-2 py-1 text-xs',
        methodTone[method] ?? methodTone.GET,
      )}
    >
      {method}
    </span>
  );
}

function InfoTile({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-soft">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <div className="mt-0.5 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function FieldTable({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; type: string; required: boolean; where: string; description?: string; enum?: unknown[] }[];
}) {
  return (
    <div className="border-b border-line/70 last:border-b-0">
      <h3 className="px-5 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted sm:px-6">{title}</h3>
      <ul className="divide-y divide-line/60">
        {rows.map((row) => (
          <li key={`${row.where}-${row.name}`} className="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:gap-6 sm:px-6">
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:w-56">
              <code className="font-mono text-[13px] font-semibold text-ink">{row.name}</code>
              <span className="font-mono text-[11px] text-muted">{row.type}</span>
              {row.required ? (
                <span className="rounded bg-red-500/10 px-1 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">required</span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-muted/70">optional</span>
              )}
              {row.where !== 'body' && <span className="rounded bg-subtle px-1 text-[10px] text-muted">{row.where}</span>}
            </div>
            <div className="min-w-0 text-sm text-muted">
              {row.description ? withCode(row.description) : <span className="text-muted/60">—</span>}
              {row.enum && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {row.enum.map((value) => (
                    <code key={String(value)} className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink ring-1 ring-inset ring-line">
                      {String(value)}
                    </code>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// Renders `backtick` spans in OpenAPI descriptions as inline code.
function withCode(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={i} className="rounded bg-subtle px-1 font-mono text-[0.85em] text-ink">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}
