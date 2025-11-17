// KASCompute Dashboard JS
// -----------------------

const BASE = window.location.origin;

// Simple i18n (EN default, DE optional)
const i18n = {
  en: {
    reward_title: "Reward Preview",
    reward_sub: "Compute block reward per month m based on your config.",
    month_label: "Month (m)",
    btn_calc: "Calculate",
    reward_summary_title: "SUMMARY",
    investor_sub: "Simulates investor cashflows after mining ends.",
    fee_label: "Fee / year",
    investor_share_label: "Investor share (0–1)",
    years_label: "Years",
    growth_label: "Growth (0–1)",
    discount_label: "Discount (0–1)",
    btn_simulate: "Simulate",
    investor_summary_title: "SUMMARY"
  },
  de: {
    reward_title: "Reward Preview",
    reward_sub: "Berechnet den Reward pro Block für einen Monat m basierend auf deiner Config.",
    month_label: "Monat (m)",
    btn_calc: "Berechnen",
    reward_summary_title: "ZUSAMMENFASSUNG",
    investor_sub: "Simuliert Investoren-Cashflows nach dem Mining-Ende.",
    fee_label: "Fee / Jahr",
    investor_share_label: "Investor-Anteil (0–1)",
    years_label: "Jahre",
    growth_label: "Wachstum (0–1)",
    discount_label: "Discount (0–1)",
    btn_simulate: "Simulieren",
    investor_summary_title: "ZUSAMMENFASSUNG"
  }
};

let currentLang = "en";
let currentCurrency = "KCT";

// letzte API-Ergebnisse merken, damit wir bei Currency-Wechsel neu rendern können
let lastRewardData = null;
let lastRewardMonth = null;
let lastInvestorData = null;

// Helper formatting
function fmtNumber(num) {
  if (num == null || !isFinite(num)) return "0";
  return num.toLocaleString("de-DE", {
    maximumFractionDigits: 2
  });
}

function fmtCurrency(num) {
  const base = fmtNumber(num);
  if (currentCurrency === "KCT") return `${base} KCT`;
  if (currentCurrency === "EUR") return `${base} €`;
  if (currentCurrency === "USD") return `$ ${base}`;
  return base;
}

// --- Language + Currency UI

function applyLang(lang) {
  currentLang = lang;
  const dict = i18n[lang];

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (dict[k]) el.textContent = dict[k];
  });

  document.getElementById("btn-lang-en").classList.toggle("active", lang === "en");
  document.getElementById("btn-lang-de").classList.toggle("active", lang === "de");

  // vorhandene Summaries neu rendern
  if (lastRewardData) renderRewardSummary(lastRewardMonth, lastRewardData);
  if (lastInvestorData) {
    renderInvestorSummary(lastInvestorData);
    rebuildInvestorChart();
  }
}

function applyCurrency(cur) {
  currentCurrency = cur;
  document.getElementById("btn-cur-kct").classList.toggle("active", cur === "KCT");
  document.getElementById("btn-cur-eur").classList.toggle("active", cur === "EUR");
  document.getElementById("btn-cur-usd").classList.toggle("active", cur === "USD");

  // Einheiten-Label neben Fee-Input
  const unitLabel = document.getElementById("fee-unit-label");
  if (cur === "KCT") unitLabel.textContent = " KCT";
  if (cur === "EUR") unitLabel.textContent = " EUR";
  if (cur === "USD") unitLabel.textContent = " USD";

  // Summaries + Chart neu rendern (ohne neue API-Calls)
  if (lastRewardData) renderRewardSummary(lastRewardMonth, lastRewardData);
  if (lastInvestorData) {
    renderInvestorSummary(lastInvestorData);
    rebuildInvestorChart();
  }
}

// --- API Badge

async function checkApiHealth() {
  const badge = document.getElementById("api-badge");
  const text = document.getElementById("api-badge-text");

  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error();
    badge.classList.add("online");
    text.textContent = "API online";
  } catch (e) {
    badge.classList.remove("online");
    text.textContent = "API offline";
  }
}

// --- Reward summary rendering

function renderRewardSummary(month, data) {
  const box = document.getElementById("reward-summary");
  if (!box) return;

  if (!data || typeof data.block_reward_kct === "undefined") {
    box.textContent =
      'No data received – check your launcher "reward/preview" endpoint.';
    return;
  }

  const n = currentLang === "de" ? "Monat" : "Month";
  const est =
    currentLang === "de" ? "Geschätzter Block-Reward" : "Estimated block reward";

  const note =
    data.notes ||
    (currentLang === "de"
      ? "TODO: hook to real emission schedule"
      : "TODO: hook to real emission schedule");

  box.innerHTML =
    `${n}: ${month}\n` +
    `${est}: ${fmtCurrency(data.block_reward_kct)}\n` +
    `Note: ${note}`;
}

// --- Investor summary + chart

let investorChart = null;

function renderInvestorSummary(data) {
  const box = document.getElementById("investor-summary");
  if (!box) return;

  if (!data || typeof data.gross_sum === "undefined") {
    box.textContent =
      'No data received – check your launcher "investor/value_flow" endpoint.';
    return;
  }

  const yearsLabel = currentLang === "de" ? "Zeithorizont" : "Horizon";
  const grossLabel = currentLang === "de" ? "Brutto-Volumen" : "Gross volume";
  const investorShareLabel =
    currentLang === "de" ? "Investor-Anteil" : "Investor share";
  const cashLabel =
    currentLang === "de" ? "Cash an Investor" : "Cash to investor";
  const npvLabel =
    currentLang === "de" ? "Barwert (Investor)" : "NPV (investor)";
  const apyLabel =
    currentLang === "de"
      ? "Implizite Rendite (APY)"
      : "Implied APY";

  const sharePct =
    data.gross_sum > 0
      ? (data.investor_sum / data.gross_sum) * 100
      : 0;

  const s =
    `${yearsLabel}: ${data.years} years\n` +
    `${grossLabel}: ${fmtCurrency(data.gross_sum)}\n` +
    `${investorShareLabel}: ${fmtNumber(sharePct)} %\n` +
    `${cashLabel}: ${fmtCurrency(data.investor_sum)}\n` +
    `${npvLabel}: ${fmtCurrency(data.npv_investor)}\n` +
    `${apyLabel}: ${fmtNumber(data.apy_estimate * 100)} %`;

  box.textContent = s;
}

function rebuildInvestorChart() {
  const ctx = document.getElementById("investorChart")?.getContext("2d");
  if (!ctx) return;
  const data = lastInvestorData;
  if (!data || !data.years || !data.investor_sum) return;

  const years = data.years;
  const yearly = [];
  const cumulative = [];
  const perYear = data.investor_sum / years;
  let cum = 0;
  for (let y = 1; y <= years; y++) {
    yearly.push(perYear);
    cum += perYear;
    cumulative.push(cum);
  }
  const labels = Array.from({ length: years }, (_, i) => `Y${i + 1}`);

  // Labels inkl. Einheit & Sprache
  const unit = currentCurrency;
  const yearlyLabel =
    currentLang === "de"
      ? `Jährliche Cashflows (${unit})`
      : `Yearly cashflows (${unit})`;
  const cumLabel =
    currentLang === "de"
      ? `Kumuliertes Cash (${unit})`
      : `Cumulative cash (${unit})`;

  if (investorChart) {
    investorChart.destroy();
  }

  investorChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: yearlyLabel,
          data: yearly,
          borderWidth: 2,
          tension: 0.25
        },
        {
          label: cumLabel,
          data: cumulative,
          borderWidth: 2,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#e5e7eb",
            font: { size: 10 }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", font: { size: 9 } },
          grid: { color: "rgba(55, 65, 81, 0.4)" }
        },
        y: {
          ticks: {
            color: "#9ca3af",
            font: { size: 9 },
            callback: v => fmtNumber(v)
          },
          grid: { color: "rgba(31, 41, 55, 0.5)" }
        }
      }
    }
  });
}

// --- Handlers

async function handleRewardClick() {
  const monthInput = document.getElementById("month");
  const monthLabel = document.getElementById("month-label");
  const summaryJson = document.getElementById("reward-json");
  const month = Number(monthInput.value || 12);

  monthLabel.textContent = month.toString();

  const out = document.getElementById("reward-summary");
  out.textContent = "Loading…";

  try {
    const res = await fetch(`${BASE}/reward/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    lastRewardData = data;
    lastRewardMonth = month;

    renderRewardSummary(month, data);
    summaryJson.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    out.textContent = "Error: " + e.message;
    summaryJson.textContent = "";
  }
}

async function handleInvestorClick() {
  const fee = Number(document.getElementById("fee").value || 0);
  const investor_pct = Number(document.getElementById("investor").value || 0);
  const years = Number(document.getElementById("years").value || 1);
  const growth = Number(document.getElementById("growth").value || 0);
  const discount = Number(document.getElementById("discount").value || 0);

  // Slider labels
  document.getElementById("investor-label").textContent =
    investor_pct.toFixed(2);
  document.getElementById("years-label").textContent = `${years} years`;
  document.getElementById("growth-label").textContent = growth.toFixed(2);
  document.getElementById("discount-label").textContent = discount.toFixed(2);

  const out = document.getElementById("investor-summary");
  const jsonBox = document.getElementById("investor-json");
  out.textContent = "Loading…";

  try {
    const url = new URL(`${BASE}/investor/value_flow`);
    url.searchParams.set("fee_annual", String(fee));
    url.searchParams.set("investor_pct", String(investor_pct));
    url.searchParams.set("years", String(years));
    url.searchParams.set("growth", String(growth));
    url.searchParams.set("discount", String(discount));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastInvestorData = data;

    renderInvestorSummary(data);
    jsonBox.textContent = JSON.stringify(data, null, 2);
    rebuildInvestorChart();
  } catch (e) {
    out.textContent = "Error: " + e.message;
    jsonBox.textContent = "";
  }
}

// --- JSON toggle helpers

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

// --- Init

window.addEventListener("DOMContentLoaded", () => {
  // language + currency
  document.getElementById("btn-lang-en").onclick = () => applyLang("en");
  document.getElementById("btn-lang-de").onclick = () => applyLang("de");
  document.getElementById("btn-cur-kct").onclick = () => applyCurrency("KCT");
  document.getElementById("btn-cur-eur").onclick = () => applyCurrency("EUR");
  document.getElementById("btn-cur-usd").onclick = () => applyCurrency("USD");

  applyLang("en");
  applyCurrency("KCT");

  // API status
  checkApiHealth();
  setInterval(checkApiHealth, 30000);

  // Slider value labels live updaten
  const monthInput = document.getElementById("month");
  monthInput.addEventListener("input", () => {
    document.getElementById("month-label").textContent = monthInput.value;
  });

  const investorInput = document.getElementById("investor");
  investorInput.addEventListener("input", () => {
    document.getElementById("investor-label").textContent =
      Number(investorInput.value || 0).toFixed(2);
  });

  const yearsInput = document.getElementById("years");
  yearsInput.addEventListener("input", () => {
    document.getElementById("years-label").textContent =
      `${yearsInput.value} years`;
  });

  const growthInput = document.getElementById("growth");
  growthInput.addEventListener("input", () => {
    document.getElementById("growth-label").textContent =
      Number(growthInput.value || 0).toFixed(2);
  });

  const discountInput = document.getElementById("discount");
  discountInput.addEventListener("input", () => {
    document.getElementById("discount-label").textContent =
      Number(discountInput.value || 0).toFixed(2);
  });

  // Buttons
  document.getElementById("btn-reward").onclick = handleRewardClick;
  document.getElementById("btn-investor").onclick = handleInvestorClick;

  // JSON toggles
  setupJsonToggle("btn-reward-json", "reward-json");
  setupJsonToggle("btn-investor-json", "investor-json");

  // initial labels
  document.getElementById("month-label").textContent = monthInput.value;
  document.getElementById("investor-label").textContent =
    Number(investorInput.value || 0).toFixed(2);
  document.getElementById("years-label").textContent =
    `${yearsInput.value} years`;
  document.getElementById("growth-label").textContent =
    Number(growthInput.value || 0).toFixed(2);
  document.getElementById("discount-label").textContent =
    Number(discountInput.value || 0).toFixed(2);
});
