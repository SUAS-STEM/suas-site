"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getMemberImageSrc } from "@/app/(site)/team/types";

type AccessRequest = {
  id: string;
  name: string;
  requestedAt: string;
  phrase: string;
};

type Device = AccessRequest & { deviceId: string; role: "member" | "admin" };

type AccessGroup<T extends { name: string }> = { key: string; name: string; members: T[] };

function groupByName<T extends { name: string }>(items: T[]): AccessGroup<T>[] {
  const groups = new Map<string, AccessGroup<T>>();
  for (const item of items) {
    const key = item.name.trim().toLocaleLowerCase();
    const group = groups.get(key);
    if (group) group.members.push(item);
    else groups.set(key, { key, name: item.name.trim(), members: [item] });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function AccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [visible, setVisible] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const groupedRequests = useMemo(() => groupByName(requests), [requests]);
  const groupedDevices = useMemo(() => groupByName(devices), [devices]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dev-access?pending=1", { cache: "no-store" });
    if (response.status === 401) return;
    if (!response.ok) throw new Error("Could not load access requests");
    const result = await response.json() as { requests: AccessRequest[]; devices: Device[]; canManageAdmins?: boolean };
    setRequests(result.requests);
    setDevices(result.devices);
    setCanManageAdmins(result.canManageAdmins === true);
    setVisible(true);
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  async function review(ids: string[], action: "approve" | "deny" | "kick" | "make_admin", busyKey: string) {
    setBusy(busyKey);
    setActionError(null);
    try {
      for (const id of ids) {
        const response = await fetch("/api/dev-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error || `Could not ${action.replace("_", " ")} this device`);
        }
      }
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not update device access");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  if (!visible) return null;
  return (
    <section id="access-requests" aria-labelledby="access-requests-heading" className="border-t border-white/10 pt-8">
      <div className="mb-5">
        <p className="!mb-2 font-mono text-xs uppercase tracking-widest text-white/40">Access</p>
        <h2 id="access-requests-heading" className="!mb-1 !mt-0 !text-left">Device access</h2>
        <p className="!m-0 text-sm text-white/55">Approve new devices or remove an existing session.</p>
        <p className="!m-0 mt-2 text-xs text-white/35">New shared username/password accounts are approved from <a href="https://ethanchan.dev/access" className="text-teal-200 underline decoration-teal-200/30 underline-offset-4">ethanchan.dev → SUAS Access</a>.</p>
      </div>

      {actionError && <p role="alert" className="!m-0 mb-4 text-sm text-red-200">{actionError}</p>}

      {groupedRequests.length > 0 && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-mono uppercase tracking-widest text-white/35">Pending</p>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {groupedRequests.map((group) => (
              <div key={group.key} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div>
                  <p className="!m-0 text-sm text-white">{group.name}</p>
                  <p className="!m-0 mt-1 text-xs text-white/35">
                    {group.members.length > 1 && `${group.members.length} pending devices · `}
                    {group.members.length === 1 ? `Code ${group.members[0].phrase} · ` : `Codes ${group.members.map((request) => request.phrase).join(", ")} · `}
                    Requested {new Date(group.members.reduce((latest, request) => Date.parse(request.requestedAt) > Date.parse(latest.requestedAt) ? request : latest).requestedAt).toLocaleString()}
                  </p>
                </div>
                {canManageAdmins ? <div className="flex gap-3 text-xs">
                    <button type="button" disabled={busy === `pending:${group.key}`} onClick={() => void review(group.members.map((request) => request.id), "deny", `pending:${group.key}`)} className="text-white/45 hover:text-red-200 disabled:opacity-50">Deny{group.members.length > 1 ? " all" : ""}</button>
                    <button type="button" disabled={busy === `pending:${group.key}`} onClick={() => void review(group.members.map((request) => request.id), "approve", `pending:${group.key}`)} className="text-teal-200 hover:text-white disabled:opacity-50">Approve{group.members.length > 1 ? " all" : ""}</button>
                </div> : <span className="text-xs text-white/35">Admin approval required</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!canManageAdmins && <p className="!m-0 mt-4 text-xs text-white/35">You can view the current requests, but only an admin can approve, deny, or remove devices.</p>}

      <div>
        <p className="mb-2 text-xs font-mono uppercase tracking-widest text-white/35">Approved devices</p>
        {groupedDevices.length === 0 ? (
        <p className="!m-0 text-sm text-white/45">No approved devices.</p>
        ) : (
          <div className="divide-y divide-white/10 border-y border-white/10">
            {groupedDevices.map((group) => (
              <DeviceGroupRow
                key={group.key}
                group={group}
                busy={busy === `device:${group.key}`}
                canManageAdmins={canManageAdmins}
                onKick={(id) => void review([id], "kick", `device:${group.key}`)}
                onMakeAdmin={(id) => void review([id], "make_admin", `device:${group.key}`)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DeviceGroupRow({ group, busy, canManageAdmins, onKick, onMakeAdmin }: { group: AccessGroup<Device>; busy: boolean; canManageAdmins: boolean; onKick: (id: string) => void; onMakeAdmin: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const device = group.members[0];
  const [hasPhoto, setHasPhoto] = useState(true);
  const latestDate = group.members.map((member) => member.requestedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const allAdmins = group.members.every((member) => member.role === "admin");
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        {hasPhoto ? (
          <Image src={getMemberImageSrc(group.name)} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" onError={() => setHasPhoto(false)} />
        ) : (
          <span className="material-symbols-outlined flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/35" aria-hidden="true">person</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="!m-0 truncate text-sm text-white">{group.name}</p>
          <p className="!m-0 mt-1 text-xs text-white/35">{group.members.length} approved {group.members.length === 1 ? "device" : "devices"} · Latest {new Date(latestDate).toLocaleDateString()}{allAdmins ? " · Admins" : ""}</p>
        </div>
        {allAdmins ? (
          <span className="text-xs text-white/35">Protected</span>
        ) : group.members.length === 1 ? (
          <div className="flex items-center gap-3">
            {canManageAdmins && device.role !== "admin" && <button type="button" disabled={busy} onClick={() => onMakeAdmin(device.id)} className="text-xs text-teal-200 hover:text-white disabled:opacity-50">Make admin</button>}
            {device.role !== "admin" && <button type="button" disabled={busy} onClick={() => onKick(device.id)} className="text-xs text-white/45 hover:text-red-200 disabled:opacity-50">Kick</button>}
          </div>
        ) : (
          <button type="button" onClick={() => setExpanded((open) => !open)} className="text-xs text-white/55 hover:text-white" aria-expanded={expanded}>{expanded ? "Hide sessions" : "Manage sessions"}</button>
        )}
      </div>
      {expanded && group.members.length > 1 && (
        <div className="ml-12 mt-2 divide-y divide-white/5 rounded bg-white/[0.025] px-3">
          {group.members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <p className="!m-0 text-xs text-white/45">Code {member.phrase} · Approved {new Date(member.requestedAt).toLocaleDateString()}{member.role === "admin" ? " · Admin" : ""}</p>
              {member.role === "admin" ? <span className="text-xs text-white/30">Protected</span> : <div className="flex gap-3">
                {canManageAdmins && <button type="button" disabled={busy} onClick={() => onMakeAdmin(member.id)} className="text-xs text-teal-200 hover:text-white disabled:opacity-50">Make admin</button>}
                <button type="button" disabled={busy} onClick={() => onKick(member.id)} className="text-xs text-white/45 hover:text-red-200 disabled:opacity-50">Kick</button>
              </div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
