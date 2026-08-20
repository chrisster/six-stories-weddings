import type { NextConfig } from "next";

// sharp resolves its native binding with a platform-switch require of
// @img/sharp-linux-x64, and that binding in turn loads the libvips shared
// library from @img/sharp-libvips-linux-x64 through the dynamic linker — a
// dependency file tracing cannot see. On Vercel the traced function bundle
// therefore misses the binaries and any route importing sharp 500s at module
// load, so every sharp route must force-include these packages.
const sharpTraceIncludes = ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"];

const nextConfig: NextConfig = {
  // sharp is in Next's default external list; keep it explicit so Turbopack
  // never tries to bundle the native module into server chunks.
  serverExternalPackages: ["sharp"],
  // The contract PDF embeds DejaVu Serif for Greek glyph coverage. These .ttf
  // files are read from node_modules at runtime, which file tracing cannot infer
  // on its own, so declare them explicitly or the deployed PDF route 500s.
  outputFileTracingIncludes: {
    "/api/contracts/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif*.ttf"],
    "/sign/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif*.ttf"],
    "/admin/contracts/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif*.ttf"],
    "/api/media/thumb": sharpTraceIncludes,
    // The organization pages' server actions rasterize signatures with sharp
    // (src/lib/signature-image.ts).
    "/admin/organization": sharpTraceIncludes,
    "/admin/organization/**": sharpTraceIncludes,
  },
  images: {
    remotePatterns: [
      // Supabase Storage
      { protocol: "https", hostname: "*.supabase.co" },
      // Cloudflare R2 public bucket URL and any custom subdomain
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.sixstoriesstudio.com" },
      // Unsplash demo images
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
