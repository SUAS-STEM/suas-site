"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getMemberImageSrc } from "@/app/(site)/team/types";

type AccessRequest = {
  id: string;
  name: string;
  requestedAt: string;
  phrase: string;
};

type Device = AccessRequest & { deviceId: string; role: "member" | "admin" };

export default function AccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [visible, setVisible] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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

  async function review(id: string, action: "approve" | "deny" | "kick" | "make_admin") {
    setBusy(id);
    try {
      const response = await fetch("/api/dev-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (response.ok) await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!visible) return null;
  return (
    <section aria-labelledby="access-requests-heading" className="border-t border-white/10 pt-8">
      <div className="mb-5">
        <p className="!mb-2 font-mono text-xs uppercase tracking-widest text-white/40">Access</p>
        <h2 id="access-requests-heading" className="!mb-1 !mt-0 !text-left">Device access</h2>
        <p className="!m-0 text-sm text-white/55">Approve new devices or remove an existing session.</p>
      </div>

      {requests.length > 0 && (
        <div className="mb-8">
          <p className="mb-2 text-xs font-mono uppercase tracking-widest text-white/35">Pending</p>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div>
                  <p className="!m-0 text-sm text-white">{request.name}</p>
                  <p className="!m-0 mt-1 text-xs text-white/35">Code {request.phrase} · Requested {new Date(request.requestedAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-3 text-xs">
                    <button type="button" disabled={busy === request.id} onClick={() => void review(request.id, "deny")} className="text-white/45 hover:text-red-200 disabled:opacity-50">Deny</button>
                    <button type="button" disabled={busy === request.id} onClick={() => void review(request.id, "approve")} className="text-teal-200 hover:text-white disabled:opacity-50">Approve</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-mono uppercase tracking-widest text-white/35">Approved devices</p>
        {devices.length === 0 ? (
        <p className="!m-0 text-sm text-white/45">No approved devices.</p>
        ) : (
          <div className="divide-y divide-white/10 border-y border-white/10">
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                busy={busy === device.id}
                canManageAdmins={canManageAdmins}
                onKick={() => void review(device.id, "kick")}
                onMakeAdmin={() => void review(device.id, "make_admin")}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DeviceRow({ device, busy, canManageAdmins, onKick, onMakeAdmin }: { device: Device; busy: boolean; canManageAdmins: boolean; onKick: () => void; onMakeAdmin: () => void }) {
  const permanentAdmin = device.role === "admin";
  const [hasPhoto, setHasPhoto] = useState(true);
  return (
    <div className="flex items-center gap-3 py-3">
      {hasPhoto ? (
        <Image src={getMemberImageSrc(device.name)} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" onError={() => setHasPhoto(false)} />
      ) : (
        <span className="material-symbols-outlined flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/35" aria-hidden="true">person</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="!m-0 truncate text-sm text-white">{device.name}</p>
        <p className="!m-0 mt-1 text-xs text-white/35">Code {device.phrase} · Approved {new Date(device.requestedAt).toLocaleDateString()}{permanentAdmin ? " · Admin" : ""}</p>
      </div>
      {permanentAdmin ? (
        <span className="text-xs text-white/35">Protected</span>
      ) : (
        <div className="flex items-center gap-3">
          {canManageAdmins && <button type="button" disabled={busy} onClick={onMakeAdmin} className="text-xs text-teal-200 hover:text-white disabled:opacity-50">Make admin</button>}
          <button type="button" disabled={busy} onClick={onKick} className="text-xs text-white/45 hover:text-red-200 disabled:opacity-50">Kick</button>
        </div>
      )}
    </div>
  );
}
