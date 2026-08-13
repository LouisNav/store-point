import { requireActiveStore, can } from '@/lib/auth/guards';
import { Permission } from '@/lib/rbac';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { messagingRepo } from '@/lib/db/repositories/messaging.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import type { DirectTarget } from '@/lib/types';
import { MessagingWorkspace, type MessageView } from './messaging-workspace';

interface PageProps {
  searchParams: Promise<{ channel?: string; dm?: string; q?: string }>;
}

export default async function MessagesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { storeId, role, session } = await requireActiveStore();
  const channels = messagingRepo.ensureDefaultChannels(storeId, session.userId!);
  const directConversations = messagingRepo.listDirectConversations(storeId, session.userId!);
  const selectedDirect = sp.dm ? directConversations.find((conversation) => conversation.channel.id === sp.dm) ?? null : null;
  const selected = selectedDirect?.channel ?? channels.find((channel) => channel.id === sp.channel) ?? channels.find((channel) => channel.slug === 'general') ?? channels[0];
  if (!selected) {
    return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Messaging is not ready yet.</div>;
  }

  const messages = messagingRepo.listMessages(storeId, selected.id, { search: sp.q }, session.userId!);
  const directTargets: DirectTarget[] = can(role, Permission.MessagingDirect)
    ? membershipsRepo.forStore(storeId)
        .filter((membership) => membership.userId !== session.userId)
        .map((membership) => usersRepo.byId(membership.userId) ? {
          id: membership.userId,
          name: usersRepo.byId(membership.userId)!.name,
          email: usersRepo.byId(membership.userId)!.email,
          role: membership.role,
        } : null)
        .filter((target): target is DirectTarget => !!target)
    : [];
  const messageViews: MessageView[] = messages.map((message) => {
    const author = usersRepo.byId(message.authorId);
    return {
      message,
      authorName: author?.name ?? 'Former team member',
      authorInitial: (author?.name ?? '?').slice(0, 1).toUpperCase(),
      acknowledged: message.requiresAck ? messagingRepo.hasAcknowledged(message.id, session.userId!) : false,
      seen: messagingRepo.hasBeenSeenByOther(storeId, message.id, session.userId!),
      acknowledgmentCount: message.requiresAck && can(role, Permission.MessagingAudit) ? messagingRepo.acknowledgmentCount(storeId, message.id) : undefined,
    };
  });
  const unread = messagingRepo.unreadSummary(storeId, session.userId!);
  const audit = can(role, Permission.MessagingAudit)
    ? messagingRepo.auditForStore(storeId, 12).map((entry) => ({
        ...entry,
        actorName: usersRepo.byId(entry.actorId)?.name ?? 'Former team member',
      }))
    : [];

  return (
    <div>
      <PageHeader
        title="Messages"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Coordinate store operations in one place.
            <Badge variant="secondary"><MessageSquare className="mr-1 h-3 w-3" /> {unread.total} unread</Badge>
            {can(role, Permission.MessagingAudit) && <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3" /> Audit enabled</Badge>}
          </span>
        }
      />
      <MessagingWorkspace
        channels={channels}
        directConversations={directConversations}
        directTargets={directTargets}
        selectedDirect={selectedDirect}
        canStartDirect={can(role, Permission.MessagingDirect)}
        canDirectReply={can(role, Permission.MessagingRead)}
        selectedChannelId={selected.id}
        messages={messageViews}
        query={sp.q ?? ''}
        unread={unread}
        currentUserId={session.userId!}
        canWrite={can(role, Permission.MessagingWrite)}
        canAnnounce={can(role, Permission.MessagingAnnouncement)}
        canModerate={can(role, Permission.MessagingModerate)}
        canAudit={can(role, Permission.MessagingAudit)}
        audit={audit}
        totalMembers={membershipsRepo.forStore(storeId).length}
      />
    </div>
  );
}
