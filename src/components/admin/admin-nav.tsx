"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FolderKanban, ImageIcon, LayoutDashboard } from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/galleries", label: "Galleries", icon: ImageIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => {
        const isActive =
          link.href === "/admin" ? pathname === link.href : pathname.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-white hover:border-foreground/35",
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