// KASCompute PRO Dashboard JS (FINAL)

// ===== Explorer UI (HUD / Search / Drawer) =====
let __lastNodes = [];
let __lastJobs = [];
let __lastJobsSummary = null;
let __lastMining = null;

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

function formatTimestampFull(unix){
  if(!unix) return "–";
  const d = new Date(unix * 1000);
  if(Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString();
}

function formatTimeOnly(unix){
  if(!unix) return "–";
  const d = new Date(unix * 1000);
  if(Number.isNaN(d.getTime())) return "–";
  return d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

function fmt(v){
  if (v === null || v === undefined) return "–";
  if (typeof v === "number" && isFinite(v)) return v.toLocaleString();
  return String(v);
}

function initExplorerUI(){
  const input = document.getElementById("global-search");
  const clearBtn = document.getElementById("search-clear");

  if (clearBtn) clearBtn.addEventListener("click", () => {
    if(input){
      input.value="";
      applySearch("");
      input.focus();
    }
  });

  if (input){
    input.addEventListener("input", () => applySearch(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){
        input.value="";
        applySearch("");
        input.blur();
        closeDrawer();
      }
    });
  }

  const closeBtn = document.getElementById("drawer-close");
  const backdrop = document.getElementById("drawer-backdrop");
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if(e.key==="Escape") closeDrawer(); });

  const copyBtn = document.getElementById("drawer-copy");
  if (copyBtn){
    copyBtn.addEventListener("click", async () => {
      const pre = document.getElementById("drawer-pre");
      const txt = pre ? pre.textContent : "";
      try{
        await navigator.clipboard.writeText(txt);
        copyBtn.textContent = "Copied";
        setTimeout(()=>copyBtn.textContent="Copy JSON", 900);
      } catch {
        copyBtn.textContent = "Copy failed";
        setTimeout(()=>copyBtn.textContent="Copy JSON", 900);
      }
    });
  }
}

function setHud(mining, jobsSummary, nodes){
  const nodesCount = Array.isArray(nodes) ? nodes.length : 0;
  const jobsTotal = jobsSummary?.total ?? (Array.isArray(__lastJobs) ? __lastJobs.length : 0);
  const height = mining?.block_height ?? mining?.height ?? "–";

  const n = document.getElementById("hud-nodes");
  const j = document.getElementById("hud-jobs");
  const h = document.getElementById("hud-height");
  if (n) n.textContent = fmt(nodesCount);
  if (j) j.textContent = fmt(jobsTotal);
  if (h) h.textContent = fmt(height);
}

function applySearch(q){
  const query = String(q||"").trim().toLowerCase();

  const filterRows = (tbodySel) => {
    const rows = Array.from(document.querySelectorAll(`${tbodySel} tr`));
    rows.forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.classList.toggle("hidden", query && !text.includes(query));
    });
  };

  filterRows("#nodes-table-body");
  filterRows("#jobs-table-body");
  filterRows("#miners-table-body");

  const term = document.getElementById("proof-terminal");
  if (term){
    const lines = Array.from(term.children);
    lines.forEach(line => {
      const text = line.textContent.toLowerCase();
      line.style.display = (query && !text.includes(query)) ? "none" : "";
    });
  }

  if (typeof updateMapMarkers === "function"){
    if (query){
      const filtered = (__lastNodes || []).filter(n => JSON.stringify(n).toLowerCase().includes(query));
      updateMapMarkers(filtered);
    } else {
      updateMapMarkers(__lastNodes);
      if(Array.isArray(__lastNodes) && __lastNodes.length>0){
        setState('map-state','hidden');
      } else {
        setState('map-state','empty');
      }
    }
  }
}

function openDrawer(kind, title, obj){
  const drawer = document.getElementById("detail-drawer");
  if (!drawer) return;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");

  const kicker = document.getElementById("drawer-kicker");
  const name = document.getElementById("drawer-name");
  if (kicker) kicker.textContent = (kind || "DETAILS").toUpperCase();
  if (name) name.textContent = title || "—";

  const grid = document.getElementById("drawer-grid");
  if (grid){
    grid.innerHTML = "";
    const add = (k,v) => {
      const el = document.createElement("div");
      el.className = "kv";
      el.innerHTML = `<div class="k">${escapeHtml(String(k))}</div><div class="v">${escapeHtml(String(v))}</div>`;
      grid.appendChild(el);
    };

    if (kind === "NODE"){
      add("node_id", obj?.node_id ?? "–");
      add("public_key", obj?.public_key_hex ?? "–");
      add("last_seen", formatTimestampFull(obj?.last_seen_unix));
      add("country", obj?.country ?? "–");
      add("geo", (typeof obj?.latitude==="number" && typeof obj?.longitude==="number") ? `${obj.latitude.toFixed(4)}, ${obj.longitude.toFixed(4)}` : "pseudo");
    } else if (kind === "JOB"){
      add("id", obj?.id ?? "–");
      add("status", obj?.status ?? "–");
      add("assigned_node", obj?.assigned_node ?? "–");
      add("work_units", obj?.work_units ?? 0);
      add("created", formatTimestampFull(obj?.created_unix));
      add("updated", formatTimestampFull(obj?.updated_unix));
    } else if (kind === "MINER"){
      add("rank", obj?.rank ?? "–");
      add("node_id", obj?.node_id ?? "–");
      add("hashrate_share", obj?.hashrate_share ?? obj?.share ?? "–");
      add("mined_kct", obj?.total_mined_nano ? nanoToKct(Number(obj.total_mined_nano)).toFixed(4) : "–");
    } else {
      Object.entries(obj || {}).slice(0, 12).forEach(([k,v]) => add(k, v));
    }
  }

  const pre = document.getElementById("drawer-pre");
  if (pre){
    try{ pre.textContent = JSON.stringify(obj ?? {}, null, 2); }
    catch{ pre.textContent = String(obj ?? ""); }
  }
}

function closeDrawer(){
  const drawer = document.getElementById("detail-drawer");
  if (!drawer) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function wireRowClicks(){
  const nt = document.getElementById("nodes-table-body");
  if (nt && !nt.dataset.wired){
    nt.dataset.wired = "1";
    nt.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
      const id = tr.dataset.nodeId;
      const obj = (__lastNodes || []).find(n => String(n.node_id ?? "") === String(id));
      if (obj) openDrawer("NODE", String(obj.node_id ?? "NODE"), obj);
    });
  }

  const jt = document.getElementById("jobs-table-body");
  if (jt && !jt.dataset.wired){
    jt.dataset.wired = "1";
    jt.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
      const id = tr.dataset.jobId;
      const obj = (__lastJobs || []).find(j => String(j.id ?? "") === String(id));
      if (obj) openDrawer("JOB", `JOB ${obj.id ?? "—"}`, obj);
    });
  }

  const mt = document.getElementById("miners-table-body");
  if (mt && !mt.dataset.wired){
    mt.dataset.wired = "1";
    mt.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
      const obj = tr.__minerObj;
      const rank = tr.dataset.rank || "–";
      if (obj) openDrawer("MINER", `MINER #${rank}`, obj);
    });
  }
}

// API base from <body data-api-base="...">, fallback = same-origin
const API_BASE = (document.body?.dataset?.apiBase?.trim() || window.location.origin).replace(/\/+$/, "");

const KCT_NANO = 100_000_000;

// Leaflet map globals
let nodeMap = null;
let nodeLayer = null;

// Charts
let rewardChart = null;

window.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  try{ initMap(); }catch(e){ console.warn("Map init failed", e); }

  initKaspaTicker();
  wireButtons();
  initExplorerUI();
  initInstanceInfo();

  updateNodesCountUI();
  setInterval(updateNodesCountUI, 5000);

  initQuickstart();
  refreshHealth();
  setInterval(refreshHealth, 8000);

  wireRowClicks();

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
      alert("Kaspa / Kasplex wallet integration will be wired into this testnet dashboard in a later PRO iteration.");
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
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const price = data?.kaspa?.usd;
    el.textContent = typeof price === "number" ? "$" + price.toFixed(4) : "–";
  } catch {
    el.textContent = "–";
  }
}

// ===== Data refresh =====
async function refreshAll() {
  try {
const [mining, jobsSummary, jobs, nodes, proofs] = await Promise.all([
fetchJson("/api/mining"),
fetchJson("/api/jobs/summary"),
fetchJson("/api/jobs"),
fetchJson("/api/nodes"),
fetchJson("/api/proofs"),
]);



    __lastMining = mining;
    __lastJobsSummary = jobsSummary;
    __lastJobs = Array.isArray(jobs) ? jobs : [];
    __lastNodes = Array.isArray(nodes) ? nodes : [];

    updateMiningHero(mining, jobsSummary, nodes);
    setHud(mining, jobsSummary, nodes);

    if (typeof window.Chart !== "undefined") {
      updateRewardChart(mining);
    }

    updateNodesSection(nodes);
    updateMinersSection(mining);
    updateJobsSection(jobsSummary, jobs);
    updateProofTerminal(proofs);
    updateMapMarkers(nodes);

    wireRowClicks();
    applyDeepLink();

  } catch (e) {
    console.error("[refresh] failed", e);
  }
}

async function fetchJson(path) {
  const url = /^https?:\/\//i.test(path) ? path : (API_BASE + path);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
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

  if (bh) bh.textContent = mining.block_height ?? "–";
  if (mi) mi.textContent = `Month index ${mining.month_index ?? "–"} • Block time 60s`;

  if (br) br.textContent = `${Number(mining.current_block_reward_kct ?? 0).toFixed(3)} KCT`;
  if (brn) brn.textContent = `${Number(mining.current_block_reward_nano ?? 0).toLocaleString()} nanoKCT`;

  if (emk) emk.textContent = `${nanoToKct(Number(mining.total_emitted_nano ?? 0)).toFixed(3)} KCT`;
  if (emn) emn.textContent = `${Number(mining.total_emitted_nano ?? 0).toLocaleString()} nanoKCT`;

  if (nodeCountEl) nodeCountEl.textContent = Array.isArray(nodes) ? nodes.length : 0;

  if (jobsSummary && jobsSumEl) {
    jobsSumEl.textContent = `${jobsSummary.pending ?? 0} / ${jobsSummary.running ?? 0} / ${jobsSummary.completed ?? 0}`;
  }

  if (topMinerEl && topMinerShareEl && Array.isArray(mining.per_node)) {
    const sorted = [...mining.per_node].sort((a, b) => (b.total_mined_nano ?? 0) - (a.total_mined_nano ?? 0));
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

  const canvas = document.getElementById("chart-reward-distribution");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const nodes = [...mining.per_node].sort((a, b) => (b.total_mined_nano ?? 0) - (a.total_mined_nano ?? 0));
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
      tr.dataset.nodeId = String(node.node_id ?? "");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><span class="node-dot ${nodeOnlineClass(node.last_seen_unix)}"></span>${escapeHtml(node.node_id ?? "–")}</td>
        <td>${escapeHtml(shorten(node.public_key_hex ?? "", 10))}</td>
        <td>${escapeHtml(formatTimestampFull(node.last_seen_unix))}</td>
      `;
      tbody.appendChild(tr);
    });
}

// Map init
function initMap(){
  if (typeof window.L === "undefined") { console.warn("Leaflet (L) not loaded — map disabled."); return; }
  const mapEl = document.getElementById("node-map");
  if (!mapEl) return;

  nodeMap = L.map("node-map", { zoomControl: false, worldCopyJump: true }).setView([18, 12], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  }).addTo(nodeMap);

  nodeLayer = L.layerGroup().addTo(nodeMap);
}

// Geo + fallback
function updateMapMarkers(nodes) {
  if (!nodeMap || !nodeLayer) return;

  const arr = Array.isArray(nodes) ? nodes : [];
  nodeLayer.clearLayers();

  if (arr.length === 0){
    setState("map-state","empty");
    return;
  }

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
       Last seen: ${escapeHtml(formatTimestampFull(node.last_seen_unix))}<br/>
       Geo: ${hasReal ? "GeoIP" : "fallback"}`
    );

    nodeLayer.addLayer(marker);
  });

  setState("map-state","hidden");
}

function pseudoCoordsFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const lat = ((h % 270) - 135) * 0.5;
  const lonSeed = (h / 31) >>> 0;
  const lon = ((lonSeed % 720) - 360) * 0.5;
  return { lat, lon };
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
    tr1.dataset.rank = String(idx + 1);
    tr1.__minerObj = { ...n, rank: idx + 1 };
    tr1.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(n.node_id ?? "–")}</td>
      <td>${formatKct(Number(n.total_mined_nano ?? 0), 4)}</td>
      <td>${formatKct(Number(n.last_block_reward_nano ?? 0), 4)}</td>
      <td>${formatPct(Number(n.hashrate_share ?? 0), 2)} %</td>
    `;
    minersBody.appendChild(tr1);

    const tr2 = document.createElement("tr");
    tr2.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(n.node_id ?? "–")}</td>
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
      tr.dataset.jobId = String(job.id ?? "");
      tr.innerHTML = `
        <td>${job.id ?? "–"}</td>
        <td>${escapeHtml(job.status ?? "–")}</td>
        <td>${escapeHtml(job.assigned_node ?? "–")}</td>
        <td>${Number(job.work_units ?? 0).toLocaleString()}</td>
        <td>${escapeHtml(formatTimestampFull(job.created_unix))}</td>
        <td>${escapeHtml(formatTimestampFull(job.updated_unix))}</td>
      `;
      tbody.appendChild(tr);
    });
}

// Proof stream
function updateProofTerminal(proofs) {
  const term = document.getElementById("proof-terminal");
  if (!term) return;

  if (!Array.isArray(proofs) || proofs.length === 0) {
    term.innerHTML = '<div class="terminal-line muted">Waiting for proofs... start a miner to see activity.</div>';
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
      <span class="ts">[${escapeHtml(formatTimeOnly(p.timestamp_unix))}]</span>
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

// ===== Health =====
async function pingEndpoint(url){
  const t0 = performance.now();
  try{
    const res = await fetch(API_BASE + url, { cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    return { ok: res.ok, status: res.status, ms };
  }catch(err){
    const ms = Math.round(performance.now() - t0);
    return { ok:false, status: 0, ms, err: String(err) };
  }
}

function setHealth(elStatus, elLatency, ok, ms){
  if (!elStatus || !elLatency) return;
  elLatency.textContent = isFinite(ms) ? `${ms} ms` : "–";
  if (ok){
    elStatus.textContent = "UP";
    elStatus.className = "mini-value badge-up";
    return;
  }
  elStatus.textContent = "DOWN";
  elStatus.className = "mini-value badge-down";
}

async function refreshHealth(){
  const apiStatus = document.getElementById("api-status");
  const apiLatency = document.getElementById("api-latency");
  const nStatus = document.getElementById("api-nodes-status");
  const nLatency = document.getElementById("api-nodes-latency");
  const jStatus = document.getElementById("api-jobs-status");
  const jLatency = document.getElementById("api-jobs-latency");
  const mStatus = document.getElementById("api-mining-status");
  const mLatency = document.getElementById("api-mining-latency");

  const dot = document.getElementById("api-dot");
  const badge = document.getElementById("api-live");

  const pRoot = await pingEndpoint("/api/health").catch(()=>null);
  const pNodes = await pingEndpoint("/api/nodes");
  const pJobs = await pingEndpoint("/api/jobs");
  const pMining = await pingEndpoint("/api/mining");

  const apiOk = (pRoot && pRoot.ok) || pNodes.ok || pJobs.ok || pMining.ok;
  const apiMs = (pRoot && isFinite(pRoot.ms)) ? pRoot.ms : Math.min(pNodes.ms, pJobs.ms, pMining.ms);

  setHealth(apiStatus, apiLatency, apiOk, apiMs);
  setHealth(nStatus, nLatency, pNodes.ok, pNodes.ms);
  setHealth(jStatus, jLatency, pJobs.ok, pJobs.ms);
  setHealth(mStatus, mLatency, pMining.ok, pMining.ms);

  if (dot && badge){
    dot.classList.remove("dot-up","dot-down","dot-warn");
    if (apiOk){
      dot.classList.add("dot-up");
      badge.style.background = "rgba(34,197,94,.12)";
      badge.style.borderColor = "rgba(34,197,94,.18)";
    } else {
      dot.classList.add("dot-down");
      badge.style.background = "rgba(251,113,133,.12)";
      badge.style.borderColor = "rgba(251,113,133,.18)";
    }
  }
}

// ===== Quickstart =====
function initQuickstart(){
  const btn = document.getElementById("copy-quickstart");
  const code = document.getElementById("quickstart-code");
  if (btn && code){
    btn.addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(code.textContent || "");
        btn.textContent = "Copied";
        setTimeout(()=>btn.textContent="Copy", 900);
      }catch{
        btn.textContent = "Copy failed";
        setTimeout(()=>btn.textContent="Copy", 900);
      }
    });
  }

  const open = document.getElementById("open-downloads");
  if (open){
    open.addEventListener("click", ()=>{
      const howBtn = Array.from(document.querySelectorAll(".nav-link"))
        .find(b => (b.textContent||"").toLowerCase().includes("how"));
      if (howBtn) howBtn.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

// ===== Deep link =====
function applyDeepLink(){
  const params = new URLSearchParams(window.location.search);
  const node = params.get("node");
  const job = params.get("job");
  if (node){
    const obj = (__lastNodes || []).find(n => String(n.node_id ?? "") === String(node));
    if (obj) openDrawer("NODE", String(obj.node_id ?? "NODE"), obj);
  } else if (job){
    const obj = (__lastJobs || []).find(j => String(j.id ?? "") === String(job));
    if (obj) openDrawer("JOB", `JOB ${obj.id ?? "—"}`, obj);
  }
}

// ===== UI states =====
function setState(id, mode){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove("hidden","loading","empty","error");
  if(mode === "hidden"){ el.classList.add("hidden"); return; }
  el.classList.add(mode);
}

// ===== Instance info =====
function getApiBase(){
  const b = document.body;
  const v = b ? b.getAttribute("data-api-base") : "";
  return (v && v.trim().length) ? v.trim() : "";
}

function getRenderBase(){
  const b = document.body;
  const v = b ? b.getAttribute("data-render-base") : "";
  return (v && v.trim().length) ? v.trim() : "https://kascompute-testnet.onrender.com";
}

function initInstanceInfo(){
  const proto = window.location.protocol;
  const host = window.location.host || "local-file";
  const apiBase = getApiBase();
  const hostname = window.location.hostname || "";
  const isFile = (proto === "file:");
  const isLoopback = (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0");
  const isPrivateIp = (() => {
    const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  })();
  const isLocal = (isFile || isLoopback || isPrivateIp);

  const isRender = (!isLocal && host.includes("onrender.com"));
  const label = isLocal ? "LOCAL" : (isRender ? "RENDER" : "LIVE");
  const apiFull = (apiBase && apiBase.length) ? apiBase : `${proto}//${host}`;

  const badge = document.getElementById("instance-badge");
  const text = document.getElementById("instance-text");
  const banner = document.getElementById("instance-banner");

  if (banner) banner.style.display = "";
  if (badge){
    badge.textContent = label;
    badge.classList.toggle("live", !isLocal);
    badge.classList.toggle("local", isLocal);
  }
  if (text){
    text.textContent = isLocal
      ? `You are viewing a LOCAL instance (${host}). It will NOT show nodes from Render unless your nodes point to this machine.`
      : (isRender
          ? `You are viewing the LIVE Render testnet (${host}). Nodes & miners report here.`
          : `You are viewing a LIVE instance (${host}). Nodes & miners report here.`);
  }

  const copyBtn = document.getElementById("copy-instance");
  if (copyBtn){
    copyBtn.addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(apiFull);
        copyBtn.textContent = "Copied";
        setTimeout(()=>copyBtn.textContent="Copy API Base", 900);
      }catch{
        copyBtn.textContent = "Copy failed";
        setTimeout(()=>copyBtn.textContent="Copy API Base", 900);
      }
    });
  }

  const switchBtn = document.getElementById("switch-instance");
  if (switchBtn){
    const renderBase = getRenderBase();
    switchBtn.addEventListener("click", ()=>{
      window.open(`${renderBase}/dashboard/`, "_blank");
    });
  }
}

function nodeOnlineClass(lastSeenUnix){
  if (!lastSeenUnix) return "offline";
  const now = Math.floor(Date.now()/1000);
  const age = now - Number(lastSeenUnix);
  if (!isFinite(age)) return "offline";
  if (age <= 90) return "online";
  if (age <= 180) return "warn";
  return "offline";
}

// ===== Nodes count pill + banner =====
async function updateNodesCountUI(){
  try{
    const apiBase = getApiBase();
    const url = `${API_BASE}/api/nodes`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`nodes_http_${r.status}`);
    const nodes = await r.json();

    const now = Math.floor(Date.now()/1000);
    const total = Array.isArray(nodes) ? nodes.length : 0;
    const online = Array.isArray(nodes) ? nodes.filter(n=>{
      const t = Number(n?.last_seen_unix || 0);
      return t > 0 && (now - t) <= 90;
    }).length : 0;

    const pill = document.getElementById("nodes-pill-count");
    if (pill) pill.textContent = `${online}/${total}`;

    const banner = document.getElementById("nodes-banner-count");
    if (banner) banner.innerHTML = `Nodes <strong>${online}</strong> / ${total} • online ≤90s`;

  } catch {
    const pill = document.getElementById("nodes-pill-count");
    if (pill) pill.textContent = `—/—`;
    const banner = document.getElementById("nodes-banner-count");
    if (banner) banner.textContent = `Nodes —`;
  }
}
