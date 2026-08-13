'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Megaphone, ShieldAlert } from 'lucide-react';
import { acknowledgeGlobalAnnouncement } from '@/app/(app)/settings/announcements/actions';
import type { GlobalAnnouncement } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function GlobalAnnouncementBanner({ announcements }: { announcements: GlobalAnnouncement[] }) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const started = useRef(new Set<string>());
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!announcements.length || !sectionRef.current) return;
    const record = (announcement: GlobalAnnouncement) => {
      if (!announcement.requiresAck || started.current.has(announcement.id)) return;
      started.current.add(announcement.id);
      void acknowledgeGlobalAnnouncement(announcement.id).then((result) => {
        if (result.ok) setSeen((current) => new Set(current).add(announcement.id));
        else started.current.delete(announcement.id);
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      // Without intersection support the banner is rendered in the active
      // viewport, so record every displayed announcement rather than silently
      // acknowledging only the first one.
      announcements.forEach(record);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6) continue;
        const id = (entry.target as HTMLElement).dataset.globalAnnouncementId;
        const announcement = announcements.find((item) => item.id === id);
        if (announcement) record(announcement);
      }
    }, { threshold: [0.6] });
    const elements = sectionRef.current.querySelectorAll<HTMLElement>('[data-global-announcement-id]');
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [announcements]);

  if (!announcements.length) return null;
  return (
    <section ref={sectionRef} aria-label="Global announcements" className="border-b bg-background px-3 py-3 md:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-2">
        {announcements.map((announcement) => (
          <article key={announcement.id} data-global-announcement-id={announcement.id} className={cn('rounded-lg border px-4 py-3 shadow-sm', announcement.priority === 'critical' ? 'border-destructive/40 bg-destructive/5' : announcement.priority === 'high' ? 'border-amber-300/70 bg-amber-50/70 dark:bg-amber-950/20' : 'border-primary/20 bg-primary/[0.04]')}>
            <div className="flex items-start gap-3">
              <div className={cn('mt-0.5 rounded-md p-2', announcement.priority === 'critical' ? 'bg-destructive/10 text-destructive' : announcement.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary')}>{announcement.priority === 'critical' ? <ShieldAlert className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{announcement.title}</h2><Badge variant="outline" className="text-[10px]">All stores</Badge>{announcement.priority !== 'normal' && <Badge variant={announcement.priority === 'critical' ? 'destructive' : 'warning'} className="text-[10px]">{announcement.priority}</Badge>}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{announcement.body}</p><div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground"><span>{new Date(announcement.publishedAt).toLocaleString()}</span>{announcement.requiresAck && (seen.has(announcement.id) ? <span className="inline-flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" /> Seen and recorded</span> : <span>Recording visibility…</span>)}</div></div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
