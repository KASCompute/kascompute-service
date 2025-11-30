// ======================================
// KASCompute Testnet Dashboard Frontend
// ======================================

// API base – gleiche Origin wie Render-App
const API_BASE = "";

// Helper: JSON fetch mit Fehler-Handling
async function fetchJson(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${path}`);
  }
  return await res.json();
}

// ------------------------
// DOM Helper
// ------------------------
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

// ------------------------
// Emission + Economics Cards
// ------------------------
let baseEconomics = null;

function updateEmissionCards(emission) {
  if (!emission) return;

  setText("total-supply", formatNumber(emission.total_supply_kct));
  setText("mined-supply", formatNumber(emission.mined_supply_kct));
  setText("remaining-supply", formatNumber(emission.remaining_supply_kct));
  setText("emission-month", emission.emission_month?.toString() ?? "-");
  setText(
    "block-reward",
    emission.current_block_reward_kct != null
      ? emission.current_block_reward_kct.toFixed(4) + " KCT"
      : "-"
  );
  setText(
    "monthly-decay",
    emission.monthly_decay_pct != null ? emission.monthly_decay_pct.toFixed(2) + " %" : "-"
  );
}

function updateEconomicsCards(econ) {
  if (!econ) return;
  baseEconomics = econ; // speichern für Slider-Berechnung

  setText("kct-price", formatUsd(econ.kct_price_usd));
  setText("circulating-supply", formatNumber(econ.circulating_supply_kct));
  setText("market-cap", formatUsd(econ.market_cap_usd));
  setText("investor-value", formatUsd(econ.investor_value_usd));
  setText("treasury-balance", formatNumber(econ.treasury_balance_kct));
  setText("treasury-value", formatUsd(econ.treasury_value_usd));

  // Slider initiale Labels
  const priceSlider = document.getElementById("kct-price-slider");
  if (priceSlider) {
    priceSlider.value = econ.kct_price_usd;
    setText("kct-price-slider-value", econ.kct_price_usd.toFixed(4) + " $");
  }

  const investorMultSlider = document.getElementById("investor-multiplier-slider");
  if (investorMultSlider) {
    investorMultSlider.value = 1.0;
    setText("investor-multiplier-slider-value", "x1.0");
  }

  const treasuryMultSlider = document.getElementById("treasury-multiplier-slider");
  if (treasuryMultSlider) {
    treasuryMultSlider.value = 1.0;
    setText("treasury-multiplier-slider-value", "x1.0");
  }
}

// Wird von den Slider-Events aufgerufen
function recomputeFromSliders() {
  if (!baseEconomics) return;

  const priceSlider = document.getElementById("kct-price-slider");
  const investorMultSlider = document.getElementById("investor-multiplier-slider");
  const treasuryMultSlider = document.getElementById("treasury-multiplier-slider");

  let price = baseEconomics.kct_price_usd;
  let investorMult = 1.0;
  let treasuryMult = 1.0;

  if (priceSlider) {
    price = parseFloat(priceSlider.value);
    if (!isNaN(price)) {
      setText("kct-price-slider-value", price.toFixed(4) + " $");
      setText("kct-price", formatUsd(price));
    }
  }

  if (investorMultSlider) {
    investorMult = parseFloat(investorMultSlider.value);
    if (!isNaN(investorMult)) {
      setText("investor-multiplier-slider-value", "x" + investorMult.toFixed(2));
    }
  }

  if (treasuryMultSlider) {
    treasuryMult = parseFloat(treasuryMultSlider.value);
    if (!isNaN(treasuryMult)) {
      setText("treasury-multiplier-slider-value", "x" + treasuryMult.toFixed(2));
    }
  }

  // Neue Werte berechnen
  const marketCap =
    price * (baseEconomics.circulating_supply_kct ?? 0);
  const investorValue =
    marketCap * investorMult;
  const treasuryValue =
    price * (baseEconomics.treasury_balance_kct ?? 0) * treasuryMult;

  setText("market-cap", formatUsd(marketCap));
  setText("investor-value", formatUsd(investorValue));
  setText("treasury-value", formatUsd(treasuryValue));
}

// ------------------------
// Active Nodes Tabelle
// ------------------------
function updateActiveNodesTable(activeNodes) {
  const tbody = document.getElementById("active-nodes-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!Array.isArray(activeNodes) || activeNodes.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3">No active nodes yet</td>`;
    tbody.appendChild(tr);
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

// ------------------------
// Proof-of-Compute Tabelle (max 10 Zeilen)
// ------------------------
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

  // WICHTIG: maximal 10 Zeilen anzeigen
  proofs.slice(0, 10).forEach((p) => {
    const tr = document.createElement("tr");

    const unix = p.timestamp_unix ?? p.timestamp ?? 0;
    const date = unix ? new Date(unix * 1000).toLocaleString() : "-";

    const workUnits = p.work_units ?? 0;
    const reward = p.estimated_reward_kct ?? 0;

    tr.innerHTML = `
      <td>${p.node_id ?? "-"}</td>
      <td>${p.job_id ?? "-"}</td>
      <td>${workUnits.toLocaleString()}</td>
      <td>${reward.toFixed(6)}</td>
      <td>${date}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ------------------------
// Main refresh
// ------------------------
async function refreshDashboard() {
  try {
    const data = await fetchJson("/api/state");

    updateEmissionCards(data.emission);
    updateEconomicsCards(data.economics);
    updateActiveNodesTable(data.active_nodes);
    updateProofsTable(data.proofs_recent);

  } catch (err) {
    console.error("Failed to refresh dashboard:", err);
  }
}

// ------------------------
// Init
// ------------------------
function attachSliderListeners() {
  const priceSlider = document.getElementById("kct-price-slider");
  const investorMultSlider = document.getElementById("investor-multiplier-slider");
  const treasuryMultSlider = document.getElementById("treasury-multiplier-slider");

  if (priceSlider) {
    priceSlider.addEventListener("input", recomputeFromSliders);
  }
  if (investorMultSlider) {
    investorMultSlider.addEventListener("input", recomputeFromSliders);
  }
  if (treasuryMultSlider) {
    treasuryMultSlider.addEventListener("input", recomputeFromSliders);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  attachSliderListeners();
  refreshDashboard();
  // regelmäßiges Refresh (z.B. alle 8 Sekunden)
  setInterval(refreshDashboard, 8000);
});
