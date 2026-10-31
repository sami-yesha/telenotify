'use client';

import { KeyRound, Plus, ShieldAlert } from 'lucide-react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { RequestLog } from '@/components/request-log';
import { Alert, Badge, Button, Card, Dialog, Empty, formatDate, Input, PageHeader, Secret, Skeleton, Table, timeAgo } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { envPath, useOrgParams } from '@/lib/hooks';
import type { ApiKey } from '@/lib/types';

export default function KeysPage() {
  const { orgId, env } = useOrgParams();
  const path = `${envPath(orgId, env)}/keys`;
  const { data: keys, mutate } = useSWR<ApiKey[]>(path, fetcher);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [revokingKey, setRevokingKey] = useState<ApiKey | null>(null);
  const [revokingLoading, setRevokingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prefix = env === 'sandbox' ? 'tn_test_' : 'tn_live_';

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setCreated(await api<ApiKey>(path, { method: 'POST', body: { name: new FormData(event.currentTarget).get('name') } }));
      setCreating(false);
      mutate();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function confirmRevoke() {
    if (!revokingKey) return;
    setRevokingLoading(true);
    try {
      await api(`${path}/${revokingKey.id}`, { method: 'DELETE' });
      setRevokingKey(null);
      mutate();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to revoke key');
    } finally {
      setRevokingLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="API keys"
        description={
          <>
            Send the key in the <code className="rounded bg-subtle px-1 font-mono text-ink">x-api-key</code> header. {env === 'sandbox' ? 'Sandbox' : 'Live'} keys start with{' '}
            <code className="rounded bg-subtle px-1 font-mono text-ink">{prefix}</code>.
          </>
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create key
          </Button>
        }
      />

      <Card>
        {!keys ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : keys.length === 0 ? (
          <Empty title="No keys yet" icon={KeyRound}>
            Create a key with the button above, then follow the Docs to send your first message.
          </Empty>
        ) : (
          <Table head={['Name', 'Key', 'Created', 'Last used', '']}>
            {keys.map((key) => (
              <tr key={key.id} className={key.revokedAt ? 'opacity-55' : ''}>
                <td className="font-medium text-ink">{key.name}</td>
                <td>
                  <code className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-xs text-muted">{key.prefix}…</code>
                </td>
                <td className="whitespace-nowrap text-muted">{formatDate(key.createdAt)}</td>
                <td className="whitespace-nowrap text-muted">{key.lastUsedAt ? timeAgo(key.lastUsedAt) : 'Never'}</td>
                <td className="text-right">
                  {key.revokedAt ? (
                    <Badge>revoked</Badge>
                  ) : (
                    <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => setRevokingKey(key)}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="mt-6">
        <RequestLog basePath={envPath(orgId, env)} keys={keys ?? []} />
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Create an API key" description="Give it a name you'll recognize later, like the server that uses it.">
        <form onSubmit={create} className="space-y-4">
          <Input name="name" label="Name" placeholder="e.g. Production server" required maxLength={60} autoFocus />
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create key
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={Boolean(created)} onClose={() => setCreated(null)} title="Save your new key" description={`"${created?.name}" is ready. Copy it now; for your security we won't show it again.`}>
        <Secret value={created?.key ?? ''} />
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-subtle px-3.5 py-3 text-sm text-muted">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
          Store it as an environment variable on your server. Never put it in a mobile app or website code.
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setCreated(null)}>I&apos;ve saved it</Button>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(revokingKey)}
        onClose={() => setRevokingKey(null)}
        title="Revoke API key"
        description={`Revoke "${revokingKey?.name}"? Requests using this key will fail immediately.`}
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setRevokingKey(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={revokingLoading} onClick={confirmRevoke}>
            Revoke key
          </Button>
        </div>
      </Dialog>
    </>
  );
}
