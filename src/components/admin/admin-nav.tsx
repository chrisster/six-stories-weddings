"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ContactRound,
  FolderKanban,
  ImageIcon,
  LayoutDashboard,
  PlusSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/projects/new", label: "New Wedding", icon: PlusSquare },
  { href: "/admin/contacts", label: "Contacts", icon: ContactRound },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/galleries", label: "Galleries", icon: ImageIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {links.map((link) => {
        const isActive =
          link.href === "/admin" ? pathname === link.href : pathname.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-transparent bg-transparent hover:border-border hover:bg-white/60",
            )}
          >
            <Icon className="size-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}