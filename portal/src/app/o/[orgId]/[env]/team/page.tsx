'use client';

import { Mail, UserPlus, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Alert, Badge, Button, Card, Dialog, Input, PageHeader, Select, Skeleton, Table, timeAgo } from '@/components/ui';
import { api, ApiError, fetcher } from '@/lib/api';
import { useOrg, useOrgParams, useRequireUser } from '@/lib/hooks';
import type { TeamOverview } from '@/lib/types';

export default function TeamPage() {
  const { orgId } = useOrgParams();
  const { user } = useRequireUser();
  const { data: org } = useOrg();
  const path = `/portal/orgs/${orgId}/team`;
  const { data: team, mutate } = useSWR<TeamOverview>(path, fetcher);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isOwner = org?.role === 'OWNER';

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const email = String(form.get('email'));
      await api(`${path}/invitations`, { method: 'POST', body: { email, role: form.get('role') } });
      setSentTo(email);
      setInviting(false);
      mutate();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function act(action: () => Promise<unknown>, question: string) {
    if (!confirm(question)) return;
    try {
      await action();
      mutate();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone here can use both environments. Owners can also invite and remove people."
        actions={
          isOwner && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus className="size-4" /> Invite teammate
            </Button>
          )
        }
      />
      {sentTo && (
        <div className="mb-5">
          <Alert tone="green">Invitation sent to {sentTo}. It expires in 7 days.</Alert>
        </div>
      )}

      <Card icon={Users} title="Members">
        {!team ? (
          <Skeleton className="h-24" />
        ) : (
          <Table head={['Name', 'Email', 'Role', 'Joined', '']}>
            {team.members.map((m) => (
              <tr key={m.userId}>
                <td>
                  <span className="flex items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium text-ink">
                      {m.name} {m.userId === user?.id && <span className="text-muted">(you)</span>}
                    </span>
                  </span>
                </td>
                <td className="text-muted">{m.email}</td>
                <td>
                  <Badge tone={m.role === 'OWNER' ? 'blue' : 'gray'}>{m.role.toLowerCase()}</Badge>
                </td>
                <td className="whitespace-nowrap text-muted">{timeAgo(m.joinedAt)}</td>
                <td className="text-right">
                  {isOwner && m.userId !== user?.id && (
                    <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => act(() => api(`${path}/members/${m.userId}`, { method: 'DELETE' }), `Remove ${m.name} from this organization?`)}>
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {team && team.invitations.length > 0 && (
        <Card icon={Mail} title="Pending invitations" className="mt-6">
          <Table head={['Email', 'Role', 'Sent', '']}>
            {team.invitations.map((i) => (
              <tr key={i.id}>
                <td className="text-ink">{i.email}</td>
                <td>
                  <Badge>{i.role.toLowerCase()}</Badge>
                </td>
                <td className="whitespace-nowrap text-muted">{timeAgo(i.createdAt)}</td>
                <td className="text-right">
                  {isOwner && (
                    <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => act(() => api(`${path}/invitations/${i.id}`, { method: 'DELETE' }), `Cancel the invitation for ${i.email}?`)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Dialog open={inviting} onClose={() => setInviting(false)} title="Invite a teammate" description="They'll get an email with a link to join. They must sign in with this email to accept.">
        <form onSubmit={invite} className="space-y-4">
          <Input name="email" type="email" label="Email" placeholder="teammate@company.com" required autoFocus />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Role</span>
            <Select name="role" defaultValue="MEMBER" className="w-full">
              <option value="MEMBER">Member: use keys, webhooks, logs and the playground</option>
              <option value="OWNER">Owner: also manage the team</option>
            </Select>
          </label>
          {error && <Alert>{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setInviting(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Send invitation
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
