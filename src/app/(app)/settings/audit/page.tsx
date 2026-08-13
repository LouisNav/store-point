import { redirect } from 'next/navigation';
import { isRootUser, requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { auditRepo } from '@/lib/db/repositories/audit.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ShieldCheck } from 'lucide-react';

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ');
}

function actionVariant(action: string): 'success' | 'warning' | 'destructive' | 'muted' | 'secondary' {
  if (action.includes('failure') || action.includes('remove') || action.includes('suspend') || action.includes('delete')) return 'destructive';
  if (action.includes('success') || action.includes('reactivate') || action.includes('create')) return 'success';
  if (action.includes('role_change') || action.includes('update')) return 'warning';
  return 'secondary';
}

export default async function AuditPage() {
  const { storeId, role, session } = await requireActiveStore();
  if (!can(role, Permission.AuditRead)) redirect('/dashboard');

  const isRoot = await isRootUser(session);
  // Root sees the platform-wide feed; managers see their active store only.
  const events = isRoot ? auditRepo.listAll(200) : auditRepo.listForStore(storeId, 200);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description={
          isRoot
            ? 'Platform-wide activity: logins, role changes, price edits, and store switches. Append-only.'
            : 'Activity for this store: logins, role changes, and price edits. Append-only.'
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{events.length} recent event{events.length === 1 ? '' : 's'}</CardTitle>
          <CardDescription>Immutable record retained for compliance and dispute resolution.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<ShieldCheck className="h-6 w-6" />}
                title="No activity yet"
                description="Security-relevant actions will appear here as they happen."
              />
            </div>
          ) : (
            <div className="divide-y">
              {events.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={actionVariant(event.action)}>{actionLabel(event.action)}</Badge>
                      <span className="font-medium">{event.actorEmail ?? 'unknown'}</span>
                    </div>
                    {event.metadataJson !== '{}' && (
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {(() => {
                          try {
                            const meta = JSON.parse(event.metadataJson) as Record<string, unknown>;
                            return Object.entries(meta)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(' · ');
                          } catch {
                            return event.metadataJson;
                          }
                        })()}
                      </div>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
