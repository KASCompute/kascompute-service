// KASCompute Testnet Dashboard
// Reward Preview + Investor Value Flow + Treasury Vesting

const BASE = window.location.origin;

// Demo FX (nur Anzeige)
const KCT_TO_USD = 0.05;
const KCT_TO_EUR = 0.045;

// LocalStorage keys
const LANG_KEY = "kascompute_lang";
const CURR_KEY = "kascompute_curr";
const THEME_KEY = "kascompute_theme";

// State
let currentLang = localStorage.getItem(LANG_KEY) || "en";
let currentCurrency = localStorage.getItem(CURR_KEY) || "KCT";
let currentTheme = localStorage.getItem(THEME_KEY) || "dark";

let lastRewardData = null;
let lastRewardMonth = 12;

let lastInvestorData = null;

let investorChart = null;
let treasuryChart = null;

// i18n
const I18N = {
  en: {
    rewardMonth: "Month",
    rewardBlockReward: "Estimated block reward",
    rewardNote: "Note",
    rewardNoteDemo: "KCT-emission preview for month",

    invHorizon: "Horizon",
    invGross: "Gross volume",
    invShare: "Investor share",
    invCash: "Cash to investor",
    invNPV: "NPV (investor)",
    invAPY: "Implied APY",

    trTotal: "Total Treasury",
    trVestingYears: "Vesting duration",
    trCliff: "Cliff",
    trLinear: "Linear vesting schedule",

    axisCash: "Yearly cashflows",
    axisCum: "Cumulative cash",

    errorPrefix: "Error",
    noData: "No data yet – please run a simulation.",
    copyOk: "Summary copied",
    copyFail: "Copy failed",
  },
  de: {
    rewardMonth: "Monat",
    rewardBlockReward: "Geschätzter Block-Reward",
    rewardNote: "Hinweis",
    rewardNoteDemo: "KCT -Emissionsvorschau für Monat",

    invHorizon: "Zeithorizont",
    invGross: "Bruttovolumen",
    invShare: "Investor-Anteil",
    invCash: "Cash an Investor",
    invNPV: "Barwert (Investor)",
    invAPY: "Implizite Rendite (APY)",

    trTotal: "Treasury-Gesamt",
    trVestingYears: "Vesting-Dauer",
    trCliff: "Cliff",
    trLinear: "Lineares Vesting-Schema",

    axisCash: "Jährliche Cashflows",
    axisCum: "Kumuliertes Cash",

    errorPrefix: "Fehler",
    noData: "Noch keine Daten – bitte zuerst simulieren.",
    copyOk: "Zusammenfassung kopiert",
    copyFail: "Kopieren fehlgeschlagen",
  },
};

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || key;
}

// Formatting helpers
function fmtNum(n, decimals = 2) {
  if (!isFinite(n)) n = 0;
  const fixed = n.toFixed(decimals);
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

function kctToCurrency(kct, curr) {
  if (!isFinite(kct)) kct = 0;
  switch (curr) {
    case "USD":
      return kct * KCT_TO_USD;
    case "EUR":
      return kct * KCT_TO_EUR;
    default:
      return kct;
  }
}

function fmtAmountKCT(kctVal, curr = currentCurrency) {
  const v = kctToCurrency(kctVal, curr);
  const txt = fmtNum(v, 2);
  if (curr === "KCT") return `${txt} KCT`;
  if (curr === "USD") return `$ ${txt}`;
  if (curr === "EUR") return `€ ${txt}`;
  return txt;
}

// Theme / Lang / Currency
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function updateLangButtons() {
  const btnEn = document.getElementById("btn-lang-en");
  const btnDe = document.getElementById("btn-lang-de");
  if (!btnEn || !btnDe) return;
  btnEn.classList.toggle("pill-active", currentLang === "en");
  btnDe.classList.toggle("pill-active", currentLang === "de");
}

function updateCurrencyButtons() {
  const btnKct = document.getElementById("btn-cur-kct");
  const btnEur = document.getElementById("btn-cur-eur");
  const btnUsd = document.getElementById("btn-cur-usd");
  if (!btnKct || !btnEur || !btnUsd) return;
  
  btnKct.classList.toggle("pill-active", currentCurrency === "KCT");
  btnEur.classList.toggle("pill-active", currentCurrency === "EUR");
  btnUsd.classList.toggle("pill-active", currentCurrency === "USD");

  document.querySelectorAll("[data-unit-badge]").forEach((el) => {
    el.textContent = currentCurrency;
  });
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  updateLangButtons();

  renderRewardSummary(lastRewardMonth, lastRewardData);
  renderInvestorSummary(lastInvestorData);
  rebuildInvestorChart(lastInvestorData);
  renderTreasurySummary();
  rebuildTreasuryChart();
}

function setCurrency(curr) {
  currentCurrency = curr;
  localStorage.setItem(CURR_KEY, curr);
  updateCurrencyButtons();

  renderRewardSummary(lastRewardMonth, lastRewardData);
  renderInvestorSummary(lastInvestorData);
  rebuildInvestorChart(lastInvestorData);
  renderTreasurySummary();
  rebuildTreasuryChart();
}

// API health
async function checkApiHealth() {
  const el = document.getElementById("api-status");
  if (!el) return;
  el.classList.remove("status-ok", "status-error");
  el.textContent = "Checking API…";

  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const txt = (await res.text()).trim().toLowerCase();
    if (txt.includes("ok")) {
      el.textContent = "API online";
      el.classList.add("status-ok");
    } else {
      el.textContent = "API issue";
      el.classList.add("status-error");
    }
  } catch (e) {
    el.textContent = "API offline";
    el.classList.add("status-error");
  }
}

// Reward Preview
function renderRewardSummary(month, data) {
  const box = document.getElementById("reward-summary");
  if (!box) return;

  if (!data || typeof data.block_reward_kct === "undefined") {
    box.textContent = `${t("errorPrefix")}: no data`;
    return;
  }

  const rewardKct = data.block_reward_kct ?? 0;
  const note =
    (data.notes && String(data.notes)) ||
    `${t("rewardNoteDemo")} ${month}`;

  box.innerHTML =
    `${t("rewardMonth")}: ${month}\n` +
    `${t("rewardBlockReward")}: ${fmtAmountKCT(rewardKct)}\n` +
    `${t("rewardNote")}: ${note}`;
}

async function handleRewardClick() {
  const monthInput = document.getElementById("month");
  const jsonBox = document.getElementById("reward-json");
  const summaryBox = document.getElementById("reward-summary");
  if (!monthInput || !jsonBox || !summaryBox) return;

  const month = Number(monthInput.value || 1);
  lastRewardMonth = month;

  jsonBox.textContent = "Loading…";
  summaryBox.textContent = "Loading…";

  try {
    const res = await fetch(`${BASE}/reward/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    lastRewardData = data;

    jsonBox.textContent = JSON.stringify(data, null, 2);
    renderRewardSummary(month, data);
  } catch (e) {
    const msg = `${t("errorPrefix")}: ${e.message}`;
    jsonBox.textContent = msg;
    summaryBox.textContent = msg;
  }
}

// Investor Value Flow
function renderInvestorSummary(data) {
  const box = document.getElementById("investor-summary");
  if (!box) return;

  if (!data) {
    box.textContent = t("noData");
    return;
  }

  const years = data.years ?? data.t_years ?? 0;
  const gross = data.gross_sum ?? 0;
  const investor = data.investor_sum ?? 0;
  const npv = data.npv_investor ?? 0;
  const apy = data.apy_estimate ?? 0;

  const sharePct = gross > 0 ? (investor / gross) * 100 : 0;

  box.innerHTML =
    `${t("invHorizon")}: ${fmtNum(years, 0)} years\n` +
    `${t("invGross")}: ${fmtAmountKCT(gross)}\n` +
    `${t("invShare")}: ${fmtNum(sharePct, 2)} %\n` +
    `${t("invCash")}: ${fmtAmountKCT(investor)}\n` +
    `${t("invNPV")}: ${fmtAmountKCT(npv)}\n` +
    `${t("invAPY")}: ${fmtNum(apy * 100, 2)} %`;
}

function rebuildInvestorChart(data) {
  const canvas = document.getElementById("investorChart");
  if (!canvas) return;

  if (!data) {
    if (investorChart) {
      investorChart.destroy();
      investorChart = null;
    }
    return;
  }

  const years = Math.max(1, Math.round(data.years ?? data.t_years ?? 1));
  const investorSumKct = data.investor_sum ?? 0;
  const yearlyKct = investorSumKct / years;

  const labels = [];
  const yearly = [];
  const cumulative = [];

  let cum = 0;
  for (let i = 1; i <= years; i++) {
    labels.push("Y" + i);
    cum += yearlyKct;
    yearly.push(kctToCurrency(yearlyKct, currentCurrency));
    cumulative.push(kctToCurrency(cum, currentCurrency));
  }

  const suffix =
    currentCurrency === "KCT" ? "KCT" : currentCurrency === "EUR" ? "€" : "$";

  if (investorChart) investorChart.destroy();

  investorChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${t("axisCash")} (${suffix})`,
          data: yearly,
          borderColor: "#00e3c0",
          backgroundColor: "rgba(0,227,192,0.15)",
          borderWidth: 2.2,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8,
        },
        {
          label: `${t("axisCum")} (${suffix})`,
          data: cumulative,
          borderColor: "#00a4ff",
          backgroundColor: "rgba(0,164,255,0.15)",
          borderWidth: 2.2,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: "#d7e4ff",
            font: { size: 11 },
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "rgba(5,16,35,0.96)",
          borderColor: "#00a4ff",
          borderWidth: 1,
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${fmtNum(ctx.parsed.y, 2)} ${suffix}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#93a9e6", font: { size: 10 } },
          grid: { color: "rgba(147,169,230,0.12)" },
        },
        y: {
          ticks: {
            color: "#93a9e6",
            font: { size: 10 },
            callback: (v) => fmtNum(v, 0),
          },
          grid: { color: "rgba(147,169,230,0.08)" },
        },
      },
    },
  });
}

async function handleInvestorClick() {
  const feeEl = document.getElementById("fee");
  const invEl = document.getElementById("investor");
  const yearsEl = document.getElementById("years");
  const growthEl = document.getElementById("growth");
  const discEl = document.getElementById("discount");
  const jsonBox = document.getElementById("investor-json");
  const summary = document.getElementById("investor-summary");

  if (!feeEl || !invEl || !yearsEl || !growthEl || !discEl || !jsonBox || !summary)
    return;

  const fee = Number(feeEl.value || 0);
  const investor_pct = Number(invEl.value || 0);
  const years = Number(yearsEl.value || 1);
  const growth = Number(growthEl.value || 0);
  const discount = Number(discEl.value || 0);

  // slider labels
  document.getElementById("investor-label").textContent = investor_pct.toFixed(2);
  document.getElementById("years-label").textContent = years.toFixed(0);
  document.getElementById("growth-label").textContent = growth.toFixed(2);
  document.getElementById("discount-label").textContent = discount.toFixed(2);

  jsonBox.textContent = "Loading…";
  summary.textContent = "Loading…";

  try {
    const url = new URL(`${BASE}/investor/value_flow`);
    url.searchParams.set("fee_annual", String(fee));
    url.searchParams.set("investor_pct", String(investor_pct));
    url.searchParams.set("years", String(years));
    url.searchParams.set("growth", String(growth));
    url.searchParams.set("discount", String(discount));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    lastInvestorData = data;

    jsonBox.textContent = JSON.stringify(data, null, 2);
    renderInvestorSummary(data);
    rebuildInvestorChart(data);
  } catch (e) {
    const msg = `${t("errorPrefix")}: ${e.message}`;
    jsonBox.textContent = msg;
    summary.textContent = msg;
    rebuildInvestorChart(null);
  }
}

// Investor presets
function applyInvestorPreset(preset) {
  const feeEl = document.getElementById("fee");
  const invEl = document.getElementById("investor");
  const yearsEl = document.getElementById("years");
  const growthEl = document.getElementById("growth");
  const discEl = document.getElementById("discount");
  if (!feeEl || !invEl || !yearsEl || !growthEl || !discEl) return;

  if (preset === "conservative") {
    feeEl.value = "0";
    invEl.value = "0.10";
    yearsEl.value = "10";
    growthEl.value = "0.02";
    discEl.value = "0.12";
  } else if (preset === "balanced") {
    feeEl.value = "0.05";
    invEl.value = "0.20";
    yearsEl.value = "15";
    growthEl.value = "0.05";
    discEl.value = "0.08";
  } else if (preset === "aggressive") {
    feeEl.value = "0.10";
    invEl.value = "0.30";
    yearsEl.value = "20";
    growthEl.value = "0.10";
    discEl.value = "0.05";
  }

  // Labels updaten & direkt simulieren
  document.getElementById("investor-label").textContent =
    Number(invEl.value || 0).toFixed(2);
  document.getElementById("years-label").textContent =
    Number(yearsEl.value || 0).toFixed(0);
  document.getElementById("growth-label").textContent =
    Number(growthEl.value || 0).toFixed(2);
  document.getElementById("discount-label").textContent =
    Number(discEl.value || 0).toFixed(2);

  handleInvestorClick();
}

// Treasury Vesting (clientseitig)
function computeTreasurySchedule() {
  const totalInput = document.getElementById("treasury-total");
  const yearsInput = document.getElementById("treasury-years");
  const cliffInput = document.getElementById("treasury-cliff");
  if (!totalInput || !yearsInput || !cliffInput) return null;

  const total = Number(totalInput.value || 0);
  const years = Number(yearsInput.value || 1);
  const cliffMonths = Number(cliffInput.value || 0);

  const monthsTotal = years * 12;
  const monthsLinear = Math.max(1, monthsTotal - cliffMonths);
  const perMonth = total / monthsLinear;

  const perYear = [];
  const cumulative = [];

  let vestedCum = 0;
  for (let y = 1; y <= years; y++) {
    const mStart = (y - 1) * 12;
    const mEnd = y * 12;

    let vestedInYear = 0;
    for (let m = mStart; m < mEnd; m++) {
      if (m < cliffMonths) continue;
      if (m >= cliffMonths + monthsLinear) continue;
      vestedInYear += perMonth;
    }

    vestedCum += vestedInYear;
    perYear.push(vestedInYear);
    cumulative.push(vestedCum);
  }

  return {
    totalKct: total,
    years,
    cliffMonths,
    perYearKct: perYear,
    cumulativeKct: cumulative,
  };
}

function renderTreasurySummary() {
  const box = document.getElementById("treasury-summary");
  if (!box) return;

  const totalInput = document.getElementById("treasury-total");
  const yearsInput = document.getElementById("treasury-years");
  const cliffInput = document.getElementById("treasury-cliff");

  const total = Number(totalInput.value || 0);
  const years = Number(yearsInput.value || 1);
  const cliffMonths = Number(cliffInput.value || 0);

  const sched = computeTreasurySchedule();
  if (!sched) {
    box.textContent = t("noData");
    return;
  }

  const vestedEnd = sched.cumulativeKct[sched.cumulativeKct.length - 1] || 0;
  const remaining = total - vestedEnd;

  box.innerHTML =
    `${t("trTotal")}: ${fmtAmountKCT(total, "KCT")}\n` +
    `${t("trVestingYears")}: ${years} years\n` +
    `${t("trCliff")}: ${cliffMonths} months\n` +
    `${t("trLinear")}: ${fmtAmountKCT(vestedEnd, "KCT")} vested over period\n` +
    `Remaining: ${fmtAmountKCT(remaining, "KCT")}`;
}

function rebuildTreasuryChart() {
  const canvas = document.getElementById("treasuryChart");
  if (!canvas) return;

  const sched = computeTreasurySchedule();
  if (!sched) {
    if (treasuryChart) {
      treasuryChart.destroy();
      treasuryChart = null;
    }
    return;
  }

  const labels = [];
  for (let i = 1; i <= sched.years; i++) labels.push("Y" + i);

  const perYearCurr = sched.perYearKct.map((v) =>
    kctToCurrency(v, currentCurrency)
  );
  const cumulativeCurr = sched.cumulativeKct.map((v) =>
    kctToCurrency(v, currentCurrency)
  );

  const suffix =
    currentCurrency === "KCT" ? "KCT" : currentCurrency === "EUR" ? "€" : "$";

  if (treasuryChart) treasuryChart.destroy();

  treasuryChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: `Yearly vested (${suffix})`,
          data: perYearCurr,
          backgroundColor: "rgba(0,227,192,0.35)",
          borderColor: "#00e3c0",
          borderWidth: 1.3,
          borderRadius: 5,
        },
        {
          type: "line",
          label: `Cumulative vested (${suffix})`,
          data: cumulativeCurr,
          borderColor: "#00a4ff",
          backgroundColor: "rgba(0,164,255,0.18)",
          borderWidth: 2.2,
          tension: 0.3,
          pointRadius: 0,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { color: "#93a9e6", font: { size: 10 } },
          grid: { color: "rgba(147,169,230,0.12)" },
        },
        y: {
          position: "left",
          ticks: {
            color: "#93a9e6",
            font: { size: 10 },
            callback: (v) => fmtNum(v, 0),
          },
          grid: { color: "rgba(147,169,230,0.08)" },
        },
        y1: {
          position: "right",
          ticks: {
            color: "#93a9e6",
            font: { size: 10 },
            callback: (v) => fmtNum(v, 0),
          },
          grid: { drawOnChartArea: false },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: "#d7e4ff",
            font: { size: 11 },
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "rgba(5,16,35,0.96)",
          borderColor: "#00e3c0",
          borderWidth: 1,
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${fmtNum(ctx.parsed.y, 0)} ${suffix}`,
          },
        },
      },
    },
  });
}

function handleTreasurySimulate() {
  const yearsEl = document.getElementById("treasury-years");
  const cliffEl = document.getElementById("treasury-cliff");
  if (yearsEl) {
    document.getElementById("treasury-years-label").textContent =
      yearsEl.value;
  }
  if (cliffEl) {
    document.getElementById("treasury-cliff-label").textContent =
      cliffEl.value;
  }
  renderTreasurySummary();
  rebuildTreasuryChart();
}

// Treasury preset
function applyTreasuryPreset() {
  const totalInput = document.getElementById("treasury-total");
  const yearsInput = document.getElementById("treasury-years");
  const cliffInput = document.getElementById("treasury-cliff");
  if (!totalInput || !yearsInput || !cliffInput) return;

  // Beispiel: 10% von 10B = 1B, 14 Jahre, 12 Monate Cliff
  totalInput.value = "1000000000";
  yearsInput.value = "14";
  cliffInput.value = "12";

  document.getElementById("treasury-years-label").textContent = "14";
  document.getElementById("treasury-cliff-label").textContent = "12";

  renderTreasurySummary();
  rebuildTreasuryChart();
}

// JSON toggle
function setupJsonToggle(btnId, preId) {
  const btn = document.getElementById(btnId);
  const pre = document.getElementById(preId);
  if (!btn || !pre) return;
  btn.addEventListener("click", () => {
    const visible = pre.style.display !== "none";
    pre.style.display = visible ? "none" : "block";
    btn.textContent = visible ? "Show raw JSON" : "Hide raw JSON";
  });
}

// Copy helper
function setupCopyButton(btnId, sourceId) {
  const btn = document.getElementById(btnId);
  const src = document.getElementById(sourceId);
  if (!btn || !src) return;

  btn.addEventListener("click", async () => {
    const text = src.textContent || "";
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = t("copyOk");
      setTimeout(() => {
        if (btnId === "btn-reward-copy") btn.textContent = "Copy summary";
        if (btnId === "btn-investor-copy") btn.textContent = "Copy summary";
        if (btnId === "btn-treasury-copy") btn.textContent = "Copy summary";
      }, 1500);
    } catch (e) {
      btn.textContent = t("copyFail");
      setTimeout(() => {
        if (btnId === "btn-reward-copy") btn.textContent = "Copy summary";
        if (btnId === "btn-investor-copy") btn.textContent = "Copy summary";
        if (btnId === "btn-treasury-copy") btn.textContent = "Copy summary";
      }, 1500);
    }
  });
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  // Theme
  applyTheme(currentTheme || "dark");
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(currentTheme);
      rebuildInvestorChart(lastInvestorData);
      rebuildTreasuryChart();
    });
  }

function shortPk(pk) {
  if (!pk) return "";
  if (pk.length <= 14) return pk;
  return pk.slice(0, 8) + "…" + pk.slice(-6);
}

function timeAgoFromUnix(unixSeconds) {
  if (!unixSeconds) return "unknown";
  const now = Date.now() / 1000;
  let diff = Math.max(0, Math.round(now - unixSeconds));

  if (diff < 10) return "just now";
  if (diff < 60) return diff + "s ago";
  const mins = Math.round(diff / 60);
  if (mins < 60) return mins + " min ago";
  const hours = Math.round(mins / 60);
  return hours + " h ago";
}

function renderNodes(nodes) {
  const countEl = document.getElementById("node-count");
  const listEl = document.getElementById("node-list");
  if (!countEl || !listEl) return;

  if (!nodes || nodes.length === 0) {
    countEl.textContent = "0";
    listEl.innerHTML = `<li class="node-empty">No nodes online yet.</li>`;
    return;
  }

  countEl.textContent = String(nodes.length);

  listEl.innerHTML = nodes
    .map((n) => {
      const lastSeen = timeAgoFromUnix(n.last_seen_unix);
      const pkShort = shortPk(n.public_key_hex);
      const profile = n.compute_profile || "unknown";
      const score = n.compute_score ?? 0;

      return `
        <li class="node-item">
          <div class="node-id">${n.node_id}</div>
          <div class="node-meta">
            <span>${profile}</span>
            <span>${pkShort}</span>
            <span>score: ${score}</span>
            <span>last seen: ${lastSeen}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

async function fetchNodes() {
  const listEl = document.getElementById("node-list");
  if (listEl) {
    listEl.classList.add("loading");
  }

  try {
    const res = await fetch(`${BASE}/nodes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderNodes(data);
  } catch (err) {
    console.error("Failed to fetch nodes", err);
    if (listEl) {
      listEl.innerHTML = `<li class="node-empty">Could not load nodes.</li>`;
    }
  } finally {
    if (listEl) {
      listEl.classList.remove("loading");
    }
  }
}


  // Lang & Currency
  updateLangButtons();
  updateCurrencyButtons();

  document.getElementById("btn-lang-en")?.addEventListener("click", () =>
    setLang("en")
  );
  document.getElementById("btn-lang-de")?.addEventListener("click", () =>
    setLang("de")
  );

  document.getElementById("btn-cur-kct")?.addEventListener("click", () =>
    setCurrency("KCT")
  );
  document.getElementById("btn-cur-eur")?.addEventListener("click", () =>
    setCurrency("EUR")
  );
  document.getElementById("btn-cur-usd")?.addEventListener("click", () =>
    setCurrency("USD")
  );

  // Reward controls
  const monthInput = document.getElementById("month");
  if (monthInput) {
    document.getElementById("month-label").textContent = monthInput.value;
    monthInput.addEventListener("input", () => {
      document.getElementById("month-label").textContent = monthInput.value;
    });
  }
  document
    .getElementById("btn-reward")
    ?.addEventListener("click", handleRewardClick);

  // Investor sliders live labels
  const invSlider = document.getElementById("investor");
  if (invSlider) {
    document.getElementById("investor-label").textContent =
      Number(invSlider.value || 0).toFixed(2);
    invSlider.addEventListener("input", () => {
      document.getElementById("investor-label").textContent =
        Number(invSlider.value || 0).toFixed(2);
    });
  }
  const yearsSlider = document.getElementById("years");
  if (yearsSlider) {
    document.getElementById("years-label").textContent =
      Number(yearsSlider.value || 0).toFixed(0);
    yearsSlider.addEventListener("input", () => {
      document.getElementById("years-label").textContent =
        Number(yearsSlider.value || 0).toFixed(0);
    });
  }
  const growthSlider = document.getElementById("growth");
  if (growthSlider) {
    document.getElementById("growth-label").textContent =
      Number(growthSlider.value || 0).toFixed(2);
    growthSlider.addEventListener("input", () => {
      document.getElementById("growth-label").textContent =
        Number(growthSlider.value || 0).toFixed(2);
    });
  }
  const discSlider = document.getElementById("discount");
  if (discSlider) {
    document.getElementById("discount-label").textContent =
      Number(discSlider.value || 0).toFixed(2);
    discSlider.addEventListener("input", () => {
      document.getElementById("discount-label").textContent =
        Number(discSlider.value || 0).toFixed(2);
    });
  }

  document
    .getElementById("btn-investor")
    ?.addEventListener("click", handleInvestorClick);

  // Investor presets
  document
    .getElementById("inv-preset-conservative")
    ?.addEventListener("click", () => applyInvestorPreset("conservative"));
  document
    .getElementById("inv-preset-balanced")
    ?.addEventListener("click", () => applyInvestorPreset("balanced"));
  document
    .getElementById("inv-preset-aggressive")
    ?.addEventListener("click", () => applyInvestorPreset("aggressive"));

  // Treasury sliders + buttons
  const trYears = document.getElementById("treasury-years");
  const trCliff = document.getElementById("treasury-cliff");
  if (trYears) {
    document.getElementById("treasury-years-label").textContent =
      trYears.value;
    trYears.addEventListener("input", () => {
      document.getElementById("treasury-years-label").textContent =
        trYears.value;
    });
  }
  if (trCliff) {
    document.getElementById("treasury-cliff-label").textContent =
      trCliff.value;
    trCliff.addEventListener("input", () => {
      document.getElementById("treasury-cliff-label").textContent =
        trCliff.value;
    });
  }

  document
    .getElementById("btn-treasury")
    ?.addEventListener("click", handleTreasurySimulate);
  document
    .getElementById("btn-treasury-preset")
    ?.addEventListener("click", applyTreasuryPreset);

   // JSON toggles
  setupJsonToggle("btn-reward-json", "reward-json");
  setupJsonToggle("btn-investor-json", "investor-json");

  // Copy buttons
  setupCopyButton("btn-reward-copy", "reward-summary");
  setupCopyButton("btn-investor-copy", "investor-summary");
  setupCopyButton("btn-treasury-copy", "treasury-summary");

  // Initial treasury summary & chart
  renderTreasurySummary();
  rebuildTreasuryChart();

  // API health
  checkApiHealth();
  setInterval(checkApiHealth, 30000);

  // Active nodes panel
  fetchNodes();
  setInterval(fetchNodes, 10000);

  const btnRefreshNodes = document.getElementById("btn-refresh-nodes");
  if (btnRefreshNodes) {
    btnRefreshNodes.addEventListener("click", (e) => {
      e.preventDefault();
      fetchNodes();
    });
  }
});

