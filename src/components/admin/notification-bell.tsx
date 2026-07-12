"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";

import { markAllNotificationsReadAction } from "@/app/admin/notifications/actions";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markAll = () => {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground"
      >
        <Bell className="size-[18px]" strokeWidth={1.8} />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border/70 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                disabled={isPending}
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications.</p>
            ) : (
              <ul className="space-y-0.5">
                {notifications.map((n) => {
                  const content = (
                    <div
                      className={`rounded-xl px-3 py-2 transition ${
                        n.read ? "hover:bg-muted/50" : "bg-sky-50/70 hover:bg-sky-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read ? (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500" />
                        ) : (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-transparent" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          {n.body ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                          ) : null}
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link} onClick={() => setOpen(false)}>
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
