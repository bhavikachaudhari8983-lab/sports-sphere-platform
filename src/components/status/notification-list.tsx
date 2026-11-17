"use client";

import { useEffect } from "react";
import { Bell, Mail } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export type NotificationItem = { id: string; title: string; body: string; createdAt: string; unread: boolean; emailed: boolean };

/** The student's personal notices. Unread ones are highlighted, then marked as read once shown. */
export function NotificationList({ items }: { items: NotificationItem[] }) {
  const hasUnread = items.some((n) => n.unread);
  useEffect(() => {
    if (hasUnread) void fetch("/api/student/notifications", { method: "POST" }).catch(() => undefined);
  }, [hasUnread]);
  return (
    <ul className="space-y-3">
      {items.map((n) => (
        <li key={n.id} className={`rounded-xl border p-3 ${n.unread ? "border-accent bg-tint" : "border-border"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Bell className="size-4 text-muted" aria-hidden />
            <p className="font-semibold">{n.title}</p>
            {n.unread && <span className="rounded-full bg-accent px-2 py-0.5 text-small font-semibold text-accent-fg">New</span>}
            <span className="ml-auto text-small text-muted">{formatDateTime(n.createdAt)}</span>
          </div>
          {n.body.split("\n").map((line, i) => (
            <p key={i} className="mt-1 text-small">
              {line}
            </p>
          ))}
          {n.emailed && (
            <p className="mt-1 inline-flex items-center gap-1 text-small text-muted">
              <Mail className="size-3.5" aria-hidden /> Also sent to your email
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
