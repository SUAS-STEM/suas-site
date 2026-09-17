import { createAccessReviewToken } from "@/lib/accessReviewToken";
import type { DeviceAccessRequest } from "@/lib/devAccess";

const NOTIFY_URL = process.env.ACCESS_REQUEST_NOTIFY_URL || "http://127.0.0.1:3004/access-request";

export async function notifyAccessRequest(request: DeviceAccessRequest) {
  const origin = (process.env.PUBLIC_DEV_ORIGIN || "https://dev.suasstem.org").replace(/\/$/, "");
  const approveToken = createAccessReviewToken(request.id, "approve");
  const denyToken = createAccessReviewToken(request.id, "deny");
  const body = {
    name: request.name,
    requestedAt: request.requestedAt,
    code: request.phrase,
    approveUrl: `${origin}/api/dev-access/email-review?token=${encodeURIComponent(approveToken)}`,
    denyUrl: `${origin}/api/dev-access/email-review?token=${encodeURIComponent(denyToken)}`,
    reviewUrl: `${origin}/dev#access-requests`,
  };
  const response = await fetch(NOTIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Access request email service returned ${response.status}`);
}
