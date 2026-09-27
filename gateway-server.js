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
const dbPath = process.env.DEV_ACCESS_DB || "/home/pi/suas-site-dev/data/dev-access.db";

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

ensureMissionPlannerSchema();
const missionPlannerCleanupTimer = setInterval(cleanupExpiredMissionPlannerAccess, 5 * 60 * 1000);
missionPlannerCleanupTimer.unref();

function shutdown() {
  server.close();
  nextChild?.kill("SIGTERM");
  setTimeout(() => process.exit(0), 2_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
