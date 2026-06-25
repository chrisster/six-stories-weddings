"use client";

import { useState } from "react";
import { createGuestLinkAction, revokeGuestLinkAction } from "@/app/admin/galleries/[id]/actions";
import type { GuestGalleryLink } from "@/lib/types";

interface GuestLinkManagerProps {
  galleryId: string;
  initialLinks: GuestGalleryLink[];
  gallerySlug: string;
}

export function GuestLinkManager({ galleryId, initialLinks, gallerySlug }: GuestLinkManagerProps) {
  const [links, setLinks] = useState<GuestGalleryLink[]>(initialLinks);
  const [isCreating, setIsCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [newLinkToken, setNewLinkToken] = useState<string | null>(null);

  const handleCreateLink = async () => {
    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.set("galleryId", galleryId);
      formData.set("createdBy", "admin");
      if (expiresInDays) {
        formData.set("expiresInDays", expiresInDays.toString());
      }

      const result = await createGuestLinkAction(formData);
      if (result.success) {
        setNewLinkToken(result.token);
        // Refetch links
        const newLink: GuestGalleryLink = {
          id: Math.random().toString(),
          token: result.token,
          createdAt: new Date().toISOString(),
          expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null,
          isActive: true,
          accessCount: 0,
          lastAccessedAt: null,
        };
        setLinks([newLink, ...links]);
        setExpiresInDays(null);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    const formData = new FormData();
    formData.set("linkId", linkId);
    formData.set("galleryId", galleryId);

    const result = await revokeGuestLinkAction(formData);
    if (result.success) {
      setLinks(links.map((link) => (link.id === linkId ? { ...link, isActive: false } : link)));
    }
  };

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/g/${gallerySlug}?token=${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-zinc-50 p-4">
        <p className="text-sm font-medium">Create a guest link</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Share this link with clients to give them direct access without needing a portal account.
        </p>

        <div className="mt-3 flex gap-2">
          <select
            value={expiresInDays || ""}
            onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="">Never expires</option>
            <option value="1">Expires in 1 day</option>
            <option value="7">Expires in 7 days</option>
            <option value="30">Expires in 30 days</option>
          </select>
          <button
            onClick={handleCreateLink}
            disabled={isCreating}
            className="h-10 rounded-full border border-foreground bg-foreground px-4 text-sm text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Generate link"}
          </button>
        </div>
      </div>

      {newLinkToken && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Guest link created!</p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/g/${gallerySlug}?token=${encodeURIComponent(newLinkToken)}`}
              className="h-9 flex-1 rounded-lg border border-emerald-200 bg-white px-3 text-xs text-emerald-900"
            />
            <button
              onClick={() => copyToClipboard(newLinkToken)}
              className="h-9 rounded-lg border border-emerald-300 bg-emerald-100 px-3 text-xs text-emerald-900 hover:bg-emerald-200"
            >
              Copy
            </button>
            <button
              onClick={() => setNewLinkToken(null)}
              className="h-9 rounded-lg border border-emerald-300 bg-emerald-100 px-3 text-xs text-emerald-900 hover:bg-emerald-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Active links</p>
          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-muted-foreground">{link.token}</p>
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                    <span>Created: {new Date(link.createdAt).toLocaleDateString()}</span>
                    {link.expiresAt && <span>Expires: {new Date(link.expiresAt).toLocaleDateString()}</span>}
                    {link.isActive && link.accessCount > 0 && <span>Accessed: {link.accessCount} times</span>}
                    {!link.isActive && <span className="text-red-600">Revoked</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {link.isActive && (
                    <>
                      <button
                        onClick={() => copyToClipboard(link.token)}
                        className="rounded-lg border border-border bg-white px-3 py-1 text-xs hover:border-foreground/30"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => handleRevokeLink(link.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
