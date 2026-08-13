import { redirect } from 'next/navigation';
import { can, isRootUser, requireActiveStore } from '@/lib/auth/guards';
import { globalAnnouncementsRepo } from '@/lib/db/repositories/global-announcements.repo';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Permission } from '@/lib/rbac';
import { Megaphone, ShieldCheck } from 'lucide-react';
import { GlobalAnnouncementForm } from './global-announcement-form';

export default async function GlobalAnnouncementsPage() {
  const { session, role } = await requireActiveStore();
  if (!(await isRootUser(session)) || !can(role, Permission.GlobalAnnouncementManage)) redirect('/dashboard');
  const announcements = globalAnnouncementsRepo.list(50);
  const audit = globalAnnouncementsRepo.audit(12);

  return (
    <div className="space-y-5">
      <PageHeader title="Global announcements" description="Publish and audit messages delivered across every store." />
      <GlobalAnnouncementForm />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-primary" /> Published announcements</CardTitle>
          <CardDescription>Global messages remain separate from store conversations and respect their expiration dates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {announcements.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No global announcements have been published.</p> : announcements.map((announcement) => {
            const active = !announcement.deletedAt && (!announcement.expiresAt || new Date(announcement.expiresAt) > new Date());
            return <article key={announcement.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{announcement.title}</h3><Badge variant={announcement.priority === 'critical' ? 'destructive' : announcement.priority === 'high' ? 'warning' : 'secondary'}>{announcement.priority}</Badge><Badge variant={active ? 'success' : 'muted'}>{active ? 'Active' : 'Expired'}</Badge>{announcement.requiresAck ? <Badge variant="outline">Acknowledgment required</Badge> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm text-foreground/85">{announcement.body}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>Published {new Date(announcement.publishedAt).toLocaleString()}</span>{announcement.expiresAt && <span>Expires {new Date(announcement.expiresAt).toLocaleString()}</span>}{announcement.requiresAck && <span className="font-medium text-foreground">{globalAnnouncementsRepo.acknowledgmentCount(announcement.id)} acknowledgments</span>}</div></article>;
          })}
        </CardContent>
      </Card>
      {audit.length > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Global announcement audit</CardTitle><CardDescription>Append-only platform-level history.</CardDescription></CardHeader><CardContent><div className="divide-y rounded-md border">{audit.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span><strong>{usersRepo.byId(entry.actorId)?.name ?? 'Former administrator'}</strong> {entry.action} an announcement</span><time className="shrink-0 text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</time></div>)}</div></CardContent></Card>}
    </div>
  );
}
