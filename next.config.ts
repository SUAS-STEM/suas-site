import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://api.github.com https://gcs-license.esamuelchan.workers.dev wss://dev.suasstem.org",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  poweredByHeader: false,
  allowedDevOrigins: ["dev.suasstem.org"],
  experimental: {
    // /storage resumable uploads use 64 MiB parts. Next otherwise truncates
    // proxied request bodies at its 10 MiB default before the route handler
    // can stream them to release-store.
    proxyClientMaxBodySize: "90mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
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
        source: "/images/aircraft/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
          {
            key: "Cloudflare-CDN-Cache-Control",
            value: "public, max-age=31536000, stale-if-error=315360000",
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
    qualities: [75, 100],
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
