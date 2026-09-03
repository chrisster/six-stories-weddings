"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Navigations that genuinely take longer than this are broken elsewhere; the
// bar should not stay up forever if the URL never changes.
const SAFETY_TIMEOUT_MS = 12000;

/**
 * Thin progress bar for client-side navigations. It appears when an internal
 * link is clicked and stays until the URL actually changes, instead of hiding
 * on a fixed timer while the next page is still being rendered.
 */
export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const currentUrl = `${pathname}?${searchParams.toString()}`;
  const lastUrl = useRef(currentUrl);

  // The URL changed: the navigation the bar was showing has landed.
  useEffect(() => {
    if (lastUrl.current !== currentUrl) {
      lastUrl.current = currentUrl;
      setLoading(false);
    }
  }, [currentUrl]);

  useEffect(() => {
    if (!loading) {
      return;
    }
    const timer = window.setTimeout(() => setLoading(false), SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // External links leave the app; same-URL clicks never change the URL,
      // so neither would ever clear the bar.
      if (destination.origin !== window.location.origin) {
        return;
      }
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }

      setLoading(true);
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleClick, { capture: true } as EventListenerOptions);
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
