'use client';

import { Building2, DoorOpen, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useSWRConfig } from 'swr';
import { BusinessVerificationCard } from '@/components/business-verification';
import { Alert, Button, Card, Dialog, Input, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useOrg, useOrgParams } from '@/lib/hooks';

export default function OrgSettingsPage() {
  const router = useRouter();
  const { orgId } = useOrgParams();
  const { data: org, mutate } = useOrg();
  const { mutate: globalMutate } = useSWRConfig();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!org) return <Spinner />;
  const isOwner = org.role === 'OWNER';

  async function act(key: string, action: () => Promise<void>) {
    setLoading(key);
    setError(null);
    setSaved(false);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <PageHeader title="Organization settings" description="Settings shared by everyone in this organization." />
      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="space-y-6">
        <Card icon={Building2} title="Name" description="Shown to your team, and to customers in the sandbox.">
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get('name');
              act('rename', async () => {
                await api(`/portal/orgs/${orgId}`, { method: 'PATCH', body: { name } });
                await mutate();
                await globalMutate('/portal/orgs');
                setSaved(true);
              });
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-60 flex-1">
              <Input name="name" label="Organization name" defaultValue={org.name} required maxLength={120} disabled={!isOwner} hint={isOwner ? undefined : 'Only owners can rename the organization.'} />
            </div>
            {isOwner && (
              <Button type="submit" loading={loading === 'rename'}>
                Save
              </Button>
            )}
          </form>
          {saved && (
            <div className="mt-3">
              <Alert tone="green">Saved.</Alert>
            </div>
          )}
        </Card>

        <BusinessVerificationCard />

        <Card icon={DoorOpen} title="Leave organization" description="You'll lose access to its keys, logs and settings.">
          <Button
            variant="secondary"
            loading={loading === 'leave'}
            onClick={() => {
              if (!confirm(`Leave ${org.name}?`)) return;
              act('leave', async () => {
                await api(`/portal/orgs/${orgId}/leave`, { method: 'POST' });
                router.replace('/dashboard');
              });
            }}
          >
            Leave {org.name}
          </Button>
        </Card>

        {isOwner && (
          <Card icon={Trash2} title="Delete organization" description="Deletes both environments, all keys, customers, messages and logs, and disconnects your live bot. This can't be undone.">
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete organization
            </Button>
          </Card>
        )}
      </div>

      <Dialog open={deleting} onClose={() => setDeleting(false)} title={`Delete ${org.name}?`} description="Your integration stops working immediately: API keys are deleted and the live bot is disconnected.">
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setDeleteError(null);
            try {
              await api(`/portal/orgs/${orgId}`, { method: 'DELETE', body: { confirmName: new FormData(e.currentTarget).get('confirmName') } });
              router.replace('/dashboard');
            } catch (err) {
              setDeleteError(err instanceof ApiError ? err.message : 'Something went wrong');
            }
          }}
          className="space-y-4"
        >
          <Input name="confirmName" label={`Type ${org.name} to confirm`} required autoComplete="off" />
          {deleteError && <Alert>{deleteError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Delete organization
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
