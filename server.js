const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const publicDir = path.join(__dirname, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4180);
const statusTimeoutMs = Number(process.env.TAILSCALE_TIMEOUT_MS || 12000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60",
      "Content-Length": contents.length,
    });
    res.end(contents);
  });
}

function normalizePeer(peerId, peer = {}) {
  const addresses = Array.isArray(peer.TailscaleIPs) ? peer.TailscaleIPs : [];
  const tags = Array.isArray(peer.Tags) ? peer.Tags : [];
  const primaryIp = addresses[0] || "";
  const directAddress = peer.CurAddr || "";
  const endpointType = directAddress ? "direct" : peer.Relay || "unknown";
  const exitNode = Boolean(peer.ExitNodeOption || peer.ExitNode);

  return {
    id: peerId,
    name: peer.DNSName || peer.HostName || peer.Name || peerId,
    displayName: peer.HostName || peer.Name || peer.DNSName || peerId,
    dnsName: peer.DNSName || "",
    os: peer.OS || "unknown",
    user: peer.User || "",
    addresses,
    primaryIp,
    online: Boolean(peer.Online),
    active: Boolean(peer.Active),
    lastSeen: peer.LastSeen || null,
    created: peer.Created || null,
    tags,
    relay: peer.Relay || "",
    addrs: Array.isArray(peer.Addrs) ? peer.Addrs : [],
    currentAddress: directAddress,
    rxBytes: Number(peer.RxBytes || 0),
    txBytes: Number(peer.TxBytes || 0),
    exitNode,
    shareeNode: Boolean(peer.ShareeNode),
    endpointType,
    connectionLabel: directAddress ? "Direct" : peer.Relay ? `DERP ${peer.Relay}` : "Unknown",
    location: {
      city: peer.Location?.City || "",
      country: peer.Location?.Country || "",
    },
  };
}

function buildLinks(selfNodeId, peers) {
  return peers.map((peer) => ({
    source: selfNodeId,
    target: peer.id,
    kind: peer.currentAddress ? "direct" : peer.relay ? "relay" : "unknown",
    label: peer.connectionLabel,
    online: peer.online,
  }));
}

function buildTopography(status) {
  const self = status.Self || {};
  const peersMap = status.Peer || {};
  const peers = Object.entries(peersMap)
    .map(([peerId, peer]) => normalizePeer(peerId, peer))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const selfNodeId = self.ID || "self";
  const selfNode = {
    id: selfNodeId,
    name: self.DNSName || self.HostName || "This node",
    displayName: self.HostName || self.DNSName || "This node",
    dnsName: self.DNSName || "",
    os: self.OS || "unknown",
    user: self.User || "",
    addresses: Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [],
    primaryIp: Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs[0] || "" : "",
    online: true,
    active: true,
    tags: Array.isArray(self.Tags) ? self.Tags : [],
    relay: self.Relay || "",
    currentAddress: self.CurAddr || "",
    rxBytes: Number(self.RxBytes || 0),
    txBytes: Number(self.TxBytes || 0),
    exitNode: Boolean(self.ExitNodeOption || self.ExitNode),
    connectionLabel: "Local node",
  };

  const nodes = [selfNode, ...peers];
  const links = buildLinks(selfNodeId, peers);
  const metrics = {
    generatedAt: new Date().toISOString(),
    peerCount: peers.length,
    onlinePeers: peers.filter((peer) => peer.online).length,
    relayPeers: peers.filter((peer) => peer.relay && !peer.currentAddress).length,
    directPeers: peers.filter((peer) => peer.currentAddress).length,
    taggedPeers: peers.filter((peer) => peer.tags.length > 0).length,
    exitNodes: peers.filter((peer) => peer.exitNode).length,
  };

  return {
    ok: true,
    version: status.Version || "",
    backendState: status.BackendState || "",
    magicDNSSuffix: status.MagicDNSSuffix || "",
    currentTailnet: status.CurrentTailnet?.Name || "",
    self: selfNode,
    nodes,
    links,
    metrics,
  };
}

async function readStatus() {
  const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
    timeout: statusTimeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/topology") {
    try {
      const status = await readStatus();
      sendJson(res, 200, buildTopography(status));
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: "Unable to read Tailscale status",
        details: error.message,
      });
    }
    return;
  }

  let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  sendFile(res, filePath);
});

server.listen(port, host, () => {
  console.log(`tailscale-topography listening on http://${host}:${port}`);
});
