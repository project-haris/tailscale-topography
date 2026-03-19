const metricsEl = document.getElementById("metrics");
const nodeListEl = document.getElementById("nodeList");
const graphEl = document.getElementById("graph");
const refreshButton = document.getElementById("refreshButton");
const statusPill = document.getElementById("statusPill");
const tailnetLabel = document.getElementById("tailnetLabel");
const metricTemplate = document.getElementById("metricTemplate");
const nodeTemplate = document.getElementById("nodeTemplate");

function metricCard(label, value) {
  const fragment = metricTemplate.content.cloneNode(true);
  fragment.querySelector(".metric-label").textContent = label;
  fragment.querySelector(".metric-value").textContent = value;
  return fragment;
}

function nodeField(term, value, metaEl) {
  if (!value) {
    return;
  }
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  metaEl.append(dt, dd);
}

function formatBytes(value) {
  if (!value) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

function renderMetrics(data) {
  metricsEl.replaceChildren(
    metricCard("Peers", data.metrics.peerCount),
    metricCard("Online", data.metrics.onlinePeers),
    metricCard("Direct", data.metrics.directPeers),
    metricCard("Relayed", data.metrics.relayPeers),
    metricCard("Tagged", data.metrics.taggedPeers),
    metricCard("Exit Nodes", data.metrics.exitNodes),
  );
}

function renderNodes(data) {
  const cards = data.nodes.map((node) => {
    const fragment = nodeTemplate.content.cloneNode(true);
    fragment.querySelector(".node-title").textContent = node.displayName;
    fragment.querySelector(".node-subtitle").textContent = `${node.os} ${node.primaryIp ? `• ${node.primaryIp}` : ""}`;
    const stateEl = fragment.querySelector(".node-state");
    stateEl.textContent = node.id === data.self.id ? "Local node" : node.online ? "Online" : "Offline";
    stateEl.classList.add(node.online || node.id === data.self.id ? "online" : "offline");

    const metaEl = fragment.querySelector(".node-meta");
    nodeField("DNS", node.dnsName, metaEl);
    nodeField("User", node.user, metaEl);
    nodeField("Path", node.connectionLabel, metaEl);
    nodeField("Tags", node.tags.join(", "), metaEl);
    nodeField("Addresses", node.addresses.join(", "), metaEl);
    nodeField("Traffic", `${formatBytes(node.rxBytes)} in / ${formatBytes(node.txBytes)} out`, metaEl);
    nodeField("Location", [node.location?.city, node.location?.country].filter(Boolean).join(", "), metaEl);
    return fragment;
  });

  nodeListEl.replaceChildren(...cards);
}

function renderGraph(data) {
  const container = document.createElement("div");
  container.className = "graph-central";

  const scene = document.createElement("div");
  scene.className = "graph-scene";
  container.append(scene);

  const rings = document.createElement("div");
  rings.className = "graph-rings";
  rings.innerHTML = `
    <div class="graph-ring graph-ring-outer"></div>
    <div class="graph-ring graph-ring-inner"></div>
  `;
  scene.append(rings);

  const linkLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  linkLayer.setAttribute("class", "graph-lines");
  linkLayer.setAttribute("viewBox", "0 0 100 100");
  linkLayer.setAttribute("preserveAspectRatio", "none");
  scene.append(linkLayer);

  const selfNode = document.createElement("article");
  selfNode.className = "graph-node self";
  selfNode.style.left = "50%";
  selfNode.style.top = "50%";
  selfNode.innerHTML = `<h3>${data.self.displayName}</h3><p>${data.self.primaryIp || "No tailnet IP"}</p>`;
  scene.append(selfNode);

  const peers = data.nodes.filter((node) => node.id !== data.self.id);
  const peerCount = peers.length;
  const innerCount = peerCount > 8 ? Math.ceil(peerCount / 2) : peerCount;
  const outerCount = Math.max(peerCount - innerCount, 0);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  peers.forEach((node, index) => {
    const onInnerRing = index < innerCount;
    const ringSize = onInnerRing ? innerCount : outerCount;
    const ringIndex = onInnerRing ? index : index - innerCount;
    const angleOffset = onInnerRing ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / Math.max(outerCount, 2);
    const angle = angleOffset + ((Math.PI * 2) / Math.max(ringSize, 1)) * ringIndex;
    const radius = peerCount <= 6 ? 40 : onInnerRing ? 30 : 43;
    const x = clamp(50 + Math.cos(angle) * radius, 14, 86);
    const y = clamp(50 + Math.sin(angle) * radius, 16, 84);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "50");
    line.setAttribute("y1", "50");
    line.setAttribute("x2", `${x}`);
    line.setAttribute("y2", `${y}`);
    line.setAttribute("class", `graph-line ${node.currentAddress ? "direct" : node.relay ? "relay" : "unknown"}`);
    linkLayer.append(line);

    const peerEl = document.createElement("article");
    peerEl.className = `graph-node peer ${node.online ? "online" : "offline"}`;
    peerEl.style.left = `${x}%`;
    peerEl.style.top = `${y}%`;
    peerEl.innerHTML = `<h3>${node.displayName}</h3><p>${node.connectionLabel}</p>`;
    scene.append(peerEl);
  });

  const chips = document.createElement("div");
  chips.className = "graph-links";
  data.links.forEach((link) => {
    const chip = document.createElement("span");
    chip.className = `graph-chip ${link.kind}`;
    chip.textContent = `${link.label} • ${link.online ? "online" : "offline"}`;
    chips.append(chip);
  });

  graphEl.replaceChildren(container, chips);
}

function setStatus(text, kind = "neutral") {
  statusPill.textContent = text;
  statusPill.className = `status-pill ${kind}`;
}

async function loadTopology() {
  setStatus("Refreshing...");
  refreshButton.disabled = true;

  try {
    const response = await fetch("/api/topology", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "Request failed");
    }

    tailnetLabel.textContent = `${data.currentTailnet || "Unknown tailnet"} • ${data.backendState || "unknown state"} • Updated ${new Date(data.metrics.generatedAt).toLocaleTimeString()}`;
    renderMetrics(data);
    renderNodes(data);
    renderGraph(data);
    setStatus("Live data loaded", "online");
  } catch (error) {
    metricsEl.replaceChildren(metricCard("Status", "Unavailable"));
    nodeListEl.textContent = error.message;
    graphEl.textContent = "Topology data is unavailable. Make sure tailscaled is running and this process can execute the Tailscale CLI.";
    tailnetLabel.textContent = "Tailscale data unavailable";
    setStatus("Fetch failed", "offline");
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", () => {
  loadTopology();
});

loadTopology();
setInterval(loadTopology, 30000);
