// ==============================
// KASCompute Testnet Dashboard
// ==============================

const API_BASE = "/api";

let emissionState = null;
let baseEconomics = null;
let currentCurrency = "USD";

let econLastPriceUsd = null;
let econLastMarketCapUsd = null;
let econLastInvestorUsd = null;
let econLastTreasuryUsd = null;

let investorChartInstance = null;
let treasuryChartInstance = null;

let userActive = false;

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

function applyLanguage(lang) {
  console.debug("applyLanguage:", lang);
}

function markUserActive() {
  userActive = true;
  setTimeout(() => {
    userActive = false;
  }, 15_000);
}

// ---- Hardware Profile Parsing (CPU/GPU only) ----

function parseHardwareProfile(obj) {
  const raw =
    obj?.hardware ||
    obj?.compute_profile ||
    obj?.profile ||
    obj?.compute ||
    "";

  const profile = typeof raw === "string" && raw.trim().length > 0 ? raw : "-";

  let type = "other";
  const s = profile.toLowerCase();

  if (s.startsWith("gpu") || s.includes("rtx") || s.includes("geforce") || s.includes("radeon")) {
    type = "gpu";
  } else if (s.startsWith("cpu") || s.includes("ryzen") || s.match(/\bi[3579]-\d+/)) {
    type = "cpu";
  }

  return { profile, type };
}

// ================= Emission / Economics =================

function renderEconomicsOutputs() {
  if (!baseEconomics) return;
  if (
    econLastPriceUsd == null ||
    econLastMarketCapUsd == null ||
    econLastInvestorUsd == null ||
    econLastTreasuryUsd == null
  ) {
    return;
  }

  const fxEur = 0.92;
  let symbol = "$";
  let fx = 1;

  if (currentCurrency === "EUR") {
    symbol = "€";
    fx = fxEur;
  }

  if (currentCurrency === "KCT") {
    const price = 1.0;
    const capTokens = baseEconomics.circulating_supply_kct ?? 0;
    const investorTokens =
      econLastPriceUsd > 0 ? econLastInvestorUsd / econLastPriceUsd : 0;
    const treasuryTokens = baseEconomics.treasury_balance_kct ?? 0;

    setText("kct-price", price.toFixed(4) + " KCT");
    setText("market-cap", formatNumber(capTokens) + " KCT");
    setText("investor-value", formatNumber(investorTokens) + " KCT");
    setText("treasury-value", formatNumber(treasuryTokens) + " KCT");
    return;
  }

  const price = econLastPriceUsd * fx;
  const mc = econLastMarketCapUsd * fx;
  const inv = econLastInvestorUsd * fx;
  const tre = econLastTreasuryUsd * fx;

  setText("kct-price", symbol + price.toFixed(4));
  setText(
    "market-cap",
    symbol +
      mc.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );
  setText(
    "investor-value",
    symbol +
      inv.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );
  setText(
    "treasury-value",
    symbol +
      tre.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  );
}

function updateEmissionCardsFromState() {
  if (!emissionState) return;
  setText("total-supply", formatNumber(emissionState.total_supply_kct));
  setText("mined-supply", formatNumber(emissionState.mined_supply_kct));
  setText(
    "remaining-supply",
    formatNumber(emissionState.remaining_supply_kct)
  );
  setText("emission-month", emissionState.emission_month ?? "-");
  setText(
    "block-reward",
    emissionState.current_block_reward_kct.toFixed(4) + " KCT"
  );
  setText(
    "monthly-decay",
    emissionState.monthly_decay_pct.toFixed(2) + " %"
  );
}

function updateEconomicsCards(ec) {
  if (!ec) return;
  baseEconomics = ec;

  const priceSlider = document.getElementById("kct-price-slider");
  const priceLabel = document.getElementById("kct-price-slider-value");
  const invSlider = document.getElementById("investor-multiplier-slider");
  const invLabel = document.getElementById("investor-multiplier-slider-value");
  const treSlider = document.getElementById("treasury-multiplier-slider");
  const treLabel = document.getElementById("treasury-multiplier-slider-value");

  if (priceSlider && priceLabel) {
    priceSlider.value = ec.kct_price_usd;
    priceLabel.textContent = ec.kct_price_usd.toFixed(4) + " $";
  }
  if (invSlider && invLabel) {
    invSlider.value = 1.0;
    invLabel.textContent = "x1.00";
  }
  if (treSlider && treLabel) {
    treSlider.value = 1.0;
    treLabel.textContent = "x1.00";
  }

  econLastPriceUsd = ec.kct_price_usd;
  econLastMarketCapUsd = ec.market_cap_usd;
  econLastInvestorUsd = ec.investor_value_usd;
  econLastTreasuryUsd = ec.treasury_value_usd;

  renderEconomicsOutputs();
}

function recomputeFromSliders() {
  if (!baseEconomics) return;
  markUserActive();

  const priceSlider = document.getElementById("kct-price-slider");
  const priceLabel = document.getElementById("kct-price-slider-value");
  const invSlider = document.getElementById("investor-multiplier-slider");
  const invLabel = document.getElementById("investor-multiplier-slider-value");
  const treSlider = document.getElementById("treasury-multiplier-slider");
  const treLabel = document.getElementById("treasury-multiplier-slider-value");

  let price = baseEconomics.kct_price_usd;
  let invMult = 1.0;
  let treMult = 1.0;

  if (priceSlider) {
    const v = parseFloat(priceSlider.value);
    if (!isNaN(v)) {
      price = v;
      if (priceLabel) priceLabel.textContent = v.toFixed(4) + " $";
    }
  }
  if (invSlider) {
    const v = parseFloat(invSlider.value);
    if (!isNaN(v)) {
      invMult = v;
      if (invLabel) invLabel.textContent = "x" + v.toFixed(2);
    }
  }
  if (treSlider) {
    const v = parseFloat(treSlider.value);
    if (!isNaN(v)) {
      treMult = v;
      if (treLabel) treLabel.textContent = "x" + v.toFixed(2);
    }
  }

  const baseSupply = baseEconomics.circulating_supply_kct ?? 0;
  const marketCap = price * baseSupply;
  const investorValue = marketCap * invMult;
  const treasuryValue =
    price * (baseEconomics.treasury_balance_kct ?? 0) * treMult;

  econLastPriceUsd = price;
  econLastMarketCapUsd = marketCap;
  econLastInvestorUsd = investorValue;
  econLastTreasuryUsd = treasuryValue;

  renderEconomicsOutputs();
}

// ================= Reward Preview =================

function attachRewardUI() {
  const monthSlider = document.getElementById("month");
  const monthLabel = document.getElementById("month-label");
  const btnReward = document.getElementById("btn-reward");
  const btnCopy = document.getElementById("btn-reward-copy");
  const btnJson = document.getElementById("btn-reward-json");
  const summaryBox = document.getElementById("reward-summary");
  const jsonBox = document.getElementById("reward-json");

  if (monthSlider && monthLabel) {
    monthSlider.addEventListener("input", () => {
      monthLabel.textContent = monthSlider.value;
      markUserActive();
    });
  }

  function computeRewardSummary() {
    const m = parseInt(monthSlider ? monthSlider.value : "12", 10) || 12;
    const r0 =
      (emissionState && emissionState.current_block_reward_kct) || 200.0;
    const decay =
      ((emissionState && emissionState.monthly_decay_pct) || 1.0) / 100.0;
    const factor = 1.0 - decay;
    const rewardThisMonth = r0 * Math.pow(factor, m - 1);

    const blocksPerMonth = 30 * 24 * 60;
    const monthlyEmission = rewardThisMonth * blocksPerMonth;

    const json = {
      month_index: m,
      block_reward_kct: rewardThisMonth,
      monthly_blocks: blocksPerMonth,
      monthly_emission_kct: monthlyEmission,
    };

    if (summaryBox) {
      summaryBox.textContent =
        `Month m = ${m}\n` +
        `Approx. block reward: ${rewardThisMonth.toFixed(4)} KCT\n` +
        `Blocks per month: ${blocksPerMonth.toLocaleString()}\n` +
        `Emission this month: ${monthlyEmission.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })} KCT`;
    }
    if (jsonBox) {
      jsonBox.textContent = JSON.stringify(json, null, 2);
    }
  }

  if (btnReward && summaryBox) {
    btnReward.addEventListener("click", (e) => {
      e.preventDefault();
      markUserActive();
      computeRewardSummary();
    });
  }

  if (btnCopy && summaryBox) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(summaryBox.textContent || "");
      } catch (e) {
        console.error("Clipboard error:", e);
      }
    });
  }

  if (btnJson && jsonBox) {
    btnJson.addEventListener("click", () => {
      if (jsonBox.style.display === "none") {
        jsonBox.style.display = "block";
        btnJson.textContent = "Hide raw JSON";
      } else {
        jsonBox.style.display = "none";
        btnJson.textContent = "Show raw JSON";
      }
    });
  }
}

// ================= Investor Value Flow =================

function attachInvestorUI() {
  const feeInput = document.getElementById("fee");
  const investorSlider = document.getElementById("investor");
  const investorLabel = document.getElementById("investor-label");
  const yearsSlider = document.getElementById("years");
  const yearsLabel = document.getElementById("years-label");
  const growthSlider = document.getElementById("growth");
  const growthLabel = document.getElementById("growth-label");
  const discountSlider = document.getElementById("discount");
  const discountLabel = document.getElementById("discount-label");
  const btnSim = document.getElementById("btn-investor");
  const summaryBox = document.getElementById("investor-summary");
  const btnCopy = document.getElementById("btn-investor-copy");
  const btnJson = document.getElementById("btn-investor-json");
  const jsonBox = document.getElementById("investor-json");

  if (investorSlider && investorLabel) {
    investorSlider.addEventListener("input", () => {
      investorLabel.textContent = parseFloat(investorSlider.value).toFixed(2);
      markUserActive();
    });
  }
  if (yearsSlider && yearsLabel) {
    yearsSlider.addEventListener("input", () => {
      yearsLabel.textContent = yearsSlider.value;
      markUserActive();
    });
  }
  if (growthSlider && growthLabel) {
    growthSlider.addEventListener("input", () => {
      growthLabel.textContent = parseFloat(growthSlider.value).toFixed(2);
      markUserActive();
    });
  }
  if (discountSlider && discountLabel) {
    discountSlider.addEventListener("input", () => {
      discountLabel.textContent = parseFloat(
        discountSlider.value
      ).toFixed(2);
      markUserActive();
    });
  }

  const btnCons = document.getElementById("inv-preset-conservative");
  const btnBal = document.getElementById("inv-preset-balanced");
  const btnAgg = document.getElementById("inv-preset-aggressive");

  function applyInvestorPreset(fee, share, years, growth, discount) {
    feeInput.value = fee.toString();
    investorSlider.value = share.toString();
    yearsSlider.value = years.toString();
    growthSlider.value = growth.toString();
    discountSlider.value = discount.toString();

    investorLabel.textContent = share.toFixed(2);
    yearsLabel.textContent = years.toString();
    growthLabel.textContent = growth.toFixed(2);
    discountLabel.textContent = discount.toFixed(2);

    markUserActive();
  }

  btnCons?.addEventListener("click", () => {
    applyInvestorPreset(0.5, 0.20, 10, 0.01, 0.10);
  });

  btnBal?.addEventListener("click", () => {
    applyInvestorPreset(1.0, 0.30, 10, 0.03, 0.08);
  });

  btnAgg?.addEventListener("click", () => {
    applyInvestorPreset(2.0, 0.50, 15, 0.07, 0.05);
  });


  function simulateInvestor() {
    const feeYear = parseFloat(feeInput?.value || "0");
    const investorShare = parseFloat(investorSlider?.value || "0");
    const years = parseInt(yearsSlider?.value || "0", 10);
    const growth = parseFloat(growthSlider?.value || "0");
    const discount = parseFloat(discountSlider?.value || "0");

    if (!feeYear || !years || investorShare <= 0) {
      if (summaryBox)
        summaryBox.textContent = "Set fee, investor share and years.";
      if (jsonBox) jsonBox.textContent = "";
      if (investorChartInstance) {
        investorChartInstance.destroy();
        investorChartInstance = null;
      }
      return;
    }

    const cashflows = [];
    let npv = 0;
    const k0 = feeYear * investorShare;

    for (let t = 1; t <= years; t++) {
      const cf = k0 * Math.pow(1 + growth, t - 1);
      cashflows.push(cf);
      npv += cf / Math.pow(1 + discount, t);
    }

    const totalCash = cashflows.reduce((a, b) => a + b, 0);

    if (summaryBox) {
      summaryBox.textContent =
        `Total cashflow (undiscounted): ${totalCash.toFixed(2)} KCT\n` +
        `NPV (discounted): ${npv.toFixed(2)} KCT\n` +
        `Years: ${years}, Share: ${(investorShare * 100).toFixed(
          1
        )} %, ` +
        `Growth: ${(growth * 100).toFixed(
          1
        )} %, Discount: ${(discount * 100).toFixed(1)} %`;
    }

    if (jsonBox) {
      jsonBox.textContent = JSON.stringify(
        {
          yearly_fee_total: feeYear,
          investor_share: investorShare,
          years,
          growth,
          discount,
          cashflows,
          total_cash_undiscounted: totalCash,
          npv_discounted: npv,
        },
        null,
        2
      );
    }

    const canvas = document.getElementById("investorChart");
    if (!canvas || !window.Chart) return;

    const ctx = canvas.getContext("2d");
    const labels = cashflows.map((_, i) => `Year ${i + 1}`);

    const data = {
      labels,
      datasets: [
        {
          label: "Investor cashflow (KCT/year)",
          data: cashflows,
          borderColor: "#00e3c0",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
          fill: false,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(120,150,220,0.12)" },
        },
      },
    };

    if (investorChartInstance) investorChartInstance.destroy();
    investorChartInstance = new Chart(ctx, { type: "line", data, options });
  }

  if (btnSim) {
    btnSim.addEventListener("click", (e) => {
      e.preventDefault();
      markUserActive();
      simulateInvestor();
    });
  }

  if (btnCopy && summaryBox) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(summaryBox.textContent || "");
      } catch (e) {
        console.error("Clipboard error:", e);
      }
    });
  }

  if (btnJson && jsonBox) {
    btnJson.addEventListener("click", () => {
      if (jsonBox.style.display === "none") {
        jsonBox.style.display = "block";
        btnJson.textContent = "Hide raw JSON";
      } else {
        jsonBox.style.display = "none";
        btnJson.textContent = "Show raw JSON";
      }
    });
  }
}

// ================= Treasury Vesting =================

function attachTreasuryUI() {
  const totalInput = document.getElementById("treasury-total");
  const yearsSlider = document.getElementById("treasury-years");
  const yearsLabel = document.getElementById("treasury-years-label");
  const cliffSlider = document.getElementById("treasury-cliff");
  const cliffLabel = document.getElementById("treasury-cliff-label");
  const btnPreset = document.getElementById("btn-treasury-preset");
  const btnSim = document.getElementById("btn-treasury");
  const summaryBox = document.getElementById("treasury-summary");
  const btnCopy = document.getElementById("btn-treasury-copy");

  if (yearsSlider && yearsLabel) {
    yearsSlider.addEventListener("input", () => {
      yearsLabel.textContent = yearsSlider.value;
      markUserActive();
    });
  }
  if (cliffSlider && cliffLabel) {
    cliffSlider.addEventListener("input", () => {
      cliffLabel.textContent = cliffSlider.value;
      markUserActive();
    });
  }

  if (btnPreset && totalInput && yearsSlider && cliffSlider) {
    btnPreset.addEventListener("click", () => {
      totalInput.value = "1000000000";
      yearsSlider.value = "14";
      cliffSlider.value = "0";

      yearsLabel.textContent = "14";
      cliffLabel.textContent = "0";

      markUserActive();
    });
  }

  function simulateTreasury() {
    const total = parseFloat(totalInput?.value || "0");
    const years = parseInt(yearsSlider?.value || "0", 10);
    const cliffMonths = parseInt(cliffSlider?.value || "0", 10);

    if (!total || !years) {
      if (summaryBox)
        summaryBox.textContent = "Set total treasury and vesting duration.";
      return;
    }

    const monthsTotal = years * 12;
    const monthsVesting = Math.max(0, monthsTotal - cliffMonths);
    const monthlyRelease = monthsVesting > 0 ? total / monthsVesting : 0;

    const months = [];
    const released = [];
    const cumulative = [];

    let cum = 0;
    for (let m = 1; m <= monthsTotal; m++) {
      months.push(m);
      let rel = 0;
      if (m > cliffMonths && monthsVesting > 0) {
        rel = monthlyRelease;
        cum = Math.min(total, cum + rel);
        if (cum === total) {
          rel = Math.max(0, rel - (cum - total));
        }
      }
      released.push(rel);
      cumulative.push(cum);
    }

    if (summaryBox) {
      summaryBox.textContent =
        `Total Treasury: ${total.toLocaleString()} KCT\n` +
        `Duration: ${years} years (${monthsTotal} months)\n` +
        `Cliff: ${cliffMonths} months\n` +
        `Monthly release after cliff: ${monthlyRelease.toFixed(2)} KCT`;
    }

    const canvas = document.getElementById("treasuryChart");
    if (!canvas || !window.Chart) return;

    const ctx = canvas.getContext("2d");

    const data = {
      labels: months.map((m) => `M${m}`),
      datasets: [
        {
          label: "Monthly release (KCT)",
          data: released,
          borderColor: "#00e3c0",
          borderWidth: 2,
          tension: 0.28,
          pointRadius: 0,
          fill: false,
        },
        {
          label: "Cumulative vested (KCT)",
          data: cumulative,
          borderColor: "#f43f5e",
          borderWidth: 2,
          tension: 0.18,
          pointRadius: 0,
          fill: false,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "bottom" },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(120,150,220,0.12)" },
        },
      },
    };

    if (treasuryChartInstance) treasuryChartInstance.destroy();
    treasuryChartInstance = new Chart(ctx, { type: "line", data, options });
  }

  if (btnSim) {
    btnSim.addEventListener("click", (e) => {
      e.preventDefault();
      markUserActive();
      simulateTreasury();
    });
  }

  if (btnCopy && summaryBox) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(summaryBox.textContent || "");
      } catch (e) {
        console.error("Clipboard error:", e);
      }
    });
  }
}

// ================= Active Nodes / Proofs / Leaderboard / Network KPIs =================

function updateActiveNodesCard(nodes) {
  const countEl = document.getElementById("node-count");
  const listEl = document.getElementById("node-list");

  const arr = nodes || [];
  if (countEl) countEl.textContent = arr.length.toString();
  if (!listEl) return;

  listEl.innerHTML = "";

  if (arr.length === 0) {
    const li = document.createElement("li");
    li.className = "node-empty";
    li.textContent = "Waiting for heartbeats…";
    listEl.appendChild(li);
    return;
  }

  arr.forEach((n) => {
    const li = document.createElement("li");
    li.className = "node-item";

    const ts =
      n.last_seen ??
      n.last_seen_unix ??
      n.timestamp_unix ??
      n.timestamp ??
      0;
    const lastSeen = ts ? new Date(ts * 1000).toLocaleString() : "-";

    const { profile, type } = parseHardwareProfile(n);
    let pillHtml = "";
    if (type === "gpu") {
      pillHtml = `<span class="lb-gpu-pill">GPU</span>`;
    } else if (type === "cpu") {
      pillHtml = `<span class="lb-cpu-pill">CPU</span>`;
    }

    li.innerHTML = `
      <div class="node-id">${n.node_id}</div>
      <div class="node-meta">
        ${pillHtml}
        <span>${profile}</span>
        <span>• last seen ${lastSeen}</span>
      </div>
    `;
    listEl.appendChild(li);
  });
}

function updateProofsFeed(proofs) {
  const tbody = document.getElementById("proofs-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const arr = proofs || [];
  if (arr.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "poc-empty-row";
    tr.innerHTML = `<td colspan="5">Waiting for proofs…</td>`;
    tbody.appendChild(tr);
    return;
  }

  let limit = 50;
  const limitEl = document.getElementById("proof-limit");
  if (limitEl) {
    const v = parseInt(limitEl.value, 10);
    if (!isNaN(v)) limit = v;
  }

  arr.slice(0, limit).forEach((p) => {
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

function updateNodeLeaderboard(proofs, nodes) {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const arr = proofs || [];
  if (arr.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "lb-empty-row";
    tr.innerHTML = `<td colspan="5">Waiting for node activity…</td>`;
    tbody.appendChild(tr);
    return;
  }

  const stats = new Map();
  arr.forEach((p) => {
    const id = p.node_id ?? "unknown";
    const wu = p.work_units ?? 0;
    const reward = p.estimated_reward_kct ?? 0;
    const ts = p.timestamp_unix ?? p.timestamp ?? 0;
    if (!stats.has(id)) {
      stats.set(id, {
        nodeId: id,
        proofs: 0,
        workUnits: 0,
        rewards: 0,
        firstTs: ts || null,
        lastTs: ts || null,
      });
    }
    const s = stats.get(id);
    s.proofs += 1;
    s.workUnits += wu;
    s.rewards += reward;
    if (ts) {
      if (s.firstTs === null || ts < s.firstTs) s.firstTs = ts;
      if (s.lastTs === null || ts > s.lastTs) s.lastTs = ts;
    }
  });

  const profileMap = new Map();
  (nodes || []).forEach((n) => {
    profileMap.set(n.node_id, parseHardwareProfile(n));
  });

  const rows = Array.from(stats.values()).sort((a, b) => b.rewards - a.rewards);

  let limit = 10;
  const limitEl = document.getElementById("lb-limit");
  if (limitEl) {
    const v = parseInt(limitEl.value, 10);
    if (!isNaN(v)) limit = v;
  }

  rows.slice(0, limit).forEach((s, idx) => {
    const profData = profileMap.get(s.nodeId) || { profile: "-", type: "other" };

    let pillHtml = "";
    if (profData.type === "gpu") {
      pillHtml = `<span class="lb-gpu-pill">GPU</span>`;
    } else if (profData.type === "cpu") {
      pillHtml = `<span class="lb-cpu-pill">CPU</span>`;
    }

    const profileHtml = `
      <div class="lb-profile">
        ${pillHtml}
        <span>${profData.profile}</span>
      </div>
    `;

    const workReward =
      `${s.workUnits.toLocaleString()} / ${s.rewards.toFixed(4)} KCT`;

    const tr = document.createElement("tr");
    tr.className = "leaderboard-row";
    tr.innerHTML = `
      <td class="lb-rank">${idx + 1}</td>
      <td class="lb-node-id">${s.nodeId}</td>
      <td>${profileHtml}</td>
      <td class="lb-proofs">${s.proofs}</td>
      <td class="lb-meta">${workReward}</td>
    `;
    tbody.appendChild(tr);
  });

  // Node Spotlight nutzen dieselben Stats
  updateNodeSpotlightFromStats(rows, profileMap);
}

function updateNetworkOverview(nodes, proofs) {
  const nodeArr = nodes || [];
  const proofArr = proofs || [];

  let cpu = 0;
  let gpu = 0;
  nodeArr.forEach((n) => {
    const { type } = parseHardwareProfile(n);
    if (type === "cpu") cpu++;
    else if (type === "gpu") gpu++;
  });

  let totalWork = 0;
  let totalReward = 0;
  proofArr.forEach((p) => {
    totalWork += p.work_units ?? 0;
    totalReward += p.estimated_reward_kct ?? 0;
  });

  setText("net-nodes-total", nodeArr.length.toString());
  setText("net-nodes-cpu", cpu.toString());
  setText("net-nodes-gpu", gpu.toString());
  setText("net-proofs-total", formatNumber(proofArr.length));
  setText("net-workunits-total", formatNumber(totalWork));
  setText(
    "net-reward-total",
    totalReward.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    }) + " KCT"
  );
}

// ===== Recent Jobs (aus Proofs) =====

function updateJobsTable(proofs) {
  const tbody = document.getElementById("jobs-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const arr = proofs || [];
  if (arr.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "poc-empty-row";
    tr.innerHTML = `<td colspan="4">Waiting for proofs…</td>`;
    tbody.appendChild(tr);
    return;
  }

  const jobMap = new Map();
  arr.forEach((p) => {
    const jobId = p.job_id || "unknown";
    const nodeId = p.node_id || "unknown";
    const wu = p.work_units ?? 0;
    const ts = p.timestamp_unix ?? p.timestamp ?? 0;

    if (!jobMap.has(jobId)) {
      jobMap.set(jobId, {
        jobId,
        nodes: new Set(),
        proofs: 0,
        workUnits: 0,
        lastTs: ts || 0,
      });
    }
    const j = jobMap.get(jobId);
    j.nodes.add(nodeId);
    j.proofs += 1;
    j.workUnits += wu;
    if (ts && ts > j.lastTs) j.lastTs = ts;
  });

  const rows = Array.from(jobMap.values()).sort((a, b) => b.lastTs - a.lastTs);

  rows.slice(0, 50).forEach((j) => {
    const shortId =
      j.jobId.length > 10 ? j.jobId.slice(0, 10) + "…" : j.jobId;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${shortId}</td>
      <td>${j.nodes.size}</td>
      <td>${j.proofs}</td>
      <td>${j.workUnits.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Node Spotlight (Top Node) =====

function updateNodeSpotlightFromStats(statsRows, profileMap) {
  const box = document.getElementById("node-spotlight-summary");
  if (!box) return;

  if (!statsRows || statsRows.length === 0) {
    box.textContent = "Waiting for node activity…";
    return;
  }

  const top = statsRows[0];
  const profData = profileMap.get(top.nodeId) || { profile: "-", type: "other" };

  let typeLabel = "Other";
  if (profData.type === "cpu") typeLabel = "CPU";
  else if (profData.type === "gpu") typeLabel = "GPU";

  let proofsPerMin = 0;
  if (top.firstTs && top.lastTs && top.lastTs > top.firstTs) {
    const minutes = (top.lastTs - top.firstTs) / 60;
    proofsPerMin = top.proofs / minutes;
  }

  const firstStr = top.firstTs
    ? new Date(top.firstTs * 1000).toLocaleString()
    : "-";
  const lastStr = top.lastTs
    ? new Date(top.lastTs * 1000).toLocaleString()
    : "-";

  box.textContent =
    `Node: ${top.nodeId}\n` +
    `Profile: ${profData.profile} (${typeLabel})\n\n` +
    `Total proofs: ${top.proofs.toLocaleString()}\n` +
    `Total work units: ${top.workUnits.toLocaleString()}\n` +
    `Total rewards: ${top.rewards.toFixed(4)} KCT\n` +
    `Proofs per minute (approx): ${proofsPerMin.toFixed(2)}\n\n` +
    `First proof: ${firstStr}\n` +
    `Last proof:  ${lastStr}`;
}

// ================= API / Header Badges =================

function applyEmissionAndEconomics(data) {
  emissionState = data.emission || emissionState;
  const econ = data.economics || data.econ || null;
  if (econ) baseEconomics = econ;

  const nodesCount =
    (data.nodes ||
      data.active_nodes ||
      data.node_states ||
      data.node_list ||
      []).length;
  const proofsCount =
    (data.proofs ||
      data.proofs_recent ||
      data.recent_proofs ||
      data.proof_list ||
      []).length;

  setText("stat-nodes", `Nodes: ${nodesCount}`);
  setText("stat-proofs", `Proofs: ${proofsCount}`);

  updateEmissionCardsFromState();
  if (econ) updateEconomicsCards(econ);
}

async function refreshDashboard() {
  try {
    const apiEl = document.getElementById("api-status");
    if (apiEl) {
      apiEl.textContent = "Checking API…";
      apiEl.classList.remove("pill-active");
    }

    const data = await fetchJson("/state");

    if (apiEl) {
      apiEl.textContent = "API online";
      apiEl.classList.add("pill-active");
    }

    applyEmissionAndEconomics(data);

    const nodes =
      data.nodes ||
      data.active_nodes ||
      data.node_states ||
      data.node_list ||
      [];
    const proofs =
      data.proofs ||
      data.proofs_recent ||
      data.recent_proofs ||
      data.proof_list ||
      [];

    updateActiveNodesCard(nodes);
    updateProofsFeed(proofs);
    updateNodeLeaderboard(proofs, nodes);
    updateNetworkOverview(nodes, proofs);
    updateJobsTable(proofs);
  } catch (err) {
    console.error("Failed to refresh dashboard:", err);
    const apiEl = document.getElementById("api-status");
    if (apiEl) {
      apiEl.textContent = "API offline";
      apiEl.classList.remove("pill-active");
    }
  }
}

// ================= Global Listener (Language / Currency / Theme / Download) =================

async function downloadStateJson() {
  try {
    markUserActive();
    const data = await fetchJson("/state");
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kascompute-state.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("downloadStateJson failed:", e);
  }
}

function attachGlobalListeners() {
  const btnRefreshNodes = document.getElementById("btn-refresh-nodes");
  if (btnRefreshNodes) {
    btnRefreshNodes.addEventListener("click", () => {
      markUserActive();
      refreshDashboard();
    });
  }

  const proofLimit = document.getElementById("proof-limit");
  const proofLimitLabel = document.getElementById("proof-limit-label");
  if (proofLimit) {
    if (proofLimitLabel) proofLimitLabel.textContent = proofLimit.value;
    proofLimit.addEventListener("input", () => {
      markUserActive();
      if (proofLimitLabel) proofLimitLabel.textContent = proofLimit.value;
      refreshDashboard();
    });
  }

  const lbLimit = document.getElementById("lb-limit");
  const lbLimitLabel = document.getElementById("lb-limit-label");
  if (lbLimit) {
    if (lbLimitLabel) lbLimitLabel.textContent = lbLimit.value;
    lbLimit.addEventListener("input", () => {
      markUserActive();
      if (lbLimitLabel) lbLimitLabel.textContent = lbLimit.value;
      refreshDashboard();
    });
  }

  const btnDownloadState = document.getElementById("btn-download-state");
  if (btnDownloadState) {
    btnDownloadState.addEventListener("click", (e) => {
      e.preventDefault();
      downloadStateJson();
    });
  }

  function togglePillGroup(activeId, ids) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === activeId) el.classList.add("pill-active");
      else el.classList.remove("pill-active");
    });
  }

  const btnLangEn = document.getElementById("btn-lang-en");
  const btnLangDe = document.getElementById("btn-lang-de");
  if (btnLangEn && btnLangDe) {
    btnLangEn.addEventListener("click", () => {
      togglePillGroup("btn-lang-en", ["btn-lang-en", "btn-lang-de"]);
      applyLanguage("en");
      markUserActive();
    });
    btnLangDe.addEventListener("click", () => {
      togglePillGroup("btn-lang-de", ["btn-lang-en", "btn-lang-de"]);
      applyLanguage("de");
      markUserActive();
    });
  }

  const btnCurKct = document.getElementById("btn-cur-kct");
  const btnCurEur = document.getElementById("btn-cur-eur");
  const btnCurUsd = document.getElementById("btn-cur-usd");
  if (btnCurKct && btnCurEur && btnCurUsd) {
    btnCurKct.addEventListener("click", () => {
      currentCurrency = "KCT";
      togglePillGroup("btn-cur-kct", [
        "btn-cur-kct",
        "btn-cur-eur",
        "btn-cur-usd",
      ]);
      renderEconomicsOutputs();
      markUserActive();
    });
    btnCurEur.addEventListener("click", () => {
      currentCurrency = "EUR";
      togglePillGroup("btn-cur-eur", [
        "btn-cur-kct",
        "btn-cur-eur",
        "btn-cur-usd",
      ]);
      renderEconomicsOutputs();
      markUserActive();
    });
    btnCurUsd.addEventListener("click", () => {
      currentCurrency = "USD";
      togglePillGroup("btn-cur-usd", [
        "btn-cur-kct",
        "btn-cur-eur",
        "btn-cur-usd",
      ]);
      renderEconomicsOutputs();
      markUserActive();
    });
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const html = document.documentElement;
      const cur = html.getAttribute("data-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      markUserActive();
    });
  }

  const priceSlider = document.getElementById("kct-price-slider");
  const invSlider = document.getElementById("investor-multiplier-slider");
  const treSlider = document.getElementById("treasury-multiplier-slider");
  if (priceSlider)
    priceSlider.addEventListener("input", () => {
      recomputeFromSliders();
    });
  if (invSlider)
    invSlider.addEventListener("input", () => {
      recomputeFromSliders();
    });
  if (treSlider)
    treSlider.addEventListener("input", () => {
      recomputeFromSliders();
    });
}

// ================= Init =================

document.addEventListener("DOMContentLoaded", () => {
  const apiStatusInit = document.getElementById("api-status");
  if (apiStatusInit) {
    apiStatusInit.textContent = "Checking API…";
  }

  applyLanguage("en");
  attachRewardUI();
  attachInvestorUI();
  attachTreasuryUI();
  attachGlobalListeners();
  refreshDashboard();

  setInterval(() => {
    if (!userActive) {
      refreshDashboard();
    }
  }, 8000);
});
