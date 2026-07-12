"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CheckSquare,
  ContactRound,
  FolderKanban,
  ImageIcon,
  UserCircle,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavRole = "admin" | "crew" | null | undefined;

const links = [
  { href: "/admin", label: "Projects", icon: FolderKanban },
  { href: "/admin/galleries", label: "Galleries", icon: ImageIcon },
  { href: "/admin/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/admin/contacts", label: "Contacts", icon: ContactRound, hideForCrew: true },
  { href: "/admin/financials", label: "Financials", icon: Wallet, hideForCrew: true },
  { href: "/admin/team", label: "Team", icon: Users, adminOnly: true },
  { href: "/admin/organization", label: "Organization", icon: Building2, adminOnly: true },
  { href: "/admin/account", label: "Account", icon: UserCircle },
] as const;

export function AdminNav({ role }: { role?: NavRole }) {
  const pathname = usePathname();
  const isCrew = role === "crew";

  const visibleLinks = links.filter((link) => {
    if (isCrew && "hideForCrew" in link && link.hideForCrew) return false;
    if (isCrew && "adminOnly" in link && link.adminOnly) return false;
    return true;
  });

  return (
    <nav className="flex flex-col gap-1">
      {visibleLinks.map((link) => {
        const isActive =
          link.href === "/admin"
            ? pathname === "/admin" ||
              (pathname.startsWith("/admin/projects/") && !pathname.startsWith("/admin/projects/new"))
            : pathname.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "group inline-flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              isActive
                ? "bg-foreground/[0.06] font-medium text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-[18px] transition",
                isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
              strokeWidth={1.8}
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
