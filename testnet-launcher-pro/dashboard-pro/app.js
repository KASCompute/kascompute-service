// KASCompute PRO Dashboard JS

// API base from <body data-api-base="...">, fallback = same-origin
const API_BASE = document.body?.dataset?.apiBase?.trim() || "";
const KCT_NANO = 100_000_000;

// Leaflet map globals
let nodeMap = null;
let nodeLayer = null;

// Charts
let rewardChart = null;

window.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initMap();
  initKaspaTicker();
  wireButtons();

  refreshAll();
  setInterval(refreshAll, 10_000);
});

function initNavigation() {
  const links = Array.from(document.querySelectorAll(".nav-link"));
  const sections = links
    .map((btn) => document.getElementById(btn.dataset.target))
    .filter(Boolean);

  links.forEach((btn) => {
    btn.addEventListener("click", () => {
      const sectionEl = document.getElementById(btn.dataset.target);
      if (!sectionEl) return;

      sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      links.forEach((l) => l.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const link = links.find((l) => l.dataset.target === entry.target.id);
          if (!link) return;
          links.forEach((l) => l.classList.remove("active"));
          link.classList.add("active");
        });
      },
      { threshold: 0.35 }
    );

    sections.forEach((sec) => obs.observe(sec));
  }
}

function wireButtons() {
  const walletBtn = document.getElementById("wallet-btn");
  if (walletBtn) {
    walletBtn.addEventListener("click", () => {
      alert(
        "Kaspa / Kasplex wallet integration will be wired into this testnet dashboard in a later PRO iteration."
      );
    });
  }
}

function initKaspaTicker() {
  fetchKaspaPrice();
  setInterval(fetchKaspaPrice, 60_000);
}

async function fetchKaspaPrice() {
  const el = document.getElementById("kas-price");
  if (!el) return;

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd"
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const price = data?.kaspa?.usd;
    el.textContent = typeof price === "number" ? "$" + price.toFixed(4) : "–";
  } catch {
    el.textContent = "–";
  }
}

async function refreshAll() {
  try {
    const [mining, jobsSummary, jobs, nodes, proofs] = await Promise.all([
      fetchJson("/mining"),
      fetchJson("/jobs/summary"),
      fetchJson("/jobs"),
      fetchJson("/nodes"),
      fetchJson("/proofs"),
    ]);

    updateMiningHero(mining, jobsSummary, nodes);
    updateRewardChart(mining);
    updateNodesSection(nodes);
    updateMinersSection(mining);
    updateJobsSection(jobsSummary, jobs);
    updateProofTerminal(proofs);
    updateMapMarkers(nodes);
  } catch (e) {
    console.error("[refresh] failed", e);
  }
}

async function fetchJson(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + path);
  return res.json();
}

function nanoToKct(nano) {
  if (typeof nano !== "number") return 0;
  return nano / KCT_NANO;
}

function formatKct(nano, decimals = 3) {
  return nanoToKct(nano).toFixed(decimals);
}

function formatPct(v, decimals = 1) {
  if (typeof v !== "number") return "0.0";
  return v.toFixed(decimals);
}

function formatTimestamp(unix) {
  if (!unix) return "–";
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shorten(str, keep = 8) {
  if (!str || str.length <= keep * 2) return str || "";
  return `${str.slice(0, keep)}…${str.slice(-keep)}`;
}

// HERO
function updateMiningHero(mining, jobsSummary, nodes) {
  if (!mining) return;

  const bh = document.getElementById("h-block-height");
  const mi = document.getElementById("h-month-index");
  const br = document.getElementById("h-block-reward");
  const brn = document.getElementById("h-block-reward-nano");
  const emk = document.getElementById("h-emitted-kct");
  const emn = document.getElementById("h-emitted-nano");
  const nodeCountEl = document.getElementById("h-node-count");
  const jobsSumEl = document.getElementById("h-jobs-summary");
  const topMinerEl = document.getElementById("h-top-miner");
  const topMinerShareEl = document.getElementById("h-top-miner-share");

  if (bh) bh.textContent = mining.block_height;
  if (mi) mi.textContent = `Month index ${mining.month_index} • Block time 60s`;

  if (br) br.textContent = `${Number(mining.current_block_reward_kct ?? 0).toFixed(3)} KCT`;
  if (brn) brn.textContent = `${Number(mining.current_block_reward_nano ?? 0).toLocaleString()} nanoKCT`;

  if (emk) emk.textContent = `${nanoToKct(Number(mining.total_emitted_nano ?? 0)).toFixed(3)} KCT`;
  if (emn) emn.textContent = `${Number(mining.total_emitted_nano ?? 0).toLocaleString()} nanoKCT`;

  if (nodeCountEl) nodeCountEl.textContent = Array.isArray(nodes) ? nodes.length : 0;

  if (jobsSummary && jobsSumEl) {
    jobsSumEl.textContent = `${jobsSummary.pending} / ${jobsSummary.running} / ${jobsSummary.completed}`;
  }

  if (topMinerEl && topMinerShareEl && Array.isArray(mining.per_node)) {
    const sorted = [...mining.per_node].sort(
      (a, b) => (b.total_mined_nano ?? 0) - (a.total_mined_nano ?? 0)
    );
    const top = sorted[0];
    if (top) {
      topMinerEl.textContent = top.node_id ?? "–";
      topMinerShareEl.textContent = `${formatPct(top.hashrate_share ?? 0, 1)} % hashrate`;
    } else {
      topMinerEl.textContent = "–";
      topMinerShareEl.textContent = "–";
    }
  }
}

// Reward chart
function updateRewardChart(mining) {
  if (!mining || !Array.isArray(mining.per_node)) return;

  const ctx = document.getElementById("chart-reward-distribution")?.getContext("2d");
  if (!ctx) return;

  const nodes = [...mining.per_node].sort(
    (a, b) => (b.total_mined_nano ?? 0) - (a.total_mined_nano ?? 0)
  );

  const labels = nodes.map((n) => n.node_id ?? "unknown");
  const data = nodes.map((n) => nanoToKct(Number(n.total_mined_nano ?? 0)));

  if (!rewardChart) {
    rewardChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Mined KCT (lifetime)", data }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: "rgba(75,85,99,0.4)" } },
        },
      },
    });
  } else {
    rewardChart.data.labels = labels;
    rewardChart.data.datasets[0].data = data;
    rewardChart.update("none");
  }
}

// Nodes list
function updateNodesSection(nodes) {
  const totalEl = document.getElementById("nodes-total");
  const recentEl = document.getElementById("nodes-recent");
  const tbody = document.getElementById("nodes-table-body");

  const arr = Array.isArray(nodes) ? nodes : [];
  if (totalEl) totalEl.textContent = arr.length;

  const now = Date.now() / 1000;
  const recent = arr.filter((n) => now - (n.last_seen_unix ?? 0) <= 120);
  if (recentEl) recentEl.textContent = recent.length;

  if (!tbody) return;
  tbody.innerHTML = "";

  arr
    .slice()
    .sort((a, b) => String(a.node_id ?? "").localeCompare(String(b.node_id ?? "")))
    .forEach((node, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${node.node_id ?? "–"}</td>
        <td>${shorten(node.public_key_hex ?? "", 10)}</td>
        <td>${formatTimestamp(node.last_seen_unix)}</td>
      `;
      tbody.appendChild(tr);
    });
}

// Map init
function initMap() {
  const mapEl = document.getElementById("node-map");
  if (!mapEl) return;

  nodeMap = L.map("node-map", { zoomControl: false, worldCopyJump: true }).setView([18, 12], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  }).addTo(nodeMap);

  nodeLayer = L.layerGroup().addTo(nodeMap);
}

// ✅ real Geo if provided by backend; otherwise fallback pseudo point
function updateMapMarkers(nodes) {
  if (!nodeMap || !nodeLayer) return;

  const arr = Array.isArray(nodes) ? nodes : [];
  nodeLayer.clearLayers();

  arr.forEach((node) => {
    const hasReal =
      typeof node.latitude === "number" &&
      typeof node.longitude === "number" &&
      isFinite(node.latitude) &&
      isFinite(node.longitude);

    const coords = hasReal
      ? { lat: node.latitude, lon: node.longitude }
      : pseudoCoordsFromId(String(node.node_id ?? ""));

    const marker = L.circleMarker([coords.lat, coords.lon], {
      radius: hasReal ? 7 : 6,
      color: "#00e3c0",
      weight: 1,
      fillColor: "#00e3c0",
      fillOpacity: hasReal ? 0.95 : 0.75,
    }).bindPopup(
      `<strong>${escapeHtml(String(node.node_id ?? "–"))}</strong><br/>
       Country: ${escapeHtml(String(node.country ?? "–"))}<br/>
       Last seen: ${escapeHtml(formatTimestamp(node.last_seen_unix))}<br/>
       Geo: ${hasReal ? "GeoIP" : "fallback"}`
    );

    nodeLayer.addLayer(marker);
  });
}

function pseudoCoordsFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const lat = ((h % 270) - 135) * 0.5;
  const lonSeed = (h / 31) >>> 0;
  const lon = ((lonSeed % 720) - 360) * 0.5;
  return { lat, lon };
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Mining tables
function updateMinersSection(mining) {
  if (!mining || !Array.isArray(mining.per_node)) return;

  const minersBody = document.getElementById("miners-table-body");
  const rewardsBody = document.getElementById("rewards-table-body");
  if (!minersBody || !rewardsBody) return;

  const sorted = [...mining.per_node].sort(
    (a, b) => (b.total_mined_nano ?? 0) - (a.total_mined_nano ?? 0)
  );

  minersBody.innerHTML = "";
  rewardsBody.innerHTML = "";

  sorted.forEach((n, idx) => {
    const tr1 = document.createElement("tr");
    tr1.innerHTML = `
      <td>${idx + 1}</td>
      <td>${n.node_id ?? "–"}</td>
      <td>${formatKct(Number(n.total_mined_nano ?? 0), 4)}</td>
      <td>${formatKct(Number(n.last_block_reward_nano ?? 0), 4)}</td>
      <td>${formatPct(Number(n.hashrate_share ?? 0), 2)} %</td>
    `;
    minersBody.appendChild(tr1);

    const tr2 = document.createElement("tr");
    tr2.innerHTML = `
      <td>${idx + 1}</td>
      <td>${n.node_id ?? "–"}</td>
      <td>${Number(n.cumulative_work_units ?? 0).toLocaleString()}</td>
      <td>${formatKct(Number(n.total_mined_nano ?? 0), 4)}</td>
    `;
    rewardsBody.appendChild(tr2);
  });
}

// Jobs
function updateJobsSection(summary, jobs) {
  const pEl = document.getElementById("jobs-pending");
  const rEl = document.getElementById("jobs-running");
  const cEl = document.getElementById("jobs-completed");
  const tEl = document.getElementById("jobs-total");

  if (summary) {
    if (pEl) pEl.textContent = summary.pending ?? 0;
    if (rEl) rEl.textContent = summary.running ?? 0;
    if (cEl) cEl.textContent = summary.completed ?? 0;
    if (tEl) tEl.textContent = summary.total ?? 0;
  }

  const tbody = document.getElementById("jobs-table-body");
  if (!tbody) return;

  const arr = Array.isArray(jobs) ? jobs : [];
  tbody.innerHTML = "";

  arr
    .slice()
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    .forEach((job) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${job.id ?? "–"}</td>
        <td>${job.status ?? "–"}</td>
        <td>${job.assigned_node ?? "–"}</td>
        <td>${Number(job.work_units ?? 0).toLocaleString()}</td>
        <td>${formatTimestamp(job.created_unix)}</td>
        <td>${formatTimestamp(job.updated_unix)}</td>
      `;
      tbody.appendChild(tr);
    });
}

// Proof stream
function updateProofTerminal(proofs) {
  const term = document.getElementById("proof-terminal");
  if (!term) return;

  if (!Array.isArray(proofs) || proofs.length === 0) {
    term.innerHTML =
      '<div class="terminal-line muted">Waiting for proofs... start a miner to see activity.</div>';
    return;
  }

  const latest = proofs
    .slice()
    .sort((a, b) => (b.timestamp_unix ?? 0) - (a.timestamp_unix ?? 0))
    .slice(0, 60);

  term.innerHTML = "";

  latest.forEach((p) => {
    const div = document.createElement("div");
    div.className = "terminal-line";
    div.innerHTML = `
      <span class="ts">[${formatTimestamp(p.timestamp_unix)}]</span>
      <span> • </span>
      <span class="node">${escapeHtml(String(p.node_id ?? "–"))}</span>
      <span> completed </span>
      <span class="job">job #${escapeHtml(String(p.job_id ?? "–"))}</span>
      <span> with </span>
      <span class="wu">${Number(p.work_units ?? 0).toLocaleString()} WU</span>
    `;
    term.appendChild(div);
  });
}
