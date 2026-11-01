'use client';

import { ScrollText } from 'lucide-react';
import useSWRInfinite from 'swr/infinite';
import { Badge, Button, Card, Empty, formatDate, PageHeader, Skeleton, Table, timeAgo } from '@/components/ui';
import { fetcher } from '@/lib/api';
import { useOrgParams } from '@/lib/hooks';
import type { Page } from '@/lib/types';

interface AuditEntry {
  id: string;
  action: string;
  actorEmail: string | null;
  target: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const labels: Record<string, string> = {
  'org.created': 'Created the organization',
  'org.renamed': 'Renamed the organization',
  'api_key.created': 'Created an API key',
  'api_key.revoked': 'Revoked an API key',
  'bot.connected': 'Connected the live bot',
  'bot.disconnected': 'Disconnected the live bot',
  'webhook.updated': 'Changed the webhook URL',
  'signing_secret.rotated': 'Rotated the signing secret',
  'member.invited': 'Invited a teammate',
  'invitation.revoked': 'Cancelled an invitation',
  'member.joined': 'Joined the organization',
  'member.removed': 'Removed a member',
  'member.left': 'Left the organization',
  'plan.changed': 'Plan changed',
  'limit.requested': 'Requested a higher limit',
  'limit.approved': 'Higher limit approved',
  'limit.declined': 'Higher limit declined',
  'limit.changed': 'Monthly limit changed',
};

function details(entry: AuditEntry) {
  const m = entry.metadata ?? {};
  const parts = [entry.target, m.environment ? `${m.environment}` : null, m.role ? `as ${String(m.role).toLowerCase()}` : null, m.from ? `from ${m.from}` : null].filter(Boolean);
  return parts.join(' · ');
}

export default function AuditPage() {
  const { orgId } = useOrgParams();
  const { data, size, setSize, isLoading } = useSWRInfinite<Page<AuditEntry>>(
    (index, previous) => (previous && !previous.nextCursor ? null : `/portal/orgs/${orgId}/audit?limit=30${previous ? `&cursor=${previous.nextCursor}` : ''}`),
    fetcher,
  );
  const entries = data?.flatMap((p) => p.data) ?? [];
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);

  return (
    <>
      <PageHeader title="Audit log" description="Who changed what in this organization, across both environments." />
      <Card>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : entries.length === 0 ? (
          <Empty title="Nothing recorded yet" icon={ScrollText} />
        ) : (
          <Table head={['Action', 'Details', 'By', 'When']}>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="font-medium text-ink">{labels[e.action] ?? e.action}</td>
                <td className="max-w-72 truncate text-muted">{details(e) || '—'}</td>
                <td className="text-muted">{e.actorEmail ?? <Badge>Telenotify team</Badge>}</td>
                <td className="whitespace-nowrap text-muted" title={formatDate(e.createdAt)}>
                  {timeAgo(e.createdAt)}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {hasMore && (
          <div className="mt-4 text-center">
            <Button variant="secondary" onClick={() => setSize(size + 1)}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
