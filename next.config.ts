import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["archiver"],
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
