'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormLabel } from '@/components/ui/label';
import { createGlobalAnnouncement } from './actions';

export function GlobalAnnouncementForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'critical'>('normal');
  const [requiresAck, setRequiresAck] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const result = await createGlobalAnnouncement({
      title,
      body,
      priority,
      requiresAck,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Global announcement published to every store');
    setTitle('');
    setBody('');
    setPriority('normal');
    setRequiresAck(true);
    setExpiresAt('');
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Megaphone className="h-5 w-5" /></div>
        <div><h2 className="font-semibold">Publish across every store</h2><p className="text-sm text-muted-foreground">Use for company-wide policy, safety, compliance, or operational updates.</p></div>
      </div>
      <div>
        <FormLabel required>Title</FormLabel>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. Updated safety procedure" />
      </div>
      <div>
        <FormLabel required>Announcement</FormLabel>
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} className="min-h-[9rem] resize-y" placeholder="Write the message every active store member should see…" />
        <div className="mt-1 text-right text-[11px] text-muted-foreground">{body.length}/4000</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FormLabel>Priority</FormLabel>
          <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <FormLabel hint="Leave empty to keep it active until manually expired">Expires at</FormLabel>
          <Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </div>
      </div>
      <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
        <input type="checkbox" checked={requiresAck} onChange={(event) => setRequiresAck(event.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
        <span><strong>Require visibility acknowledgment</strong><span className="block text-xs text-muted-foreground">The announcement is automatically recorded when each user sees it.</span></span>
      </label>
      <div className="flex justify-end border-t pt-4"><Button type="submit" disabled={saving || !title.trim() || !body.trim()}><Send className="h-4 w-4" />{saving ? 'Publishing…' : 'Publish globally'}</Button></div>
    </form>
  );
}
