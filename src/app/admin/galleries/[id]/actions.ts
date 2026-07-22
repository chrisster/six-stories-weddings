"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

import { hasSupabaseEnv } from "@/lib/env";
import {
  buildDefaultGalleryNotificationTemplate,
  buildGalleryLinks,
  renderGalleryNotificationEmail,
  sendGalleryNotificationEmail,
} from "@/lib/gallery-notifications";
import { createGuestLink, revokeGuestLink } from "@/lib/data";
import { createPortalClaimToken } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMediaBucket, getBucketName, uploadMediaToStorage } from "@/lib/storage";

export async function createGallerySectionAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!galleryId || !name) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { data: existing } = await admin
    .from("gallery_sections")
    .select("sort_order")
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (existing?.sort_order || 0) + 1;

  await admin.from("gallery_sections").insert({
    gallery_id: galleryId,
    name,
    sort_order: nextOrder,
  });

  revalidatePath(`/admin/galleries/${galleryId}`);
  revalidatePath(`/g`);
}
export async function renameSectionAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const sectionId = String(formData.get("sectionId") || "").trim();
  const galleryId = String(formData.get("galleryId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!sectionId || !galleryId || !name) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("gallery_sections").update({ name }).eq("id", sectionId);
  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function deleteSectionAction(formData: FormData) {
  if (!hasSupabaseEnv) return;
  const sectionId = String(formData.get("sectionId") || "").trim();
  const galleryId = String(formData.get("galleryId") || "").trim();
  if (!sectionId || !galleryId) return;
  const admin = createAdminClient();
  if (!admin) return;
  // Unassign any media in this section before deleting
  await admin.from("media_assets").update({ section_id: null }).eq("section_id", sectionId);
  await admin.from("gallery_sections").delete().eq("id", sectionId);
  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function updateGallerySettingsAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const isPublished = formData.get("isPublished") === "on";
  const allowDownloads = formData.get("allowDownloads") === "on";
  const notifyClients = formData.get("notifyClients") === "on";
  const passcode = String(formData.get("passcode") || "").trim();
  const emailSubject = String(formData.get("emailSubject") || "").trim();
  const emailHeadline = String(formData.get("emailHeadline") || "").trim();
  const emailIntro = String(formData.get("emailIntro") || "").trim();
  const emailBody = String(formData.get("emailBody") || "").trim();
  const buttonLabel = String(formData.get("buttonLabel") || "").trim();
  const shareNote = String(formData.get("shareNote") || "").trim();
  const heroImageUrl = String(formData.get("heroImageUrl") || "").trim() || null;

  if (!galleryId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { data: galleryRow } = await admin
    .from("galleries")
    .select("id, project_id, slug, title, is_published")
    .eq("id", galleryId)
    .maybeSingle();

  if (!galleryRow) {
    return;
  }

  const { data: projectRow } = await admin
    .from("projects")
    .select("title")
    .eq("id", galleryRow.project_id)
    .maybeSingle();

  const defaultTemplate = buildDefaultGalleryNotificationTemplate({
    projectTitle: String(projectRow?.title || galleryRow.title || ""),
    galleryTitle: String(galleryRow.title || ""),
    heroImageUrl,
  });

  const payload: Record<string, unknown> = {
    is_published: isPublished,
    allow_downloads: allowDownloads,
  };

  if (passcode.length > 0) {
    payload.passcode_hash = await bcrypt.hash(passcode, 10);
  }

  await admin.from("galleries").update(payload).eq("id", galleryId);

  await admin.from("gallery_notification_templates").upsert(
    {
      gallery_id: galleryId,
      email_subject: emailSubject || defaultTemplate.emailSubject,
      email_headline: emailHeadline || defaultTemplate.emailHeadline,
      email_intro: emailIntro || defaultTemplate.emailIntro,
      email_body: emailBody || defaultTemplate.emailBody,
      button_label: buttonLabel || defaultTemplate.buttonLabel,
      share_note: shareNote || defaultTemplate.shareNote,
      hero_image_url: heroImageUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "gallery_id" },
  );

  if (isPublished && notifyClients) {
    const { data: projectClients } = await admin
      .from("project_clients")
      .select("client_id")
      .eq("project_id", galleryRow.project_id);

    const clientIds = Array.from(
      new Set((projectClients || []).map((row) => String(row.client_id || "")).filter(Boolean)),
    );

    if (clientIds.length > 0) {
      const { data: clients } = await admin
        .from("clients")
        .select("full_name, email")
        .in("id", clientIds);

      const byEmail = new Map<string, { fullName: string }>();
      (clients || []).forEach((client) => {
        const email = String(client.email || "").trim().toLowerCase();
        if (!email || byEmail.has(email)) {
          return;
        }
        byEmail.set(email, { fullName: String(client.full_name || "") });
      });

      const { galleryUrl, loginUrl } = buildGalleryLinks(String(galleryRow.slug));
      for (const [email, recipient] of byEmail.entries()) {
        const { data: account } = await admin
          .from("client_portal_accounts")
          .upsert(
            {
              email,
              full_name: recipient.fullName || null,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "email" },
          )
          .select("id, email, password_hash")
          .single();

        const claimUrl = account?.password_hash
          ? null
          : `${loginUrl.replace(/\/login$/, "/claim")}?token=${encodeURIComponent(createPortalClaimToken(email))}`;
        const template = {
          emailSubject: emailSubject || defaultTemplate.emailSubject,
          emailHeadline: emailHeadline || defaultTemplate.emailHeadline,
          emailIntro: emailIntro || defaultTemplate.emailIntro,
          emailBody: emailBody || defaultTemplate.emailBody,
          buttonLabel: buttonLabel || defaultTemplate.buttonLabel,
          shareNote: shareNote || defaultTemplate.shareNote,
          heroImageUrl,
        };

        const rendered = renderGalleryNotificationEmail({
          template,
          galleryUrl,
          loginUrl,
          claimUrl,
          recipientName: recipient.fullName,
        });

        try {
          const result = await sendGalleryNotificationEmail({
            to: email,
            subject: template.emailSubject,
            html: rendered.html,
            text: rendered.text,
          });

          if (!result.sent) {
            throw new Error(`Notification provider not configured (${result.reason})`);
          }

          if (account?.id) {
            await admin
              .from("client_portal_accounts")
              .update({ last_notified_at: new Date().toISOString() })
              .eq("id", account.id);
          }
        } catch (error) {
          console.error("Could not send gallery notification", { galleryId, email, error });
        }
      }
    }
  }

  revalidatePath(`/admin/galleries/${galleryId}`);
  revalidatePath(`/g/${galleryRow.slug}`);
  revalidatePath("/portal");
}

export async function uploadMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const sectionId = String(formData.get("sectionId") || "");
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (!galleryId || files.length === 0) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  await ensureMediaBucket();

  const { data: latestAsset } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sortOrder = (latestAsset?.sort_order || 0) + 1;

  for (const file of files) {
    const extension = file.name.split(".").pop() || "bin";
    const storagePath = `${galleryId}/${randomUUID()}.${extension}`;
    await uploadMediaToStorage(storagePath, file);

    const { error } = await admin.from("media_assets").insert({
      gallery_id: galleryId,
      section_id: sectionId || null,
      storage_provider: "supabase",
      storage_bucket: getBucketName(),
      storage_path: storagePath,
      original_name: file.name,
      media_type: file.type.startsWith("video/") ? "video" : "photo",
      sort_order: sortOrder,
      is_cover: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    sortOrder += 1;
  }

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function setCoverMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  const mediaId = String(formData.get("mediaId") || "");
  if (!galleryId || !mediaId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  await admin.from("media_assets").update({ is_cover: false }).eq("gallery_id", galleryId);
  await admin.from("media_assets").update({ is_cover: true }).eq("id", mediaId);
  await admin.from("galleries").update({ cover_media_id: mediaId }).eq("id", galleryId);

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function addDemoMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "");
  if (!galleryId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  const { data: firstSection } = await admin
    .from("gallery_sections")
    .select("id")
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: latestAsset } = await admin
    .from("media_assets")
    .select("sort_order")
    .eq("gallery_id", galleryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const demoUrl =
    "https://images.unsplash.com/photo-1525328437458-0c4d4db7cab4?auto=format&fit=crop&w=1600&q=80";

  const { error } = await admin.from("media_assets").insert({
    gallery_id: galleryId,
    section_id: firstSection?.id || null,
    storage_provider: "supabase",
    storage_bucket: getBucketName(),
    storage_path: demoUrl,
    media_type: "photo",
    sort_order: (latestAsset?.sort_order || 0) + 1,
    is_cover: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function deleteMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const mediaId = String(formData.get("mediaId") || "").trim();
  const galleryId = String(formData.get("galleryId") || "").trim();
  if (!mediaId || !galleryId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  // Remove from gallery if it's the cover
  await admin
    .from("galleries")
    .update({ cover_media_id: null })
    .eq("cover_media_id", mediaId);

  // Delete the media asset
  await admin.from("media_assets").delete().eq("id", mediaId);

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function bulkDeleteMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "").trim();
  const mediaIds = String(formData.get("mediaIds") || "")
    .split(",")
    .filter((id) => id.length > 0);
  const sectionId = String(formData.get("sectionId") || "").trim() || null;
  const deleteAll = formData.get("deleteAll") === "true";

  if (!galleryId) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  if (deleteAll) {
    // Clear the cover reference first, then remove every asset in the gallery.
    await admin.from("galleries").update({ cover_media_id: null }).eq("id", galleryId);
    await admin.from("media_assets").delete().eq("gallery_id", galleryId);
  } else if (sectionId) {
    // Delete all media in a section.
    await admin.from("galleries").update({ cover_media_id: null }).eq("id", galleryId);
    await admin
      .from("media_assets")
      .delete()
      .eq("gallery_id", galleryId)
      .eq("section_id", sectionId);
  } else if (mediaIds.length > 0) {
    // Delete selected media. Chunk the ids so the request URL never exceeds
    // the PostgREST / proxy length limit (which silently drops large batches).
    const chunkSize = 100;
    for (let i = 0; i < mediaIds.length; i += chunkSize) {
      const chunk = mediaIds.slice(i, i + chunkSize);
      // eslint-disable-next-line no-await-in-loop
      await admin.from("media_assets").delete().eq("gallery_id", galleryId).in("id", chunk);
    }
  }

  // Clear cover media if it no longer exists
  const { data: remaining } = await admin
    .from("media_assets")
    .select("id")
    .eq("gallery_id", galleryId)
    .limit(1);

  if (!remaining || remaining.length === 0) {
    await admin.from("galleries").update({ cover_media_id: null }).eq("id", galleryId);
  }

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function moveMediaToSectionAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "").trim();
  const mediaIds = String(formData.get("mediaIds") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  // Empty string means "Unsorted" (no section).
  const sectionId = String(formData.get("sectionId") || "").trim() || null;

  if (!galleryId || mediaIds.length === 0) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  // Chunk the ids so the request URL never exceeds the PostgREST / proxy
  // length limit (which silently drops large batches).
  const chunkSize = 100;
  for (let i = 0; i < mediaIds.length; i += chunkSize) {
    const chunk = mediaIds.slice(i, i + chunkSize);
    // eslint-disable-next-line no-await-in-loop
    await admin
      .from("media_assets")
      .update({ section_id: sectionId })
      .eq("gallery_id", galleryId)
      .in("id", chunk);
  }

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function reorderMediaAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return;
  }

  const galleryId = String(formData.get("galleryId") || "").trim();
  const orderedIds = String(formData.get("orderedIds") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!galleryId || orderedIds.length === 0) {
    return;
  }

  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  for (let i = 0; i < orderedIds.length; i += 1) {
    await admin
      .from("media_assets")
      .update({ sort_order: i + 1 })
      .eq("gallery_id", galleryId)
      .eq("id", orderedIds[i]);
  }

  revalidatePath(`/admin/galleries/${galleryId}`);
}

export async function createGuestLinkAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return { error: "No Supabase environment" };
  }

  const galleryId = String(formData.get("galleryId") || "").trim();
  const createdBy = String(formData.get("createdBy") || "admin").trim();
  const expiresInDays = formData.get("expiresInDays")
    ? parseInt(String(formData.get("expiresInDays")), 10)
    : null;
  const mediaAssetIds = String(formData.get("mediaAssetIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!galleryId) {
    return { error: "Missing gallery ID" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Failed to create admin client" };
  }

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const created = await createGuestLink(
    galleryId,
    createdBy,
    expiresAt,
    mediaAssetIds.length > 0 ? mediaAssetIds : undefined,
  );

  if (!created) {
    return { error: "Failed to create guest link" };
  }

  const { data: gallery } = await admin
    .from("galleries")
    .select("slug")
    .eq("id", galleryId)
    .maybeSingle();

  const slug = String(gallery?.slug || "");

  revalidatePath(`/admin/galleries/${galleryId}`);

  return {
    success: true,
    token: created.token,
    link: slug ? `/g/${slug}?token=${encodeURIComponent(created.token)}` : null,
  };
}

export async function revokeGuestLinkAction(formData: FormData) {
  if (!hasSupabaseEnv) {
    return { error: "No Supabase environment" };
  }

  const linkId = String(formData.get("linkId") || "").trim();
  const galleryId = String(formData.get("galleryId") || "").trim();

  if (!linkId || !galleryId) {
    return { error: "Missing link ID or gallery ID" };
  }

  const revoked = await revokeGuestLink(linkId);
  if (!revoked) {
    return { error: "Failed to revoke guest link" };
  }

  revalidatePath(`/admin/galleries/${galleryId}`);

  return { success: true };
}