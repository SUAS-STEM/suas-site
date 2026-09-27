/*
 * Public HTTPS front door for the dev site. Normal HTTP is proxied to the
 * standalone Next server; the one WebSocket upgrade used by sitl-connect is
 * terminated here and bridged to the local multi-client MAVLink proxy.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS gateway */
const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const Database = require("better-sqlite3");

const publicPort = Number(process.env.PORT || 3002);
const nextPort = Number(process.env.NEXT_INTERNAL_PORT || 3012);
const mavlinkPort = Number(process.env.MAVLINK_PROXY_PORT || 5790);
const directTcpPort = Number(process.env.SITL_TCP_GATEWAY_PORT || 5770);
const proxyDirectTcpPort = Number(process.env.SITL_TCP_PROXY_GATEWAY_PORT || 5771);
const configuredDirectMaxPerIp = Number(process.env.SITL_TCP_MAX_PER_IP || 3);
// Fail closed to the conservative default if an environment override is
// malformed. Math.min/max propagate NaN, which would silently disable the
// per-IP connection cap because every comparison against NaN is false.
const directMaxPerIp = Number.isFinite(configuredDirectMaxPerIp)
  ? Math.max(1, Math.min(8, Math.trunc(configuredDirectMaxPerIp)))
  : 3;
const dbPath = process.env.DEV_ACCESS_DB || "/home/pi/suas-site-dev/data/dev-access.db";
const directConnections = new Map();
const proxyV2Signature = Buffer.from([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a]);

let nextChild;
try {
  nextChild = spawn(process.execPath, [path.join(__dirname, "next-server.js")], {
    env: { ...process.env, PORT: String(nextPort), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch (error) {
  console.error("Could not start Next server", error);
  process.exit(1);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validateToken(token) {
  if (!token || token.length < 32 || token.length > 256) return false;
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT u.status FROM trusted_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL").get(hashToken(token));
    return row?.status === "approved";
  } catch (error) {
    console.error("SITL auth lookup failed", error.message);
    return false;
  } finally {
    db?.close();
  }
}

function ensureMissionPlannerSchema() {
  let db;
  try {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS sitl_ws_leases (
        principal_id TEXT PRIMARY KEY,
        principal_name TEXT NOT NULL,
        client_ip TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        last_connected_at TEXT,
        connection_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_sitl_ws_leases_token
        ON sitl_ws_leases(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sitl_ws_leases_ip_expiry
        ON sitl_ws_leases(client_ip, expires_at);
    `);
  } finally {
    db?.close();
  }
}

function validateMissionPlannerAccess(token, clientIp) {
  if (!token || token.length < 32 || token.length > 256 || !clientIp) return null;
  let db;
  try {
    db = new Database(dbPath);
    const row = db.prepare(`
      SELECT principal_id, token_hash, client_ip, expires_at
      FROM sitl_ws_leases
      WHERE token_hash = ? AND client_ip = ?
        AND revoked_at IS NULL AND expires_at > ?
      LIMIT 1
    `).get(hashToken(token), clientIp, new Date().toISOString());
    if (!row) return null;
    db.prepare(`
      UPDATE sitl_ws_leases
      SET last_connected_at = ?, connection_count = connection_count + 1
      WHERE principal_id = ?
    `).run(new Date().toISOString(), row.principal_id);
    return row;
  } catch (error) {
    console.error("Mission Planner WebSocket auth lookup failed", error.message);
    return null;
  } finally {
    db?.close();
  }
}

function missionPlannerAccessStillValid(tokenHash, clientIp) {
  if (!tokenHash || !clientIp) return false;
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    return Boolean(db.prepare(`
      SELECT 1 FROM sitl_ws_leases
      WHERE token_hash = ? AND client_ip = ?
        AND revoked_at IS NULL AND expires_at > ?
      LIMIT 1
    `).get(tokenHash, clientIp, new Date().toISOString()));
  } catch (error) {
    console.error("Mission Planner WebSocket reauthorization failed", error.message);
    return false;
  } finally {
    db?.close();
  }
}

function cleanupExpiredMissionPlannerAccess() {
  let db;
  try {
    db = new Database(dbPath);
    const now = new Date();
    const oldRevocation = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM sitl_ws_leases WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)")
      .run(now.toISOString(), oldRevocation);
  } catch (error) {
    console.error("Mission Planner WebSocket cleanup failed", error.message);
  } finally {
    db?.close();
  }
}

function normalizeIp(value) {
  if (!value) return "";
  let ip = String(value).trim();
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);
  // Cloudflare may present a compressed IPv6 address while PROXY v2 carries
  // the same address as eight explicit 16-bit groups. Canonicalize both forms
  // before comparing them to a lease or IPv6 clients will be rejected even
  // though their address is unchanged.
  if (ip.includes(":")) {
    try {
      const hostname = new URL(`http://[${ip}]/`).hostname;
      if (hostname.startsWith("[") && hostname.endsWith("]")) ip = hostname.slice(1, -1);
    } catch {
      return "";
    }
  }
  return ip;
}

function ensureDirectSchema() {
  let db;
  try {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS sitl_tcp_leases (
        principal_id TEXT PRIMARY KEY,
        principal_name TEXT NOT NULL,
        client_ip TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        last_connected_at TEXT,
        connection_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_sitl_tcp_leases_ip_expiry
        ON sitl_tcp_leases(client_ip, expires_at);
    `);
  } finally {
    db?.close();
  }
}

function activeLeaseForIp(ip) {
  if (!ip) return null;
  let db;
  try {
    db = new Database(dbPath);
    return db.prepare(`
      SELECT principal_id, principal_name, client_ip, expires_at
      FROM sitl_tcp_leases
      WHERE client_ip = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY expires_at DESC
      LIMIT 1
    `).get(ip, new Date().toISOString()) || null;
  } catch (error) {
    console.error("SITL direct access lookup failed", error.message);
    return null;
  } finally {
    db?.close();
  }
}

function leaseStillAuthorizes(principalId, ip) {
  if (!principalId || !ip) return false;
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db.prepare(`
      SELECT 1
      FROM sitl_tcp_leases
      WHERE principal_id = ? AND client_ip = ?
        AND revoked_at IS NULL AND expires_at > ?
      LIMIT 1
    `).get(principalId, ip, new Date().toISOString());
    return Boolean(row);
  } catch (error) {
    console.error("SITL direct access reauthorization failed", error.message);
    return false;
  } finally {
    db?.close();
  }
}

function recordDirectConnection(principalId) {
  let db;
  try {
    db = new Database(dbPath);
    db.prepare(`
      UPDATE sitl_tcp_leases
      SET last_connected_at = ?, connection_count = connection_count + 1
      WHERE principal_id = ?
    `).run(new Date().toISOString(), principalId);
  } catch (error) {
    console.error("SITL direct access accounting failed", error.message);
  } finally {
    db?.close();
  }
}

function cleanupExpiredDirectLeases() {
  let db;
  try {
    db = new Database(dbPath);
    const now = new Date();
    const oldRevocation = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM sitl_tcp_leases WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)")
      .run(now.toISOString(), oldRevocation);
  } catch (error) {
    console.error("SITL direct access cleanup failed", error.message);
  } finally {
    db?.close();
  }
}

function bridgeAuthorizedDirectClient(client, clientIp) {
  const lease = activeLeaseForIp(clientIp);
  const currentForIp = directConnections.get(clientIp) || 0;
  if (!lease || currentForIp >= directMaxPerIp) {
    client.destroy();
    return;
  }

  directConnections.set(clientIp, currentForIp + 1);
  recordDirectConnection(lease.principal_id);
  client.setNoDelay(true);
  client.setKeepAlive(true, 15_000);

  const upstream = net.createConnection({ host: "127.0.0.1", port: mavlinkPort });
  upstream.setNoDelay(true);
  upstream.setKeepAlive(true, 15_000);

  let cleaned = false;
  let authorizationTimer;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (authorizationTimer) clearInterval(authorizationTimer);
    const count = directConnections.get(clientIp) || 1;
    if (count <= 1) directConnections.delete(clientIp);
    else directConnections.set(clientIp, count - 1);
    if (!client.destroyed) client.destroy();
    if (!upstream.destroyed) upstream.destroy();
  };

  upstream.once("connect", () => {
    client.pipe(upstream);
    upstream.pipe(client);
    client.resume();
    // Leases can expire or be revoked while Mission Planner is connected.
    // Re-check this exact lease so a live TCP stream cannot outlast website
    // authorization. Do not call activeLeaseForIp() here: multiple approved
    // users can legitimately share a NAT/public IP, and the newest lease for
    // that IP must not disconnect an older still-valid session.
    authorizationTimer = setInterval(() => {
      if (!leaseStillAuthorizes(lease.principal_id, clientIp)) cleanup();
    }, 5_000);
    authorizationTimer.unref();
  });
  upstream.on("error", cleanup);
  upstream.on("close", cleanup);
  client.on("error", cleanup);
  client.on("close", cleanup);
}

function proxyV2ClientIp(buffer) {
  if (buffer.length < 16 || !buffer.subarray(0, 12).equals(proxyV2Signature)) return null;
  const versionCommand = buffer[12];
  const familyProtocol = buffer[13];
  if ((versionCommand >> 4) !== 2 || (versionCommand & 0x0f) !== 1 || (familyProtocol & 0x0f) !== 1) return null;

  const family = familyProtocol >> 4;
  if (family === 1) {
    if (buffer.length < 28) return null;
    return Array.from(buffer.subarray(16, 20)).join(".");
  }
  if (family === 2) {
    if (buffer.length < 52) return null;
    const source = buffer.subarray(16, 32);
    const groups = [];
    for (let index = 0; index < source.length; index += 2) groups.push(source.readUInt16BE(index).toString(16));
    return groups.join(":");
  }
  return null;
}

function acceptProxyV2Client(client) {
  client.pause();
  let buffer = Buffer.alloc(0);
  const timeout = setTimeout(() => client.destroy(), 5_000);

  const onData = (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 16) return;
    if (!buffer.subarray(0, 12).equals(proxyV2Signature)) {
      clearTimeout(timeout);
      client.destroy();
      return;
    }

    const addressLength = buffer.readUInt16BE(14);
    if (addressLength > 1024) {
      clearTimeout(timeout);
      client.destroy();
      return;
    }
    const headerLength = 16 + addressLength;
    if (buffer.length < headerLength) return;

    const clientIp = normalizeIp(proxyV2ClientIp(buffer.subarray(0, headerLength)));
    clearTimeout(timeout);
    client.removeListener("data", onData);
    client.pause();
    if (!clientIp) {
      client.destroy();
      return;
    }
    const remainder = buffer.subarray(headerLength);
    if (remainder.length) client.unshift(remainder);
    bridgeAuthorizedDirectClient(client, clientIp);
  };

  client.on("data", onData);
  client.resume();
}

function tokenFromProtocol(header) {
  for (const part of String(header || "").split(",").map((item) => item.trim())) {
    if (part.startsWith("suas-token.")) return part.slice("suas-token.".length);
  }
  return "";
}

function wsFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) header = Buffer.from([0x80 | opcode, body.length]);
  else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

function closeSocket(socket, code = 1000) {
  if (!socket.destroyed) socket.end(wsFrame(0x8, Buffer.from([code >> 8, code & 0xff])));
}

function bridgeWebSocket(socket, headers, accessToken, clientIp) {
  const sessionToken = tokenFromProtocol(headers["sec-websocket-protocol"]);
  const missionPlannerAccess = accessToken ? validateMissionPlannerAccess(accessToken, clientIp) : null;
  if (!validateToken(sessionToken) && !missionPlannerAccess) {
    socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return;
  }
  const key = headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
  ];
  const requestedProtocols = String(headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((item) => item.trim());
  if (requestedProtocols.includes("suas-mavlink-v1")) responseHeaders.push("Sec-WebSocket-Protocol: suas-mavlink-v1");
  responseHeaders.push("\r\n");
  socket.write(responseHeaders.join("\r\n"));
  socket.setNoDelay(true);

  const upstream = net.createConnection({ host: "127.0.0.1", port: mavlinkPort });
  let buffer = Buffer.alloc(0);
  let closed = false;
  let authorizationTimer;
  const pingTimer = setInterval(() => {
    if (!socket.destroyed) socket.write(wsFrame(0x9, Buffer.alloc(0)));
  }, 25_000);
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(pingTimer);
    if (authorizationTimer) clearInterval(authorizationTimer);
    upstream.destroy();
  };
  const fail = () => {
    cleanup();
    if (!socket.destroyed) closeSocket(socket, 1011);
  };

  upstream.on("data", (chunk) => { if (!socket.destroyed) socket.write(wsFrame(0x2, chunk)); });
  upstream.on("error", fail);
  upstream.on("close", () => { if (!closed) fail(); });
  if (missionPlannerAccess) {
    authorizationTimer = setInterval(() => {
      if (!missionPlannerAccessStillValid(missionPlannerAccess.token_hash, clientIp)) {
        cleanup();
        closeSocket(socket, 1008);
      }
    }, 5_000);
    authorizationTimer.unref();
  }

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; const big = buffer.readBigUInt64BE(2); if (big > BigInt(64 * 1024 * 1024)) return fail(); length = Number(big); offset = 10; }
      if (!masked || buffer.length < offset + 4 + length) return masked ? undefined : fail();
      const mask = buffer.subarray(offset, offset + 4); offset += 4;
      const payload = Buffer.alloc(length);
      for (let index = 0; index < length; index += 1) payload[index] = buffer[offset + index] ^ mask[index % 4];
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x8) { cleanup(); closeSocket(socket); return; }
      if (opcode === 0x9) { socket.write(wsFrame(0xA, payload)); continue; }
      if (opcode === 0x2 || opcode === 0x0) upstream.write(payload);
    }
  });
  socket.on("error", cleanup);
  socket.on("close", cleanup);
}

function proxyHttp(req, res) {
  const headers = { ...req.headers, host: req.headers.host || "dev.suasstem.org", connection: "close" };
  const sourceIp = normalizeIp(req.socket.remoteAddress);
  if (sourceIp !== "127.0.0.1" && sourceIp !== "::1") {
    delete headers["cf-connecting-ip"];
    delete headers["cf-ipcountry"];
    delete headers["cf-ray"];
  }
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: nextPort,
    method: req.method,
    path: req.url,
    headers,
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("Dev site is starting");
  });
  req.pipe(upstream);
}

const server = http.createServer(proxyHttp);
server.on("upgrade", (req, socket) => {
  const parsed = new URL(req.url || "/", "http://localhost");
  if (parsed.pathname !== "/api/sitl/ws") {
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    return;
  }
  const sourceIp = normalizeIp(req.socket.remoteAddress);
  const clientIp = sourceIp === "127.0.0.1" || sourceIp === "::1"
    ? normalizeIp(req.headers["cf-connecting-ip"]) || sourceIp
    : sourceIp;
  bridgeWebSocket(socket, req.headers, parsed.searchParams.get("access") || "", clientIp);
});
server.listen(publicPort, "0.0.0.0", () => console.log(`SUAS gateway listening on ${publicPort}; Next on ${nextPort}`));

ensureDirectSchema();
ensureMissionPlannerSchema();
const directServer = net.createServer((client) => {
  const clientIp = normalizeIp(client.remoteAddress);
  bridgeAuthorizedDirectClient(client, clientIp);
});
directServer.on("error", (error) => {
  console.error(`SITL direct TCP gateway failed on port ${directTcpPort}`, error);
});
// Keep the non-PROXY listener local-only. Internet-facing direct access is
// intentionally exposed through the loopback PROXY-v2 listener below so the
// gateway authorizes the real client IP supplied by Tailscale Funnel. Binding
// this fallback listener on every interface needlessly exposed an additional
// raw TCP port on LAN/Tailscale interfaces and could never reliably match the
// Cloudflare-observed public IP used when the lease was granted.
directServer.listen(directTcpPort, "127.0.0.1", () => {
  console.log(`SITL direct TCP gateway listening on ${directTcpPort}; upstream ${mavlinkPort}`);
});

const proxyDirectServer = net.createServer(acceptProxyV2Client);
proxyDirectServer.on("error", (error) => {
  console.error(`SITL PROXY-v2 TCP gateway failed on port ${proxyDirectTcpPort}`, error);
});
proxyDirectServer.listen(proxyDirectTcpPort, "127.0.0.1", () => {
  console.log(`SITL PROXY-v2 TCP gateway listening on ${proxyDirectTcpPort}; upstream ${mavlinkPort}`);
});
const directCleanupTimer = setInterval(cleanupExpiredDirectLeases, 5 * 60 * 1000);
directCleanupTimer.unref();
const missionPlannerCleanupTimer = setInterval(cleanupExpiredMissionPlannerAccess, 5 * 60 * 1000);
missionPlannerCleanupTimer.unref();

function shutdown() {
  server.close();
  directServer.close();
  proxyDirectServer.close();
  nextChild?.kill("SIGTERM");
  setTimeout(() => process.exit(0), 2_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
