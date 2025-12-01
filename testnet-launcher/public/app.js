// ==============================
// KASCompute Testnet Dashboard
// ==============================

const API_BASE = "/api";

// ===== Auto-Refresh Control =====
let userActive = false;
let userActiveTimeout = null;

function markUserActive() {
  userActive = true;
  clearTimeout(userActiveTimeout);
  userActiveTimeout = setTimeout(() => {
    userActive = false;
  }, 10000); // 10 Sekunden Pause nach User-Input
}


// ---------- i18n (EN / DE) ----------

const translations = {
  en: {
    "header.title": "KASCompute Testnet Dashboard",
    "header.subtitle":
      "Emission, investor, treasury, active nodes, PoC & Node leaderboard tools — powered by your KCT model.",

    "card.reward.title": "Reward Preview",
    "card.reward.subtitle":
      "Block reward per month m based on your testnet emission model (KCT model parameters).",
    "card.reward.month": "Month (m):",
    "card.reward.button": "Calculate",

    "card.econ.title": "Token Economics",
    "card.econ.subtitle":
      "KCT price, market cap, investor and treasury value based on your live token model.",
    "card.econ.price": "KCT price",
    "card.econ.marketcap": "Market cap",
    "card.econ.investor": "Investor value",
    "card.econ.treasury": "Treasury value",
    "card.econ.slider.price": "Price (USD) slider",
    "card.econ.slider.inv": "Investor multiplier",
    "card.econ.slider.treasury": "Treasury multiplier",

    "card.investor.title": "Investor Value Flow",
    "card.investor.subtitle":
      "Post-mining cashflow simulation for potential investors KCT model parameters.",
    "card.investor.presets": "Presets:",
    "card.investor.preset.conservative": "Conservative",
    "card.investor.preset.balanced": "Balanced",
    "card.investor.preset.aggressive": "Aggressive",
    "card.investor.fee": "Fee / Year (KCT):",
    "card.investor.share": "Investor share:",
    "card.investor.years": "Years:",
    "card.investor.growth": "Growth:",
    "card.investor.discount": "Discount:",
    "card.investor.button": "Simulate",

    "card.treasury.title": "Treasury Vesting",
    "card.treasury.subtitle":
      "Simple linear vesting model for the KCT Treasury, aligned with your draft tokenomics.",
    "card.treasury.preset.label": "Quick setup:",
    "card.treasury.preset.button": "Whitepaper default",
    "card.treasury.total": "Total Treasury (KCT):",
    "card.treasury.years": "Vesting duration:",
    "card.treasury.cliff": "Cliff:",
    "card.treasury.button": "Simulate Treasury Vesting",

    "card.nodes.title": "Active Nodes",
    "card.nodes.subtitle": "Live list of nodes connected to the KASCompute testnet.",
    "card.nodes.online": "Online",
    "card.nodes.refresh": "Refresh",
    "card.nodes.empty": "Waiting for heartbeats…",

    "card.proofs.title": "Proof-of-Compute",
    "card.proofs.subtitle":
      "Live feed of validated Proof-of-Compute submissions from your nodes.",
    "card.proofs.th.node": "Node",
    "card.proofs.th.job": "Job",
    "card.proofs.th.work": "Work Units",
    "card.proofs.th.reward": "Reward ≈ KCT",
    "card.proofs.th.time": "Timestamp",
    "card.proofs.empty": "Waiting for proofs…",

    "card.lb.title": "Node Leaderboard",
    "card.lb.subtitle":
      "Ranked by submitted proofs and estimated KCT rewards. GPU nodes are highlighted.",
    "card.lb.th.node": "Node",
    "card.lb.th.profile": "Profile",
    "card.lb.th.proofs": "Proofs",
    "card.lb.th.workreward": "Work / Reward",
    "card.lb.empty": "Waiting for node activity…",

    "summary.title": "SUMMARY",
    "summary.copy": "Copy summary",
    "summary.toggle-json": "Show raw JSON",
  },
  de: {
    "header.title": "KASCompute Testnet Dashboard",
    "header.subtitle":
      "Emission, Investoren, Treasury, aktive Nodes, PoC & Node-Leaderboard – gesteuert von deinem KCT-Modell.",

    "card.reward.title": "Reward-Vorschau",
    "card.reward.subtitle":
      "Block-Reward pro Monat m auf Basis deines Testnet-Emissionsmodells (KCT-Parameter).",
    "card.reward.month": "Monat (m):",
    "card.reward.button": "Berechnen",

    "card.econ.title": "Token-Ökonomie",
    "card.econ.subtitle":
      "KCT-Preis, Marktkapitalisierung, Investoren- und Treasury-Wert auf Basis deines Live-Tokenmodells.",
    "card.econ.price": "KCT-Preis",
    "card.econ.marketcap": "Marktkapitalisierung",
    "card.econ.investor": "Investorenwert",
    "card.econ.treasury": "Treasury-Wert",
    "card.econ.slider.price": "Preis-Slider (USD)",
    "card.econ.slider.inv": "Investoren-Multiplikator",
    "card.econ.slider.treasury": "Treasury-Multiplikator",

    "card.investor.title": "Investor Cashflow",
    "card.investor.subtitle":
      "Post-Mining-Cashflow-Simulation für potenzielle Investoren basierend auf KCT.",
    "card.investor.presets": "Presets:",
    "card.investor.preset.conservative": "Konservativ",
    "card.investor.preset.balanced": "Ausgewogen",
    "card.investor.preset.aggressive": "Aggressiv",
    "card.investor.fee": "Gebühr / Jahr (KCT):",
    "card.investor.share": "Investorenanteil:",
    "card.investor.years": "Jahre:",
    "card.investor.growth": "Wachstum:",
    "card.investor.discount": "Diskontsatz:",
    "card.investor.button": "Simulieren",

    "card.treasury.title": "Treasury-Vesting",
    "card.treasury.subtitle":
      "Lineares Vesting-Modell für das KCT-Treasury, abgestimmt auf deine Tokenomics.",
    "card.treasury.preset.label": "Schnellstart:",
    "card.treasury.preset.button": "Whitepaper-Default",
    "card.treasury.total": "Gesamtes Treasury (KCT):",
    "card.treasury.years": "Vesting-Dauer:",
    "card.treasury.cliff": "Cliff:",
    "card.treasury.button": "Treasury-Vesting simulieren",

    "card.nodes.title": "Aktive Nodes",
    "card.nodes.subtitle": "Live-Liste der mit dem KASCompute-Testnet verbundenen Nodes.",
    "card.nodes.online": "Online",
    "card.nodes.refresh": "Aktualisieren",
    "card.nodes.empty": "Warte auf Heartbeats…",

    "card.proofs.title": "Proof-of-Compute",
    "card.proofs.subtitle":
      "Live-Feed der validierten Proof-of-Compute-Einreichungen deiner Nodes.",
    "card.proofs.th.node": "Node",
    "card.proofs.th.job": "Job",
    "card.proofs.th.work": "Work Units",
    "card.proofs.th.reward": "Reward ≈ KCT",
    "card.proofs.th.time": "Zeitstempel",
    "card.proofs.empty": "Warte auf Proofs…",

    "card.lb.title": "Node-Leaderboard",
    "card.lb.subtitle":
      "Sortiert nach eingereichten Proofs und geschätzten KCT-Rewards. GPU-Nodes sind hervorgehoben.",
    "card.lb.th.node": "Node",
    "card.lb.th.profile": "Profil",
    "card.lb.th.proofs": "Proofs",
    "card.lb.th.workreward": "Work / Reward",
    "card.lb.empty": "Warte auf Node-Aktivität…",

    "summary.title": "ZUSAMMENFASSUNG",
    "summary.copy": "Zusammenfassung kopieren",
    "summary.toggle-json": "Roh-JSON anzeigen",
  },
};

let currentLang = "en";

function applyLanguage(lang) {
  currentLang = lang;
  const dict = translations[lang] || translations.en;
  document.documentElement.setAttribute("data-lang", lang);

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = dict[key];
    if (text) {
      // Label-Spezialfall: falls Kinder (Badge) drin sind, nur den Textknoten ersetzen wäre kompliziert;
      // hier reicht für dein UI: kompletten Text ersetzen.
      el.textContent = text;
    }
  });
}

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

  // ⭐ PATCH 1 → Month Slider Label Fix
  if (monthSlider && monthLabel) {
    monthLabel.textContent = monthSlider.value; // Initial state
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
    if (!feeInput || !investorSlider || !growthSlider || !discountSlider) return;
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
    presetConservative.addEventListener("click", () => applyPreset("conservative"));
  }
  if (presetBalanced) {
    presetBalanced.addEventListener("click", () => applyPreset("balanced"));
  }
  if (presetAggressive) {
    presetAggressive.addEventListener("click", () => applyPreset("aggressive"));
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
            borderWidth: 2,
            pointRadius: 0,
            borderColor: "rgba(0, 227, 192, 0.9)",
          },
        ],
      };

      const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top" },
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: { maxTicksLimit: 8 },
          },
          y: {
            display: true,
            beginAtZero: true,
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
      };

      if (!investorChartInstance) {
        investorChartInstance = new Chart(ctx, {
          type: "line",
          data,
          options,
        });
      } else {
        investorChartInstance.data = data;
        investorChartInstance.options = options;
        investorChartInstance.update();
      }
    }
  } // <- schließt simulateInvestor

  if (btnSim) {
    btnSim.addEventListener("click", (e) => {
      e.preventDefault();
      simulateInvestor();
    });
  }

  if (btnCopy && summaryBox) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(summaryBox.textContent || "");
      } catch (e) {
        console.error(e);
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
} // <- schließt attachInvestorUI

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
            tension: 0.35,
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            borderColor: "rgba(0, 227, 192, 0.9)",
          },
          {
            label: "Cumulative vested (KCT)",
            data: cumulative,
            tension: 0.35,
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
            borderColor: "rgba(155, 196, 255, 0.9)",
          },
        ],
      };

      const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top" },
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: { maxTicksLimit: 10 },
          },
          y: {
            display: true,
            beginAtZero: true,
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
      };

      if (!treasuryChartInstance) {
        treasuryChartInstance = new Chart(ctx, {
          type: "line",
          data,
          options,
        });
      } else {
        treasuryChartInstance.data = data;
        treasuryChartInstance.options = options;
        treasuryChartInstance.update();
      }
    }
  }

  if (btnSim) {
    btnSim.addEventListener("click", (e) => {
      e.preventDefault();
      simulateTreasury();
    });
  }

  if (btnCopy && summaryBox) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(summaryBox.textContent || "");
      } catch (e) {
        console.error(e);
      }
    });
  }
}

// ================= Active Nodes / Proofs / Leaderboard =================

// ----------- ACTIVE NODES CARD -----------

function updateActiveNodesCard(nodes) {
  const list = document.getElementById("node-list");
  const countEl = document.getElementById("node-count");

  if (!list || !countEl) return;

  if (!nodes || nodes.length === 0) {
    list.innerHTML = `
      <li class="node-empty">Waiting for heartbeats…</li>
    `;
    countEl.textContent = "0";
    return;
  }

  countEl.textContent = nodes.length;

  list.innerHTML = nodes
    .sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0))
    .map((n) => {
      const last = new Date((n.last_seen || 0) * 1000).toLocaleString();
      const hw = n.hardware || "unknown";
      return `
        <li class="node-item">
          <div class="node-id">${n.node_id}</div>
          <div class="node-meta">
            <span>last seen: ${last}</span>
            <span>profile: ${hw}</span>
          </div>
        </li>
      `;
    })
    .join("");
}



// ----------- PROOF-OF-COMPUTE FEED -----------

function updateProofsFeed(proofs) {
  const tbody = document.getElementById("proofs-body");
  const limitSel = document.getElementById("poc-limit");

  if (!tbody || !limitSel) return;

  if (!proofs || proofs.length === 0) {
    tbody.innerHTML = `
      <tr class="poc-empty-row">
        <td colspan="5">Waiting for proofs…</td>
      </tr>
    `;
    return;
  }

  const limit = parseInt(limitSel.value || "50", 10);

  tbody.innerHTML = proofs
    .slice(-limit)
    .reverse()
    .map((p) => {
      const ts = new Date((p.timestamp_unix || 0) * 1000).toLocaleString();
      return `
        <tr>
          <td>${p.node_id}</td>
          <td>${p.job_id}</td>
          <td>${(p.work_units || 0).toLocaleString()}</td>
          <td>${(p.estimated_reward_kct || 0).toFixed(6)}</td>
          <td>${ts}</td>
        </tr>
      `;
    })
    .join("");
}



// ----------- NODE LEADERBOARD -----------

function updateNodeLeaderboard(proofs, nodes) {
  const tbody = document.getElementById("leaderboard-body");
  const limitSlider = document.getElementById("lb-limit");

  if (!tbody || !limitSlider) return;

  if (!proofs || proofs.length === 0) {
    tbody.innerHTML = `
      <tr class="lb-empty-row">
        <td colspan="5">Waiting for node activity…</td>
      </tr>
    `;
    return;
  }

  // Aggregate proofs per node
  const agg = {};
  for (const p of proofs) {
    if (!agg[p.node_id]) {
      agg[p.node_id] = {
        node_id: p.node_id,
        proofs: 0,
        work: 0,
        reward: 0,
        last_seen: 0,
        profile: "CPU",
      };
    }
    agg[p.node_id].proofs++;
    agg[p.node_id].work += p.work_units || 0;
    agg[p.node_id].reward += p.estimated_reward_kct || 0;
    agg[p.node_id].last_seen = p.timestamp_unix || 0;
  }

  const grouped = Object.values(agg).sort((a, b) => b.proofs - a.proofs);

  const limit = parseInt(limitSlider.value || "10", 10);

  tbody.innerHTML = grouped
    .slice(0, limit)
    .map((n, i) => {
      const ts = new Date(n.last_seen * 1000).toLocaleString();
      const profile = n.profile === "GPU"
        ? `<span class="lb-gpu-pill">GPU</span>`
        : `<span class="lb-cpu-pill">CPU</span>`;

      return `
        <tr class="leaderboard-row">
          <td class="lb-rank">${i + 1}</td>
          <td class="lb-node-id">${n.node_id}</td>
          <td class="lb-profile">
            ${profile}
            <span class="lb-last-seen">${ts}</span>
          </td>
          <td class="lb-proofs">${n.proofs}</td>
          <td class="lb-meta">
            ${n.work.toLocaleString()} work<br>
            ${n.reward.toFixed(6)} KCT
          </td>
        </tr>
      `;
    })
    .join("");
}

// ================= Dashboard Refresh =================

async function refreshDashboard() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) {
      console.error("Dashboard refresh failed.");
      return;
    }

    const data = await res.json();

    window.__lastNodes = data.nodes || [];
    window.__lastProofs = data.proofs || [];

    updateActiveNodesCard(window.__lastNodes);
    updateProofsFeed(window.__lastProofs);

    updateNodeLeaderboard(
      window.__lastProofs || [],
      window.__lastNodes || []
    );
  } catch (e) {
    console.error("refreshDashboard error", e);
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
    btnLangEn.addEventListener("click", () => {
      togglePillGroup("btn-lang-en", ["btn-lang-en", "btn-lang-de"]);
      applyLanguage("en");
    });
    btnLangDe.addEventListener("click", () => {
      togglePillGroup("btn-lang-de", ["btn-lang-en", "btn-lang-de"]);
      applyLanguage("de");
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
  if (priceSlider)
    priceSlider.addEventListener("input", () => {
      markUserActive();
      recomputeFromSliders();
    });
  if (invSlider)
    invSlider.addEventListener("input", () => {
      markUserActive();
      recomputeFromSliders();
    });
  if (treSlider)
    treSlider.addEventListener("input", () => {
      markUserActive();
      recomputeFromSliders();
    });

  // ⭐ PATCH 3: PoC Limit Listener
  const pocLimit = document.getElementById("poc-limit");
  if (pocLimit) {
    pocLimit.addEventListener("change", () => {
      markUserActive();
      updateProofsFeed(window.__lastProofs || []);
    });
  }

  // ⭐ PATCH 4: Leaderboard-Limit-Slider
  const lbLimit = document.getElementById("lb-limit");
  const lbLimitLabel = document.getElementById("lb-limit-label");

  if (lbLimit) {
    if (lbLimitLabel) {
      lbLimitLabel.textContent = lbLimit.value;
    }

    lbLimit.addEventListener("input", () => {
      markUserActive();
      if (lbLimitLabel) {
        lbLimitLabel.textContent = lbLimit.value;
      }
      updateNodeLeaderboard(window.__lastProofs || [], window.__lastNodes || []);
    });
  }
} // <- schließt attachGlobalListeners

// ================= Init =================

document.addEventListener("DOMContentLoaded", () => {
  applyLanguage("en"); // Default
  attachRewardUI();
  attachInvestorUI();
  attachTreasuryUI();
  attachGlobalListeners();
  refreshDashboard();

  setInterval(() => {
    if (!userActive) refreshDashboard();
  }, 8000);
}); // <- schließt DOMContentLoaded
