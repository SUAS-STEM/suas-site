import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["dev.suasstem.org"],
  async headers() {
    return [
      {
        source: "/images/gallery/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          {
            key: "Cloudflare-CDN-Cache-Control",
            value: "public, max-age=315360000, stale-if-error=315360000",
          },
        ],
      },
      {
        source: "/dev-login",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/dev/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "dev.suasstem.org" }],
          destination: "/dev",
        },
      ],
    };
  },
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
