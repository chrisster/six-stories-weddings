"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  ContactRound,
  FolderKanban,
  ImageIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Projects", icon: FolderKanban },
  { href: "/admin/contacts", label: "Contacts", icon: ContactRound },
  { href: "/admin/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/galleries", label: "Galleries", icon: ImageIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1.5">
      {links.map((link) => {
        const isActive =
          link.href === "/admin"
            ? pathname === "/admin" || (pathname.startsWith("/admin/projects/") && !pathname.startsWith("/admin/projects/new"))
            : pathname.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
              isActive
                ? "border-border bg-muted/60 text-foreground"
                : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <Icon className="size-4" strokeWidth={1.8} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}