import { createHash } from "node:crypto";

const DEFAULT_URL = "http://127.0.0.1:18080";
const OBJECT_PREFIX = "suas-dev__";

export type ReleaseStoreStorage = {
  configured: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  message: string | null;
};

export type ReleaseStoreUploadStatus = {
  id: string;
  state?: string;
  size: number;
  partSize: number;
  partCount: number;
  receivedBytes: number;
  replicatedBytes?: number;
  bufferedBytes?: number;
  sha256?: string | null;
  receivedParts?: Array<{
    part: number;
    size: number;
    sha256: string | null;
    replicated?: boolean;
  }>;
};

export type ReleaseStoreJobStatus = {
  id: string;
  state: string;
  size: number;
  receivedBytes: number;
  replicatedBytes: number;
  bufferedBytes: number;
  error?: string | null;
};

export class ReleaseStoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ReleaseStoreError";
    this.status = status;
  }
}

function baseUrl() {
  return (process.env.RELEASE_STORE_URL || DEFAULT_URL).replace(/\/$/, "");
}

function serviceToken() {
  return process.env.RELEASE_STORE_TOKEN?.trim() || "";
}

function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const token = serviceToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function errorMessage(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body) return `Release store returned HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Keep the short text response below.
  }
  return body.slice(0, 500);
}

async function request(path: string, init: RequestInit = {}) {
  if (!serviceToken()) throw new ReleaseStoreError("GitHub Releases storage is not configured.", 503);
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: authHeaders(init.headers),
  });
  if (!response.ok) throw new ReleaseStoreError(await errorMessage(response), response.status);
  return response;
}

export function releaseStoreObjectName(name: string) {
  return `${OBJECT_PREFIX}${name}`;
}

export async function getReleaseStoreStorage(): Promise<ReleaseStoreStorage> {
  if (!serviceToken()) {
    return {
      configured: false,
      used: null,
      limit: null,
      remaining: null,
      message: "GitHub Releases storage is not configured.",
    };
  }
  try {
    const response = await request("/healthz");
    const status = await response.json() as {
      logicalBytes?: number;
      quotaBytes?: number | null;
      remainingBytes?: number | null;
    };
    return {
      configured: true,
      used: typeof status.logicalBytes === "number" ? status.logicalBytes : null,
      limit: typeof status.quotaBytes === "number" ? status.quotaBytes : null,
      remaining: typeof status.remainingBytes === "number" ? status.remainingBytes : null,
      message: null,
    };
  } catch (cause) {
    return {
      configured: false,
      used: null,
      limit: null,
      remaining: null,
      message: cause instanceof Error ? cause.message : "GitHub Releases storage is unavailable.",
    };
  }
}

export async function createReleaseStoreUpload(name: string, size: number, contentType: string) {
  const response = await request("/v1/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: releaseStoreObjectName(name),
      size,
      contentType,
    }),
  });
  return response.json() as Promise<ReleaseStoreUploadStatus>;
}

export async function getReleaseStoreUpload(id: string) {
  const response = await request(`/v1/uploads/${encodeURIComponent(id)}`);
  return response.json() as Promise<ReleaseStoreUploadStatus>;
}

export async function putReleaseStorePart(id: string, part: number, chunk: Buffer) {
  const sha256 = createHash("sha256").update(chunk).digest("hex");
  const response = await request(
    `/v1/uploads/${encodeURIComponent(id)}/parts/${part}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(chunk.length),
        "X-Part-SHA256": sha256,
      },
      body: chunk as unknown as BodyInit,
    },
  );
  return {
    ...(await response.json() as Record<string, unknown>),
    sha256,
  };
}

export async function completeReleaseStoreUpload(id: string) {
  const response = await request(
    `/v1/uploads/${encodeURIComponent(id)}/complete`,
    { method: "POST" },
  );
  return {
    status: response.status,
    body: await response.json() as {
      id: string;
      state: string;
      sha256?: string | null;
    },
  };
}

export async function getReleaseStoreJob(id: string) {
  const response = await request(`/v1/jobs/${encodeURIComponent(id)}`);
  return response.json() as Promise<ReleaseStoreJobStatus>;
}

export async function cancelReleaseStoreUpload(id: string) {
  try {
    await request(`/v1/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  } catch (cause) {
    if (cause instanceof ReleaseStoreError && cause.status === 404) return true;
    return false;
  }
}

export async function fetchReleaseStoreFile(name: string, range?: string | null) {
  const headers = new Headers();
  if (range) headers.set("Range", range);
  return request(
    `/v1/files/${encodeURIComponent(releaseStoreObjectName(name))}`,
    { headers },
  );
}

export async function deleteReleaseStoreFile(name: string) {
  try {
    await request(
      `/v1/files/${encodeURIComponent(releaseStoreObjectName(name))}`,
      { method: "DELETE" },
    );
    return true;
  } catch (cause) {
    if (cause instanceof ReleaseStoreError && cause.status === 404) return true;
    return false;
  }
}
