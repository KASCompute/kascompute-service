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
  return (
    "$" +
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// ============ Emission & Economics ============

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
  const treasuryVal =
    price * (baseEconomics.treasury_balance_kct ?? 0) * treMult;

  setText("market-cap", formatUsd(marketCap));
  setText("investor-value", formatUsd(investorVal));
  setText("treasury-value", formatUsd(treasuryVal));
}

// ============ Active Nodes ============

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

// ============ Proof-of-Compute (max 10 rows) ============

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

// ============ Node Leaderboard (aus Proofs) ============

function updateNodeLeaderboard(proofs) {
  const tbody = document.getElementById("node-leaderboard-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!Array.isArray(proofs) || proofs.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4">Waiting for node activity...</td>`;
    tbody.appendChild(tr);
    return;
  }

  const stats = new Map();

  proofs.forEach((p) => {
    const nodeId = p.node_id ?? "unknown";
    const wu = p.work_units ?? 0;
    const reward = p.estimated_reward_kct ?? 0;

    if (!stats.has(nodeId)) {
      stats.set(nodeId, { nodeId, proofs: 0, workUnits: 0, rewards: 0 });
    }
    const s = stats.get(nodeId);
    s.proofs += 1;
    s.workUnits += wu;
    s.rewards += reward;
  });

  const rows = Array.from(stats.values()).sort((a, b) => b.rewards - a.rewards);

  rows.slice(0, 10).forEach((s, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${s.nodeId}</td>
      <td>${s.proofs}</td>
      <td>${s.workUnits.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============ Reward / Investor / Treasury (client-side, kein HTTP) ============

// *** Diese IDs kannst du bei Bedarf anpassen – wenn sie nicht existieren, passiert einfach nix ***

function handleRewardCalculate() {
  try {
    const monthsInput = document.getElementById("reward-months-input");
    const hashrateInput = document.getElementById("reward-hashrate-input");
    const networkInput = document.getElementById("reward-network-hashrate-input");
    const errorEl = document.getElementById("reward-error-text");
    const resultEl = document.getElementById("reward-result-text");

    if (errorEl) errorEl.textContent = "";
    if (resultEl) resultEl.textContent = "";

    const months = monthsInput ? parseInt(monthsInput.value || "0", 10) : 0;
    const myHash = hashrateInput ? parseFloat(hashrateInput.value || "0") : 0;
    const netHash = networkInput ? parseFloat(networkInput.value || "0") : 0;

    if (!months || !myHash || !netHash || netHash <= 0) {
      if (errorEl) errorEl.textContent = "Please set months, your hashrate and network hashrate.";
      return;
    }

    const myShare = myHash / netHash;
    const blocksPerMinute = 1; // 1 block per minute
    const minutesPerMonth = 30 * 24 * 60;
    const rewardPerBlock = 200; // current block reward (vereinfacht)

    const totalBlocks = months * minutesPerMonth * blocksPerMinute;
    const totalReward = totalBlocks * rewardPerBlock * myShare;

    if (resultEl) {
      resultEl.textContent = `${totalReward.toFixed(2)} KCT (over ${months} months, approx.)`;
    }
  } catch (err) {
    console.error(err);
    const errorEl = document.getElementById("reward-error-text");
    if (errorEl) errorEl.textContent = "Error: " + err.message;
  }
}

function handleInvestorSimulate() {
  try {
    const investInput = document.getElementById("investor-amount-input");
    const holdMonthsInput = document.getElementById("investor-months-input");
    const errorEl = document.getElementById("investor-error-text");
    const resultEl = document.getElementById("investor-result-text");

    if (errorEl) errorEl.textContent = "";
    if (resultEl) resultEl.textContent = "";

    const invest = investInput ? parseFloat(investInput.value || "0") : 0;
    const months = holdMonthsInput ? parseInt(holdMonthsInput.value || "0", 10) : 0;

    if (!baseEconomics || !invest || !months) {
      if (errorEl) errorEl.textContent = "Please set investment and holding duration.";
      return;
    }

    const price = baseEconomics.kct_price_usd;
    const tokens = invest / price;

    const yearlyGrowth = 0.15; // 15%/Jahr nur als Beispiel
    const growthFactor = Math.pow(1 + yearlyGrowth, months / 12);
    const futureValue = tokens * price * growthFactor;

    if (resultEl) {
      resultEl.textContent = `Projected value: ${formatUsd(futureValue)} after ${months} months (assumed +15%/year).`;
    }
  } catch (err) {
    console.error(err);
    const errorEl = document.getElementById("investor-error-text");
    if (errorEl) errorEl.textContent = "Error: " + err.message;
  }
}

function handleTreasurySimulate() {
  try {
    const monthsInput = document.getElementById("treasury-months-input");
    const errorEl = document.getElementById("treasury-error-text");
    const resultEl = document.getElementById("treasury-result-text");

    if (errorEl) errorEl.textContent = "";
    if (resultEl) resultEl.textContent = "";

    const months = monthsInput ? parseInt(monthsInput.value || "0", 10) : 0;
    if (!baseEconomics || !months) {
      if (errorEl) errorEl.textContent = "Please set vesting duration.";
      return;
    }

    const totalTreasury = baseEconomics.treasury_balance_kct ?? 0;
    const monthlyRelease = totalTreasury / 168; // 14 Jahre = 168 Monate
    const released = Math.min(totalTreasury, months * monthlyRelease);
    const remaining = Math.max(0, totalTreasury - released);

    if (resultEl) {
      resultEl.textContent = `Released: ${formatNumber(released)} KCT, Remaining: ${formatNumber(remaining)} KCT`;
    }
  } catch (err) {
    console.error(err);
    const errorEl = document.getElementById("treasury-error-text");
    if (errorEl) errorEl.textContent = "Error: " + err.message;
  }
}

// ============ Main Refresh ============

async function refreshDashboard() {
  try {
    const data = await fetchJson("/state");
    updateEmissionCards(data.emission);
    updateEconomicsCards(data.economics);
    updateActiveNodesTable(data.active_nodes);
    updateProofsTable(data.proofs_recent);
    updateNodeLeaderboard(data.proofs_recent);
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

function attachButtonListeners() {
  const rewardBtn = document.getElementById("reward-calc-btn");
  const investorBtn = document.getElementById("investor-sim-btn");
  const treasuryBtn = document.getElementById("treasury-sim-btn");

  if (rewardBtn) rewardBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleRewardCalculate();
  });

  if (investorBtn) investorBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleInvestorSimulate();
  });

  if (treasuryBtn) treasuryBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleTreasurySimulate();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  attachSliderListeners();
  attachButtonListeners();
  refreshDashboard();
  setInterval(refreshDashboard, 8000);
});
