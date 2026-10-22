"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Below lg the sidebar collapses into a top bar: `toolbar` (the bell) stays
 * visible next to a menu button, and `children` (nav + profile) only show
 * while the menu is open. From lg up the children are always shown and the
 * button is hidden, so the desktop sidebar is unchanged.
 */
export function MobileMenu({
  toolbar,
  children,
}: {
  toolbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Remember which page the menu was opened on, so navigating closes it
  // without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <>
      <div className="absolute right-3 top-4 flex items-center gap-1 lg:hidden">
        {toolbar}
        <button
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex size-10 items-center justify-center rounded-xl text-foreground transition hover:bg-foreground/[0.05]"
        >
          {open ? <X className="size-5" strokeWidth={1.8} /> : <Menu className="size-5" strokeWidth={1.8} />}
        </button>
      </div>

      <div
        className={cn(
          "max-h-[calc(100dvh-5.5rem)] flex-1 flex-col overflow-y-auto lg:flex lg:max-h-none lg:overflow-visible",
          open ? "flex" : "hidden",
        )}
      >
        {children}
      </div>
    </>
  );
}
