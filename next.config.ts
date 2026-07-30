import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The contract PDF embeds DejaVu Serif for Greek glyph coverage. These .ttf
  // files are read from node_modules at runtime, which file tracing cannot infer
  // on its own, so declare them explicitly or the deployed PDF route 500s.
  outputFileTracingIncludes: {
    "/api/contracts/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif*.ttf"],
    "/sign/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif*.ttf"],
    "/admin/contracts/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif*.ttf"],
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
