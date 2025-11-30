// ==============================
// KASCompute Dashboard Frontend
// ==============================

// API liegt unter /api/*
const API_BASE = "/api";

// ---------- Helpers ----------

async function fetchJson(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return await res.json();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return n.toLocaleString();
}

function formatUsd(n) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Emission & Economics ----------

let baseEconomics = null;

function updateEmissionCards(e) {
  if (!e) return;
  setText("total-supply", formatNumber(e.total_supply_kct));
  setText("mined-supply", formatNumber(e.mined_supply_kct));
  setText("remaining-supply", formatNumber(e.remaining_supply_kct));
  setText("emission-month", e.emission_month ?? "-");
  setText("block-reward", e.current_block_reward_kct.toFixed(4) + " KCT");
  setText("monthly-decay", e.monthly_decay_pct.toFixed(2) + " %");
}

function updateEconomicsCards(ec) {
  if (!ec) return;
  baseEconomics = ec;

  setText("kct-price", formatUsd(ec.kct_price_usd));
  setText("circulating-supply", formatNumber(ec.circulating_supply_kct));
  setText("market-cap", formatUsd(ec.market_cap_usd));
  setText("investor-value", formatUsd(ec.investor_value_usd));
  setText("treasury-balance", formatNumber(ec.treasury_balance_kct));
  setText("treasury-value", formatUsd(ec.treasury_value_usd));

  const priceSlider = document.getElementById("kct-price-slider");
  if (priceSlider) {
    priceSlider.value = ec.kct_price_usd;
    setText("kct-price-slider-value", ec.kct_price_usd.toFixed(4) + " $");
  }

  const invSlider = document.getElementById("investor-multiplier-slider");
  if (invSlider) {
    invSlider.value = 1.0;
    setText("investor-multiplier-slider-value", "x1.0");
  }

  const treSlider = document.getElementById("treasury-multiplier-slider");
  if (treSlider) {
    treSlider.value = 1.0;
    setText("treasury-multiplier-slider-value", "x1.0");
  }
}

function recomputeFromSliders() {
  if (!baseEconomics) return;

  const priceSlider = document.getElementById("kct-price-slider");
  const invSlider = document.getElementById("investor-multiplier-slider");
  const treSlider = document.getElementById("treasury-multiplier-slider");

  let price = baseEconomics.kct_price_usd;
  let invMult = 1.0;
  let treMult = 1.0;

  if (priceSlider) {
    price = parseFloat(priceSlider.value);
    if (!isNaN(price)) {
      setText("kct-price-slider-value", price.toFixed(4) + " $");
      setText("kct-price", formatUsd(price));
    }
  }

  if (invSlider) {
    invMult = parseFloat(invSlider.value);
    if (!isNaN(invMult)) {
      setText("investor-multiplier-slider-value", "x" + invMult.toFixed(2));
    }
  }

  if (treSlider) {
    treMult = parseFloat(treSlider.value);
    if (!isNaN(treMult)) {
      setText("treasury-multiplier-slider-value", "x" + treMult.toFixed(2));
    }
  }

  const marketCap = price * (baseEconomics.circulating_supply_kct ?? 0);
  const investorVal = marketCap * invMult;
  const treasuryVal = price * (baseEconomics.treasury_balance_kct ?? 0) * treMult;

  setText("market-cap", formatUsd(marketCap));
  setText("investor-value", formatUsd(investorVal));
  setText("treasury-value", formatUsd(treasuryVal));
}

// ---------- Active Nodes ----------

function updateActiveNodesTable(activeNodes) {
  const tbody = document.getElementById("active-nodes-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!Array.isArray(activeNodes) || activeNodes.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3">No active nodes yet</td>`;
    tbody.appendChild(tr);
    setText("active-nodes-count", "0");
    return;
  }

  activeNodes.forEach((n) => {
    const tr = document.createElement("tr");
    const lastSeen = n.last_seen_unix
      ? new Date(n.last_seen_unix * 1000).toLocaleString()
      : "-";
    tr.innerHTML = `
      <td>${n.node_id ?? "-"}</td>
      <td>${n.compute_profile ?? "-"}</td>
      <td>${lastSeen}</td>
    `;
    tbody.appendChild(tr);
  });

  setText("active-nodes-count", activeNodes.length.toString());
}

// ---------- Proof-of-Compute (max 10 rows) ----------

function updateProofsTable(proofs) {
  const tbody = document.getElementById("poc-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!Array.isArray(proofs) || proofs.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5">No proofs submitted yet</td>`;
    tbody.appendChild(tr);
    return;
  }

  proofs.slice(0, 10).forEach((p) => {
    const unix = p.timestamp_unix ?? p.timestamp ?? 0;
    const dateStr = unix ? new Date(unix * 1000).toLocaleString() : "-";
    const wu = p.work_units ?? 0;
    const reward = p.estimated_reward_kct ?? 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.node_id ?? "-"}</td>
      <td>${p.job_id ?? "-"}</td>
      <td>${wu.toLocaleString()}</td>
      <td>${reward.toFixed(6)}</td>
      <td>${dateStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Main Refresh ----------

async function refreshDashboard() {
  try {
    const data = await fetchJson("/state");
    updateEmissionCards(data.emission);
    updateEconomicsCards(data.economics);
    updateActiveNodesTable(data.active_nodes);
    updateProofsTable(data.proofs_recent);
  } catch (err) {
    console.error("Failed to refresh dashboard:", err);
  }
}

function attachSliderListeners() {
  const priceSlider = document.getElementById("kct-price-slider");
  const invSlider = document.getElementById("investor-multiplier-slider");
  const treSlider = document.getElementById("treasury-multiplier-slider");

  if (priceSlider) priceSlider.addEventListener("input", recomputeFromSliders);
  if (invSlider) invSlider.addEventListener("input", recomputeFromSliders);
  if (treSlider) treSlider.addEventListener("input", recomputeFromSliders);
}

document.addEventListener("DOMContentLoaded", () => {
  attachSliderListeners();
  refreshDashboard();
  setInterval(refreshDashboard, 8000);
});
