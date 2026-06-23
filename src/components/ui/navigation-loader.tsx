"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timer = window.setTimeout(() => setLoading(false), 220);
    return () => window.clearTimeout(timer);
  }, [pathname, loading]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href") || "";
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        anchor.target === "_blank"
      ) {
        return;
      }

      setLoading(true);
    }

    function handleSubmit() {
      setLoading(true);
    }

    document.addEventListener("click", handleClick, { capture: true });
    document.addEventListener("submit", handleSubmit, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true } as EventListenerOptions);
      document.removeEventListener("submit", handleSubmit, { capture: true } as EventListenerOptions);
    };
  }, []);

  if (!loading) {
    return null;
  }

  return (
    <div aria-live="polite" aria-label="Loading" className="pointer-events-none fixed inset-x-0 top-0 z-[90]">
      <div className="h-0.5 w-full overflow-hidden bg-black/10">
        <div className="nav-loader-bar h-full w-1/3 bg-foreground" />
      </div>
    </div>
  );
}
