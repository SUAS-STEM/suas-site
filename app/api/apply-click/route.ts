import { NextResponse } from "next/server";

const APPLICATION_URL = "https://forms.cloud.microsoft/r/M236hGQ0cv";

// Older browser-cached Apply pages still point here. Keep their CTA working
// even after the public page has been updated to link to the form directly.
export function GET() {
  const response = NextResponse.redirect(APPLICATION_URL, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
