// ==============================
// KASCompute Testnet Dashboard
// ==============================

const API_BASE = "/api";

// ---------- Helper ----------

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

// ================= Emission / Economics =================

let emissionState = null;
let baseEconomics = null;

// Currency-State
let currentCurrency = "USD";
let econLastPriceUsd = null;
let econLastMarketCapUsd = null;
let econLastInvestorUsd = null;
let econLastTreasuryUsd = null;

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

  const fxEur = 0.92; // grober Kurs
  let symbol = "$";
  let fx = 1;

  if (currentCurrency === "EUR") {
    symbol = "€";
    fx = fxEur;
  }

  if (currentCurrency === "KCT") {
    // alles in Token anzeigen
    const price = 1.0;
    const capTokens = baseEconomics.circulating_supply_kct ?? 0;
    const investorTokens =
      econLastPriceUsd > 0
        ? econLastInvestorUsd / econLastPriceUsd
        : 0;
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

  setText(
    "kct-price",
    symbol + price.toFixed(4)
  );
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
  setText("remaining-supply", formatNumber(emissionState.remaining_supply_kct));
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
    });
  }

  function computeRewardSummary() {
    if (!emissionState) {
      if (summaryBox)
        summaryBox.textContent =
          "Emission state not loaded from backend yet.";
      return;
    }

    const m = parseInt(monthSlider ? monthSlider.value : "12", 10) || 12;
    const r0 = emissionState.current_block_reward_kct || 200.0;
    const decay = (emissionState.monthly_decay_pct || 1.0) / 100.0;
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

let investorChartInstance = null;

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
  const presetConservative = document.getElementById("inv-preset-conservative");
  const presetBalanced = document.getElementById("inv-preset-balanced");
  const presetAggressive = document.getElementById("inv-preset-aggressive");

  if (investorSlider && investorLabel) {
    investorSlider.addEventListener("input", () => {
      investorLabel.textContent = parseFloat(investorSlider.value).toFixed(2);
    });
  }
  if (yearsSlider && yearsLabel) {
    yearsSlider.addEventListener("input", () => {
      yearsLabel.textContent = yearsSlider.value;
    });
  }
  if (growthSlider && growthLabel) {
    growthSlider.addEventListener("input", () => {
      growthLabel.textContent = parseFloat(growthSlider.value).toFixed(2);
    });
  }
  if (discountSlider && discountLabel) {
    discountSlider.addEventListener("input", () => {
      discountLabel.textContent = parseFloat(discountSlider.value).toFixed(2);
    });
  }

  function applyPreset(type) {
    if (!feeInput || !investorSlider || !growthSlider || !discountSlider)
      return;
    switch (type) {
      case "conservative":
        feeInput.value = "100000";
        investorSlider.value = "0.3";
        growthSlider.value = "0.05";
        discountSlider.value = "0.12";
        break;
      case "balanced":
        feeInput.value = "200000";
        investorSlider.value = "0.5";
        growthSlider.value = "0.1";
        discountSlider.value = "0.15";
        break;
      case "aggressive":
        feeInput.value = "500000";
        investorSlider.value = "0.7";
        growthSlider.value = "0.2";
        discountSlider.value = "0.2";
        break;
    }
    investorSlider.dispatchEvent(new Event("input"));
    growthSlider.dispatchEvent(new Event("input"));
    discountSlider.dispatchEvent(new Event("input"));
  }

  if (presetConservative) {
    presetConservative.addEventListener("click", () =>
      applyPreset("conservative")
    );
  }
  if (presetBalanced) {
    presetBalanced.addEventListener("click", () =>
      applyPreset("balanced")
    );
  }
  if (presetAggressive) {
    presetAggressive.addEventListener("click", () =>
      applyPreset("aggressive")
    );
  }

  function simulateInvestor() {
    if (
      !feeInput ||
      !investorSlider ||
      !yearsSlider ||
      !growthSlider ||
      !discountSlider
    )
      return;
    if (!summaryBox || !jsonBox) return;

    const feeYear = parseFloat(feeInput.value || "0");
    const investorShare = parseFloat(investorSlider.value || "0");
    const years = parseInt(yearsSlider.value || "0", 10);
    const growth = parseFloat(growthSlider.value || "0");
    const discount = parseFloat(discountSlider.value || "0");

    if (!feeYear || !years || investorShare <= 0) {
      summaryBox.textContent = "Set fee, investor share and years.";
      return;
    }

    const k0 = feeYear * investorShare;
    const g = growth;
    const d = discount;

    const cashflows = [];
    let npv = 0;
    for (let t = 1; t <= years; t++) {
      const cf = k0 * Math.pow(1 + g, t - 1);
      cashflows.push(cf);
      const discountFactor = Math.pow(1 + d, t);
      npv += cf / discountFactor;
    }

    const totalCash = cashflows.reduce((a, b) => a + b, 0);

    const result = {
      yearly_fee_total: feeYear,
      investor_share: investorShare,
      years,
      growth,
      discount,
      total_cashflow_kct: totalCash,
      npv_kct: npv,
      yearly_cashflows: cashflows,
    };

    summaryBox.textContent =
      `Total cashflow (undiscounted): ${totalCash.toFixed(2)} KCT\n` +
      `NPV (discounted): ${npv.toFixed(2)} KCT\n` +
      `Years: ${years}, Share: ${(investorShare * 100).toFixed(
        1
      )} %, ` +
      `Growth: ${(growth * 100).toFixed(
        1
      )} %, Discount: ${(discount * 100).toFixed(1)} %`;

    jsonBox.textContent = JSON.stringify(result, null, 2);

    const canvas = document.getElementById("investorChart");
    if (canvas && window.Chart) {
      const ctx = canvas.getContext("2d");
      const labels = cashflows.map((_, i) => `Year ${i + 1}`);
      const data = {
        labels,
        datasets: [
          {
            label: "Investor cashflow (KCT/year)",
            data: cashflows,
            tension: 0.35,
            fill: false,
          },
        ],
      };
      const options = {
        plugins: { legend: { display: true } },
        scales: {
          x: { display: true, grid: { display: false } },
          y: { display: true, beginAtZero: true },
        },
      };

      if (!investorChartInstance) {
        investorChartInstance = new Chart(ctx, {
  type: "line",
  data,
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index"
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.75)",
        titleColor: "#00e3c0",
        bodyColor: "#eaf4ff",
        borderColor: "rgba(0,227,192,0.4)",
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `${formatNumber(ctx.parsed.y)} KCT/year`
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: "rgba(180,200,255,0.7)",
          font: { size: 11 }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(120,150,220,0.15)",
          lineWidth: 1
        },
        ticks: {
          color: "rgba(200,220,255,0.85)",
          font: { size: 11 },
          callback: (value) => formatNumber(value)
        }
      }
    },
    animations: {
      tension: {
        duration: 900,
        easing: "easeInOutQuart",
        from: 0.2,
        to: 0.6,
        loop: false
      }
    },
    elements: {
      line: {
        borderWidth: 2.6,
        borderColor: "#00e3c0",
        backgroundColor: gradient,
        tension: 0.33
      },
      point: {
        radius: 0,
        hoverRadius: 5,
        hoverBackgroundColor: "#00e3c0",
        hoverBorderColor: "#00e3c0"
      }
    }
  }
});


// ================= Treasury Vesting =================

let treasuryChartInstance = null;

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
    });
  }
  if (cliffSlider && cliffLabel) {
    cliffSlider.addEventListener("input", () => {
      cliffLabel.textContent = cliffSlider.value;
    });
  }

  if (btnPreset && totalInput && yearsSlider && cliffSlider) {
    btnPreset.addEventListener("click", () => {
      totalInput.value = "1000000000";
      yearsSlider.value = "14";
      yearsSlider.dispatchEvent(new Event("input"));
      cliffSlider.value = "0";
      cliffSlider.dispatchEvent(new Event("input"));
    });
  }

  function simulateTreasury() {
    if (!totalInput || !yearsSlider || !cliffSlider || !summaryBox) return;

    const total = parseFloat(totalInput.value || "0");
    const years = parseInt(yearsSlider.value || "0", 10);
    const cliffMonths = parseInt(cliffSlider.value || "0", 10);

    if (!total || !years) {
      summaryBox.textContent =
        "Set total treasury and vesting duration.";
      return;
    }

    const monthsTotal = years * 12;
    const monthsVesting = Math.max(0, monthsTotal - cliffMonths);
    if (monthsVesting <= 0) {
      summaryBox.textContent =
        "Cliff is equal or longer than vesting period.";
      return;
    }

    const monthlyRelease = total / monthsVesting;

    const months = [];
    const released = [];
    const cumulative = [];

    let cum = 0;
    for (let m = 0; m < monthsTotal; m++) {
      months.push(m + 1);
      let rel = 0;
      if (m >= cliffMonths && cum < total) {
        rel = monthlyRelease;
        cum += rel;
        if (cum > total) {
          rel -= cum - total;
          cum = total;
        }
      }
      released.push(rel);
      cumulative.push(cum);
    }

    summaryBox.textContent =
      `Total Treasury: ${formatNumber(total)} KCT\n` +
      `Duration: ${years} years (${monthsTotal} months)\n` +
      `Cliff: ${cliffMonths} months\n` +
      `Monthly release after cliff: ${monthlyRelease.toFixed(2)} KCT`;

    const canvas = document.getElementById("treasuryChart");
    if (canvas && window.Chart) {
      const ctx = canvas.getContext("2d");
      const data = {
        labels: months.map((m) => `M${m}`),
        datasets: [
          {
            label: "Monthly release (KCT)",
            data: released,
            tension: 0.25,
            fill: false,
          },
          {
            label: "Cumulative vested (KCT)",
            data: cumulative,
            tension: 0.25,
            fill: false,
          },
        ],
      };
      const options = {
        plugins: { legend: { display: true } },
        scales: {
          x: { display: false },
          y: { display: true, beginAtZero: true },
        },
      };

      if (!treasuryChartInstance) {
        treasuryChartInstance = new Chart(ctx, {
  type: "line",
  data,
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index"
    },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          color: "rgba(215,230,255,0.95)",
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 8,
          boxHeight: 8
        }
      },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleColor: "#00e3c0",
        bodyColor: "#eaf4ff",
        borderColor: "rgba(0,227,192,0.4)",
        borderWidth: 1,
        callbacks: {
          label: (ctx) =>
            `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)} KCT`
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(120,150,220,0.15)"
        },
        ticks: {
          color: "rgba(200,220,255,0.85)",
          font: { size: 11 },
          callback: (value) => formatNumber(value)
        }
      }
    },
    animations: {
      tension: {
        duration: 1000,
        easing: "easeInOutQuart",
        from: 0.2,
        to: 0.5,
        loop: false
      }
    },
    elements: {
      line: {
        borderWidth: 2.4,
        tension: 0.25
      },
      point: {
        radius: 0,
        hoverRadius: 5,
        hoverBackgroundColor: "#fff"
      }
    }
  }
});


// ================= Active Nodes / Proofs / Leaderboard =================

function updateActiveNodesCard(activeNodes) {
  const countEl = document.getElementById("node-count");
  const listEl = document.getElementById("node-list");

  if (countEl) countEl.textContent = (activeNodes || []).length.toString();
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!activeNodes || activeNodes.length === 0) {
    const li = document.createElement("li");
    li.className = "node-empty";
    li.textContent = "Waiting for heartbeats…";
    listEl.appendChild(li);
    return;
  }

  activeNodes.forEach((n) => {
    const li = document.createElement("li");
    li.className = "node-item";
    const lastSeen = n.last_seen_unix
      ? new Date(n.last_seen_unix * 1000).toLocaleString()
      : "-";
    li.innerHTML = `
      <div class="node-id">${n.node_id}</div>
      <div class="node-meta">${n.compute_profile || "-"} • last seen ${lastSeen}</div>
    `;
    listEl.appendChild(li);
  });
}

function updateProofsFeed(proofs) {
  const tbody = document.getElementById("proofs-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!proofs || proofs.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "poc-empty-row";
    tr.innerHTML = `<td colspan="5">Waiting for proofs…</td>`;
    tbody.appendChild(tr);
    return;
  }

  proofs.slice(0, 100).forEach((p) => {
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

function updateNodeLeaderboard(proofs, activeNodes) {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!proofs || proofs.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "lb-empty-row";
    tr.innerHTML = `<td colspan="5">Waiting for node activity…</td>`;
    tbody.appendChild(tr);
    return;
  }

  const stats = new Map();
  proofs.forEach((p) => {
    const id = p.node_id ?? "unknown";
    const wu = p.work_units ?? 0;
    const reward = p.estimated_reward_kct ?? 0;

    if (!stats.has(id)) {
      stats.set(id, { nodeId: id, proofs: 0, workUnits: 0, rewards: 0 });
    }
    const s = stats.get(id);
    s.proofs += 1;
    s.workUnits += wu;
    s.rewards += reward;
  });

  const profileMap = new Map();
  (activeNodes || []).forEach((n) => {
    profileMap.set(n.node_id, n.compute_profile || "-");
  });

  const rows = Array.from(stats.values()).sort((a, b) => b.rewards - a.rewards);

  rows.slice(0, 10).forEach((s, idx) => {
    const tr = document.createElement("tr");
    const profile = profileMap.get(s.nodeId) || "-";
    const workReward =
      `${s.workUnits.toLocaleString()} / ${s.rewards.toFixed(4)} KCT`;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${s.nodeId}</td>
      <td>${profile}</td>
      <td>${s.proofs}</td>
      <td>${workReward}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= API / Header Badges =================

function applyEmissionAndEconomics(data) {
  emissionState = data.emission || null;
  const econ = data.economics || null;
  baseEconomics = econ;

  const nodesCount = (data.active_nodes || []).length;
  const proofsCount =
    data.proofs_total_count != null
      ? data.proofs_total_count
      : (data.proofs_recent || []).length;

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
    updateActiveNodesCard(data.active_nodes || []);
    updateProofsFeed(data.proofs_recent || []);
    updateNodeLeaderboard(data.proofs_recent || [], data.active_nodes || []);
  } catch (err) {
    console.error("Failed to refresh dashboard:", err);
    const apiEl = document.getElementById("api-status");
    if (apiEl) {
      apiEl.textContent = "API offline";
      apiEl.classList.remove("pill-active");
    }
  }
}

// ================= Global Listener (Sprache / Currency / Theme) =================

function attachGlobalListeners() {
  const btnRefreshNodes = document.getElementById("btn-refresh-nodes");
  if (btnRefreshNodes) {
    btnRefreshNodes.addEventListener("click", () => refreshDashboard());
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
    btnLangEn.addEventListener("click", () =>
      togglePillGroup("btn-lang-en", ["btn-lang-en", "btn-lang-de"])
    );
    btnLangDe.addEventListener("click", () =>
      togglePillGroup("btn-lang-de", ["btn-lang-en", "btn-lang-de"])
    );
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
    });
    btnCurEur.addEventListener("click", () => {
      currentCurrency = "EUR";
      togglePillGroup("btn-cur-eur", [
        "btn-cur-kct",
        "btn-cur-eur",
        "btn-cur-usd",
      ]);
      renderEconomicsOutputs();
    });
    btnCurUsd.addEventListener("click", () => {
      currentCurrency = "USD";
      togglePillGroup("btn-cur-usd", [
        "btn-cur-kct",
        "btn-cur-eur",
        "btn-cur-usd",
      ]);
      renderEconomicsOutputs();
    });
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const html = document.documentElement;
      const cur = html.getAttribute("data-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
    });
  }

  const priceSlider = document.getElementById("kct-price-slider");
  const invSlider = document.getElementById("investor-multiplier-slider");
  const treSlider = document.getElementById("treasury-multiplier-slider");
  if (priceSlider) priceSlider.addEventListener("input", recomputeFromSliders);
  if (invSlider) invSlider.addEventListener("input", recomputeFromSliders);
  if (treSlider) treSlider.addEventListener("input", recomputeFromSliders);
}

// ================= Init =================

document.addEventListener("DOMContentLoaded", () => {
  attachRewardUI();
  attachInvestorUI();
  attachTreasuryUI();
  attachGlobalListeners();
  refreshDashboard();
  setInterval(refreshDashboard, 8000);
});
