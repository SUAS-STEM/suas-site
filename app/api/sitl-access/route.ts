import { NextRequest, NextResponse } from "next/server";
import { currentDevIdentity, isDevAuthorized } from "@/lib/devAdminAuth";
import { requestClientIp } from "@/lib/sitlClientIp";
import {
  createMissionPlannerAccess,
  getMissionPlannerAccess,
  missionPlannerAccessConfig,
  revokeMissionPlannerAccess,
} from "@/lib/sitlMissionPlannerAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
};

async function context(req: NextRequest) {
  if (!(await isDevAuthorized())) return null;
  const identity = await currentDevIdentity();
  const clientIp = requestClientIp(req.headers);
  return { identity, clientIp };
}

function bodyFor(identity: Awaited<ReturnType<typeof currentDevIdentity>>, clientIp: string | null) {
  const lease = getMissionPlannerAccess(identity.id);
  return {
    mode: "websocket" as const,
    leaseSeconds: missionPlannerAccessConfig().leaseSeconds,
    clientIp,
    lease,
    enabled: Boolean(lease && clientIp && lease.clientIp === clientIp),
  };
}

export async function GET(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  return NextResponse.json(bodyFor(ctx.identity, ctx.clientIp), { headers: noStore });
}

export async function POST(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!ctx.clientIp) {
    return NextResponse.json(
      { error: "Could not determine your public IP. Mission Planner access was not enabled." },
      { status: 503, headers: noStore },
    );
  }
  const access = createMissionPlannerAccess({ id: ctx.identity.id, name: ctx.identity.name }, ctx.clientIp);
  const { websocketOrigin } = missionPlannerAccessConfig();
  const websocketUrl = `${websocketOrigin}/api/sitl/ws?access=${encodeURIComponent(access.token)}`;
  return NextResponse.json(
    { ok: true, ...bodyFor(ctx.identity, ctx.clientIp), websocketUrl },
    { headers: noStore },
  );
}

export async function DELETE(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  revokeMissionPlannerAccess(ctx.identity.id);
  return NextResponse.json({ ok: true, ...bodyFor(ctx.identity, ctx.clientIp) }, { headers: noStore });
}
