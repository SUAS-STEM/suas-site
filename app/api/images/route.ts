import { GALLERY_PHOTOS } from "@/lib/galleryPhotos.generated";

export async function GET() {
    return new Response(JSON.stringify(GALLERY_PHOTOS), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=14400",
            "Cloudflare-CDN-Cache-Control":
                "public, max-age=31536000, stale-if-error=315360000",
        },
    });
}
