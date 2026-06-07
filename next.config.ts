import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve AVIF when the browser supports it (falls back to WebP), so the
    // optimizer produces smaller files than the WebP-only default. Source
    // files in public/images are never modified — these copies are generated
    // and CDN-cached on demand.
    formats: ["image/avif", "image/webp"],
    // Keep optimized derivatives in the cache longer to avoid re-optimizing.
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
