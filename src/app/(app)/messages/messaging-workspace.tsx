'use client';

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Archive,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Edit3,
  Hash,
  History,
  Megaphone,
  Pin,
  PinOff,
  Reply,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  UserPlus,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Channel, DirectConversation, DirectTarget, Message, MessageAudit, MessageRevision, UnreadSummary } from '@/lib/types';
import {
  acknowledgeAnnouncement,
  deleteMessage,
  editMessage,
  getMessageRevisions,
  markChannelRead,
  sendMessage,
  startDirectConversation,
  togglePin,
  toggleReaction,
} from './actions';

export interface MessageView {
  message: Message;
  authorName: string;
  authorInitial: string;
  acknowledged: boolean;
  /** True once another participant has seen the message; edits are then locked. */
  seen: boolean;
  acknowledgmentCount?: number;
}

type AuditView = MessageAudit & { actorName: string };

export function MessagingWorkspace({
  channels,
  directConversations,
  directTargets,
  selectedDirect,
  canStartDirect,
  canDirectReply,
  selectedChannelId,
  messages,
  query,
  unread,
  currentUserId,
  canWrite,
  canAnnounce,
  canModerate,
  canAudit,
  audit,
  totalMembers,
}: {
  channels: Channel[];
  directConversations: DirectConversation[];
  directTargets: DirectTarget[];
  selectedDirect: DirectConversation | null;
  canStartDirect: boolean;
  canDirectReply: boolean;
  selectedChannelId: string;
  messages: MessageView[];
  query: string;
  unread: UnreadSummary;
  currentUserId: string;
  canWrite: boolean;
  canAnnounce: boolean;
  canModerate: boolean;
  canAudit: boolean;
  audit: AuditView[];
  totalMembers: number;
}) {
  const router = useRouter();
  const selectedChannel = selectedDirect?.channel ?? channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const [search, setSearch] = useState(query);
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function refreshSoon() {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 250);
  }

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  useEffect(() => {
    void markChannelRead(selectedChannelId).then(() => router.refresh());
  }, [router, selectedChannelId]);

  function chooseChannel(channelId: string) {
    const params = new URLSearchParams();
    params.set('channel', channelId);
    if (search.trim()) params.set('q', search.trim());
    router.push(`/messages?${params.toString()}`);
  }

  function chooseDirect(channelId: string) {
    const params = new URLSearchParams();
    params.set('dm', channelId);
    if (search.trim()) params.set('q', search.trim());
    router.push(`/messages?${params.toString()}`);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    if (selectedDirect) chooseDirect(selectedChannelId);
    else chooseChannel(selectedChannelId);
  }

  async function run(action: Promise<{ ok: boolean; error?: string }>, success?: string) {
    const result = await action;
    if (!result.ok) toast.error(result.error ?? 'Something went wrong.');
    else if (success) toast.success(success);
    router.refresh();
  }

  async function onDelete(message: MessageView) {
    if (!window.confirm('Delete this message? It will be retained in the audit trail.')) return;
    await run(deleteMessage(message.message.id), 'Message deleted');
  }

  const topLevel = useMemo(() => messages.filter(({ message }) => !message.parentId || !messages.some((candidate) => candidate.message.id === message.parentId)), [messages]);
  const replies = useMemo(() => {
    const map = new Map<string, MessageView[]>();
    for (const item of messages) {
      if (!item.message.parentId || !messages.some((candidate) => candidate.message.id === item.message.parentId)) continue;
      const list = map.get(item.message.parentId) ?? [];
      list.push(item);
      map.set(item.message.parentId, list);
    }
    return map;
  }, [messages]);
  const pinned = messages.filter(({ message }) => message.pinned);
  const selectedUnread = unread.channels.find((item) => item.channelId === selectedChannelId)?.unread ?? 0;
  const canInteract = canWrite || (!!selectedDirect && canDirectReply);

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden lg:sticky lg:top-20">
        <CardHeader className="border-b bg-muted/20 px-4 py-4">
          <CardTitle className="text-sm">Store channels</CardTitle>
          <CardDescription className="text-xs">Keep updates visible to the whole team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 p-2">
          {channels.map((channel) => {
            const count = unread.channels.find((item) => item.channelId === channel.id)?.unread ?? 0;
            const isSelected = channel.id === selectedChannelId;
            return (
              <button
                type="button"
                key={channel.id}
                onClick={() => chooseChannel(channel.id)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                  isSelected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {channel.kind === 'announcement' ? <Megaphone className="h-4 w-4 shrink-0" /> : <Hash className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate font-medium">{channel.name}</span>
                {count > 0 && <Badge variant={isSelected ? 'default' : 'secondary'} className="px-1.5">{count}</Badge>}
                <ChevronRight className={cn('h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60', isSelected && 'opacity-60')} />
              </button>
            );
          })}
          {(canStartDirect || directConversations.length > 0) && (
            <div className="mt-5 border-t pt-4">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Direct messages</span>
                {canStartDirect && <NewDirectDialog targets={directTargets} onStarted={(channelId) => chooseDirect(channelId)} />}
              </div>
              <div className="space-y-1">
                {directConversations.map((conversation) => {
                  const isSelected = selectedDirect?.channel.id === conversation.channel.id;
                  return (
                    <button type="button" key={conversation.channel.id} onClick={() => chooseDirect(conversation.channel.id)} className={cn('group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors', isSelected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">{conversation.partnerName.slice(0, 1).toUpperCase()}</div>
                      <span className="min-w-0 flex-1 truncate font-medium">{conversation.partnerName}</span>
                      {conversation.unread > 0 && <Badge variant={isSelected ? 'default' : 'secondary'} className="px-1.5">{conversation.unread}</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-4 rounded-md border border-dashed bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Permission-aware</div>
            Announcements are manager-controlled. Every edit, reaction, pin, and deletion is retained in the store audit trail.
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b bg-gradient-to-r from-primary/[0.08] to-transparent p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', selectedDirect ? 'bg-violet-100 text-violet-700' : selectedChannel.kind === 'announcement' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary')}>
                {selectedDirect ? <UserRound className="h-5 w-5" /> : selectedChannel.kind === 'announcement' ? <Megaphone className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h2 className="truncate text-base font-semibold">{selectedDirect ? selectedDirect.partnerName : selectedChannel.name}</h2>{selectedDirect && <Badge variant="outline">Private</Badge>}{selectedUnread > 0 && <Badge variant="default">{selectedUnread} new</Badge>}</div>
                <p className="truncate text-xs text-muted-foreground">{selectedDirect ? selectedDirect.partnerEmail : selectedChannel.description}</p>
              </div>
            </div>
            <form onSubmit={submitSearch} className="flex w-full gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-56"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this channel" className="h-9 pl-8" aria-label="Search messages" /></div>
              <Button type="submit" variant="outline" size="sm" className="h-9">Search</Button>
              {query && <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={() => { setSearch(''); router.push(selectedDirect ? `/messages?dm=${selectedChannelId}` : `/messages?channel=${selectedChannelId}`); }} aria-label="Clear search"><X className="h-4 w-4" /></Button>}
            </form>
          </div>

          {pinned.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b bg-amber-50/70 px-4 py-2.5 text-xs dark:bg-amber-950/20">
              <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <div className="flex min-w-0 gap-3">
                {pinned.map(({ message }) => <span key={message.id} className="max-w-[18rem] shrink-0 truncate text-amber-900 dark:text-amber-200">{message.body}</span>)}
              </div>
            </div>
          )}

          <div className="min-h-[28rem] space-y-5 bg-background p-4 sm:p-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[22rem] flex-col items-center justify-center text-center">
                <div className="rounded-2xl bg-primary/10 p-4 text-primary"><Archive className="h-7 w-7" /></div>
                <h3 className="mt-4 font-semibold">{query ? 'No messages found' : `Welcome to ${selectedChannel.name}`}</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">{query ? 'Try a different search term.' : selectedChannel.kind === 'announcement' ? 'Leadership updates will appear here.' : 'Start the conversation with your store team.'}</p>
              </div>
            ) : topLevel.map((item) => (
              <MessageItem
                key={item.message.id}
                item={item}
                replies={replies.get(item.message.id) ?? []}
                currentUserId={currentUserId}
                canWrite={canInteract}
                canModerate={canModerate}
                canAudit={canAudit}
                onReply={() => setReplyTo(item)}
                onEdit={() => setEditing(item)}
                onDelete={() => void onDelete(item)}
                onRefresh={refreshSoon}
                totalMembers={totalMembers}
                editing={editing?.message.id === item.message.id ? editing : null}
                clearEditing={() => setEditing(null)}
              />
            ))}
          </div>

          {(canInteract || (selectedChannel.kind === 'announcement' && canAnnounce)) ? (
            <Composer
              channel={selectedChannel}
              replyTo={replyTo}
              canWrite={canInteract}
              canAnnounce={canAnnounce}
              onCancelReply={() => setReplyTo(null)}
              onSent={() => { setReplyTo(null); router.refresh(); }}
            />
          ) : (
            <div className="border-t bg-muted/20 px-5 py-4 text-sm text-muted-foreground">You have read-only access to this store’s messages.</div>
          )}
        </Card>

        {selectedChannel.kind === 'announcement' && messages.some(({ message }) => message.requiresAck && !messages.find((m) => m.message.id === message.id)?.acknowledged) && (
          <Card className="border-amber-300/70 bg-amber-50/60 dark:bg-amber-950/20">
            <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
              <div className="flex items-start gap-2"><Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>Announcements are automatically recorded as seen when they become visible, so important updates cannot be dismissed without an audit timestamp.</span></div>
            </CardContent>
          </Card>
        )}

        {audit.length > 0 && <AuditPreview audit={audit} />}
      </div>
    </div>
  );
}

function Composer({ channel, replyTo, canWrite, canAnnounce, onCancelReply, onSent }: { channel: Channel; replyTo: MessageView | null; canWrite: boolean; canAnnounce: boolean; onCancelReply: () => void; onSent: () => void }) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canPost = channel.kind === 'general' || channel.kind === 'direct' ? canWrite : replyTo ? canWrite : canAnnounce;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canPost || !body.trim() || submitting) return;
    setSubmitting(true);
    const result = await sendMessage({ channelId: channel.id, body, parentId: replyTo?.message.id });
    setSubmitting(false);
    if (!result.ok) return toast.error(result.error);
    setBody('');
    onSent();
  }
  return (
    <form onSubmit={submit} className="border-t bg-muted/20 p-3 sm:p-4">
      {replyTo && <div className="mb-2 flex items-center justify-between rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><span className="flex min-w-0 items-center gap-1.5"><Reply className="h-3.5 w-3.5 shrink-0 text-primary" /> Replying to <strong className="truncate text-foreground">{replyTo.authorName}</strong></span><button type="button" onClick={onCancelReply} className="rounded p-1 hover:bg-muted" aria-label="Cancel reply"><X className="h-3.5 w-3.5" /></button></div>}
      <div className="flex items-end gap-2"><Textarea value={body} onChange={(event) => setBody(event.target.value)} disabled={!canPost || submitting} placeholder={canPost ? (channel.kind === 'announcement' && !replyTo ? 'Write a clear update for the team…' : 'Write a message…') : 'Only managers can start announcements'} className="min-h-[5rem] resize-none bg-background" maxLength={4000} /><Button type="submit" disabled={!canPost || !body.trim() || submitting} size="icon" aria-label="Send message"><Send className="h-4 w-4" /></Button></div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{channel.kind === 'announcement' && !replyTo ? 'Managers only · requires acknowledgment' : channel.kind === 'direct' ? 'Private to this conversation' : 'Plain text · 4,000 character limit'}</span><span>{body.length}/4000</span></div>
    </form>
  );
}

function MessageItem({ item, replies, currentUserId, canWrite, canModerate, canAudit, onReply, onEdit, onDelete, onRefresh, totalMembers, editing, clearEditing }: { item: MessageView; replies: MessageView[]; currentUserId: string; canWrite: boolean; canModerate: boolean; canAudit: boolean; onReply: () => void; onEdit: () => void; onDelete: () => void; onRefresh: () => void; totalMembers: number; editing: MessageView | null; clearEditing: () => void }) {
  const { message } = item;
  const own = message.authorId === currentUserId;
  const canEdit = own && !item.seen;
  const canDelete = own || canModerate;
  const articleRef = useRef<HTMLElement>(null);
  const ackStartedRef = useRef(false);
  const [ackPending, setAckPending] = useState(false);
  const [history, setHistory] = useState<MessageRevision[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    setHistoryLoading(true);
    const result = await getMessageRevisions(message.id);
    setHistoryLoading(false);
    if (!result.ok) return toast.error(result.error);
    setHistory(result.revisions ?? []);
  }

  useEffect(() => {
    if (!message.requiresAck || item.acknowledged || !articleRef.current) return;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const recordSeen = () => {
      if (ackStartedRef.current) return;
      ackStartedRef.current = true;
      setAckPending(true);
      void acknowledgeAnnouncement(message.id).then((result) => {
        setAckPending(false);
        if (!result.ok) {
          ackStartedRef.current = false;
          toast.error(result.error);
          retryTimer = setTimeout(recordSeen, 1500);
          return;
        }
        onRefresh();
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      recordSeen();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)) recordSeen();
    }, { threshold: [0.6] });
    observer.observe(articleRef.current);
    return () => {
      observer.disconnect();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [item.acknowledged, message.id, message.requiresAck, onRefresh]);

  return (
    <article ref={articleRef} className={cn('group flex gap-3', message.pinned && 'rounded-lg bg-amber-50/50 p-2.5 dark:bg-amber-950/10')}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{item.authorInitial}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><span className="text-sm font-semibold">{item.authorName}</span><time className="text-[11px] text-muted-foreground" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>{message.editedAt && <span className="text-[11px] text-muted-foreground">(edited)</span>}{message.pinned ? <Badge variant="warning" className="px-1.5 py-0"><Pin className="mr-1 h-3 w-3" /> pinned</Badge> : null}</div>
        {editing ? <EditBox messageId={message.id} initial={message.body} onCancel={clearEditing} onSaved={() => { clearEditing(); onRefresh(); }} /> : <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{message.body}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {['👍', '✅', '👀', '❤️'].map((emoji) => { const count = message.reactions[emoji]?.length ?? 0; const reacted = message.reactions[emoji]?.includes(currentUserId); return <button key={emoji} type="button" disabled={!canWrite} onClick={() => void toggleReaction(message.id, emoji).then((result) => { if (!result.ok) toast.error(result.error); else onRefresh(); })} className={cn('rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50', reacted && 'border-primary/40 bg-primary/10')}>{emoji}{count > 0 && <span className="ml-1 text-muted-foreground">{count}</span>}</button>; })}
          <button type="button" onClick={onReply} disabled={!canWrite} className="ml-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><Reply className="h-3.5 w-3.5" /> Reply{replies.length > 0 ? ` · ${replies.length}` : ''}</button>
          {canModerate && <button type="button" onClick={() => void togglePin(message.id).then((result) => { if (!result.ok) toast.error(result.error); else onRefresh(); })} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">{message.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}{message.pinned ? 'Unpin' : 'Pin'}</button>}
          {canEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Edit3 className="h-3.5 w-3.5" /> Edit</button>}
          {own && item.seen && <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Seen · edit locked</span>}
          {canDelete && <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
          {message.editedAt && (own || canAudit) && <button type="button" onClick={() => void toggleHistory()} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><History className="h-3.5 w-3.5" /> {historyLoading ? 'Loading…' : history ? 'Hide history' : 'History'}</button>}
          {message.requiresAck && !item.acknowledged && <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-700"><Bell className="h-3.5 w-3.5" /> {ackPending ? 'Recording seen…' : 'Seen when visible'}</span>}
          {message.requiresAck && item.acknowledged && <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-success"><Check className="h-3.5 w-3.5" /> Seen and recorded</span>}
          {message.requiresAck && item.acknowledgmentCount !== undefined && totalMembers > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-1 text-xs tabular-nums text-muted-foreground" title="Announcement visibility acknowledgments"><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Seen by {item.acknowledgmentCount} of {totalMembers}</span>}
        </div>
        {history && <div className="mt-3 rounded-md border bg-muted/20 p-3 text-xs"><div className="mb-2 font-semibold text-foreground">Immutable edit history</div><div className="space-y-2">{history.map((revision) => <div key={revision.id} className="border-l-2 border-primary/20 pl-2"><div className="text-[10px] text-muted-foreground">Version {revision.version} · {new Date(revision.createdAt).toLocaleString()}</div><p className="mt-0.5 whitespace-pre-wrap break-words">{revision.body}</p></div>)}</div></div>}
        {replies.length > 0 && <div className="mt-3 space-y-3 border-l-2 border-primary/15 pl-3">{replies.map((reply) => <ReplyItem key={reply.message.id} item={reply} currentUserId={currentUserId} canWrite={canWrite} canModerate={canModerate} onRefresh={onRefresh} />)}</div>}
      </div>
    </article>
  );
}

function ReplyItem({ item, currentUserId, canWrite, canModerate, onRefresh }: { item: MessageView; currentUserId: string; canWrite: boolean; canModerate: boolean; onRefresh: () => void }) {
  const own = item.message.authorId === currentUserId;
  const canEdit = own && !item.seen;
  const canDelete = own || canModerate;
  const [editing, setEditing] = useState(false);
  return <div className="flex gap-2.5"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{item.authorInitial}</div><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-2"><span className="text-xs font-semibold">{item.authorName}</span><time className="text-[10px] text-muted-foreground">{new Date(item.message.createdAt).toLocaleString()}</time>{item.message.editedAt && <span className="text-[10px] text-muted-foreground">(edited)</span>}</div>{editing ? <EditBox messageId={item.message.id} initial={item.message.body} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onRefresh(); }} /> : <p className="whitespace-pre-wrap break-words text-sm text-foreground/85">{item.message.body}</p>}<div className="mt-1 flex items-center gap-1">{['👍', '✅'].map((emoji) => { const count = item.message.reactions[emoji]?.length ?? 0; return <button key={emoji} type="button" disabled={!canWrite} onClick={() => void toggleReaction(item.message.id, emoji).then(onRefresh)} className="rounded-full px-1.5 py-0.5 text-xs hover:bg-muted disabled:opacity-50">{emoji}{count ? ` ${count}` : ''}</button>; })}{canEdit && <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground hover:text-foreground"><Edit3 className="h-3 w-3" /></button>}{item.seen && own && <span className="text-[10px] text-muted-foreground">seen · locked</span>}{canDelete && <button type="button" onClick={() => void deleteMessage(item.message.id).then((result) => { if (!result.ok) toast.error(result.error); else onRefresh(); })} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>}</div></div></div>;
}

function EditBox({ messageId, initial, onCancel, onSaved }: { messageId: string; initial: string; onCancel: () => void; onSaved: () => void }) {
  const [body, setBody] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const result = await editMessage(messageId, body);
    setSaving(false);
    if (!result.ok) toast.error(result.error); else onSaved();
  }
  return <div className="mt-2 flex gap-2"><Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-[4rem]" maxLength={4000} /><div className="flex flex-col gap-1"><Button type="button" size="sm" disabled={saving} onClick={save}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div></div>;
}

function NewDirectDialog({ targets, onStarted }: { targets: DirectTarget[]; onStarted: (channelId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  if (!targets.length) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!targetId || submitting) return;
    setSubmitting(true);
    const result = await startDirectConversation(targetId);
    setSubmitting(false);
    if (!result.ok) return toast.error(result.error);
    if (!result.channelId) return toast.error('Could not start conversation.');
    setOpen(false);
    onStarted(result.channelId);
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Start a direct message"><UserPlus className="h-4 w-4" /></button>;
  return <form onSubmit={submit} className="mb-2 rounded-md border bg-background p-2 shadow-sm"><label className="sr-only" htmlFor="direct-target">Employee</label><select id="direct-target" value={targetId} onChange={(event) => setTargetId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring">{targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.email}</option>)}</select><div className="mt-2 flex justify-end gap-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Opening…' : 'Open chat'}</Button></div></form>;
}

function AuditPreview({ audit }: { audit: AuditView[] }) {
  return <Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" /> Recent messaging audit</CardTitle><CardDescription>Manager-visible administrative history. Message bodies are never duplicated here.</CardDescription></div><Badge variant="outline">{audit.length} events</Badge></CardHeader><CardContent className="pt-0"><div className="divide-y rounded-md border">{audit.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span><strong>{entry.actorName}</strong> {entry.action.replace('_', ' ')} {entry.messageId ? 'a message' : 'messaging data'}</span><time className="shrink-0 text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</time></div>)}</div></CardContent></Card>;
}
