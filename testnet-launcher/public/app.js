// KASCompute Testnet Dashboard
// Reward Preview + Investor Value Flow + Treasury Vesting

// Automatische API-Base-Erkennung
function detectApiBase() {
  // 1. Wenn explizit gesetzt (z.B. auf Netlify → Railway-Backend), dann nimm das:
  if (window.KCT_API_BASE) {
    return window.KCT_API_BASE;
  }

  const host = window.location.hostname;

  // 2. Lokal / Test: alles was localhost oder 127.0.0.1 ist → direkt auf deinen Launcher
  if (host === "127.0.0.1" || host === "localhost") {
    return "http://127.0.0.1:8080";
  }

  // 3. Render / Railway / Prod-Domain
  // Falls dein Dashboard direkt vom Backend gehostet wird, reicht origin.
  return `${window.location.origin}`;
}

const API_BASE = detectApiBase();
console.log("KCT Dashboard API_BASE =", API_BASE);

// -------------------------
// Reward Preview
// -------------------------
async function handleRewardClick(e) {
  e.preventDefault();

  const monthInput = document.getElementById("reward-month");
  const resultBlock = document.getElementById("reward-result");
  const summaryBlock = document.getElementById("reward-summary");

  if (!monthInput || !resultBlock || !summaryBlock) return;

  const month = Number(monthInput.value || "1");

  try {
    resultBlock.textContent = "Loading...";

    const res = await fetch(`${API_BASE}/reward/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    const blockReward = Number(data.block_reward_kct || 0);
    const monthlyEmission = Number(data.monthly_emission_kct || 0);

    resultBlock.innerHTML = `
      <div class="reward-result-line">
        <span>Block reward:</span>
        <span><strong>${blockReward.toFixed(6)} KCT</strong></span>
      </div>
      <div class="reward-result-line">
        <span>Monthly emission:</span>
        <span><strong>${monthlyEmission.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })} KCT</strong></span>
      </div>
    `;

    summaryBlock.textContent = data.notes || "";
  } catch (err) {
    console.error("Reward preview failed", err);
    resultBlock.textContent = "Failed to load reward preview.";
    summaryBlock.textContent = "";
  }
}

// -------------------------
// Investor Value Flow
// -------------------------

const DEFAULT_INVESTOR_PARAMS = {
  fee_annual: 200000,
  investor_pct: 0.15,
  years: 10,
  growth: 0.05,
  discount: 0.08,
};

function getInvestorParamsFromUI() {
  const feeInput = document.getElementById("inv-fee");
  const investorInput = document.getElementById("inv-investor");
  const yearsInput = document.getElementById("inv-years");
  const growthInput = document.getElementById("inv-growth");
  const discountInput = document.getElementById("inv-discount");

  return {
    fee_annual: Number(feeInput?.value || DEFAULT_INVESTOR_PARAMS.fee_annual),
    investor_pct:
      Number(investorInput?.value || DEFAULT_INVESTOR_PARAMS.investor_pct) /
      100.0,
    years: Number(yearsInput?.value || DEFAULT_INVESTOR_PARAMS.years),
    growth:
      Number(growthInput?.value || DEFAULT_INVESTOR_PARAMS.growth * 100) /
      100.0,
    discount:
      Number(discountInput?.value || DEFAULT_INVESTOR_PARAMS.discount * 100) /
      100.0,
  };
}

function updateInvestorSlidersLabels() {
  const investorInput = document.getElementById("inv-investor");
  const investorLabel = document.getElementById("inv-investor-label");
  const yearsInput = document.getElementById("inv-years");
  const yearsLabel = document.getElementById("inv-years-label");
  const growthInput = document.getElementById("inv-growth");
  const growthLabel = document.getElementById("inv-growth-label");
  const discountInput = document.getElementById("inv-discount");
  const discountLabel = document.getElementById("inv-discount-label");

  if (investorInput && investorLabel) {
    investorLabel.textContent = `${investorInput.value}%`;
    investorInput.addEventListener("input", () => {
      investorLabel.textContent = `${investorInput.value}%`;
    });
  }

  if (yearsInput && yearsLabel) {
    yearsLabel.textContent = `${yearsInput.value} years`;
    yearsInput.addEventListener("input", () => {
      yearsLabel.textContent = `${yearsInput.value} years`;
    });
  }

  if (growthInput && growthLabel) {
    growthLabel.textContent = `${growthInput.value}%`;
    growthInput.addEventListener("input", () => {
      growthLabel.textContent = `${growthInput.value}%`;
    });
  }

  if (discountInput && discountLabel) {
    discountLabel.textContent = `${discountInput.value}%`;
    discountInput.addEventListener("input", () => {
      discountLabel.textContent = `${discountInput.value}%`;
    });
  }
}

async function handleInvestorClick(e) {
  e.preventDefault();

  const resultBlock = document.getElementById("investor-result");
  if (!resultBlock) return;

  const q = getInvestorParamsFromUI();

  const url = new URL(`${API_BASE}/investor/value_flow`);
  url.searchParams.set("fee_annual", String(q.fee_annual));
  url.searchParams.set("investor_pct", String(q.investor_pct));
  url.searchParams.set("years", String(q.years));
  url.searchParams.set("growth", String(q.growth));
  url.searchParams.set("discount", String(q.discount));

  try {
    resultBlock.textContent = "Loading...";

    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    const gross = Number(data.gross_sum || 0);
    const investorSum = Number(data.investor_sum || 0);
    const npv = Number(data.npv_investor || 0);
    const apy = Number(data.apy_estimate || 0);

    resultBlock.innerHTML = `
      <div class="inv-line">
        <span>Total gross fees:</span>
        <span><strong>${gross.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })} USD</strong></span>
      </div>
      <div class="inv-line">
        <span>Investor share (undiscounted):</span>
        <span><strong>${investorSum.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })} USD</strong></span>
      </div>
      <div class="inv-line">
        <span>NPV (discounted):</span>
        <span><strong>${npv.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })} USD</strong></span>
      </div>
      <div class="inv-line">
        <span>Implied APY (on notional fee):</span>
        <span><strong>${(apy * 100).toFixed(2)}%</strong></span>
      </div>
    `;
  } catch (err) {
    console.error("Investor flow failed", err);
    resultBlock.textContent = "Failed to load investor simulation.";
  }
}

// -------------------------
// Treasury Vesting (Dummy UI-Only)
// -------------------------

function handleTreasurySimulate(e) {
  e.preventDefault();

  const totalInput = document.getElementById("treasury-total");
  const monthsInput = document.getElementById("treasury-months");
  const discountInput = document.getElementById("treasury-discount");
  const resultBlock = document.getElementById("treasury-result");

  if (!totalInput || !monthsInput || !discountInput || !resultBlock) return;

  const total = Number(totalInput.value || "900000000");
  const months = Number(monthsInput.value || "168");
  const discount = Number(discountInput.value || "8") / 100;

  const monthly = total / months;
  let sum = 0;
  let npv = 0;

  for (let t = 1; t <= months; t++) {
    sum += monthly;
    const discFactor = Math.pow(1 + discount / 12, t);
    npv += monthly / discFactor;
  }

  resultBlock.innerHTML = `
    <div class="treasury-line">
      <span>Monthly vesting:</span>
      <span><strong>${monthly.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })} KCT</strong></span>
    </div>
    <div class="treasury-line">
      <span>Total vested:</span>
      <span><strong>${sum.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })} KCT</strong></span>
    </div>
    <div class="treasury-line">
      <span>Discounted NPV:</span>
      <span><strong>${npv.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })} KCT</strong></span>
    </div>
  `;
}

// -------------------------
// Active Nodes + Leaderboard
// -------------------------

let latestNodes = [];
let latestProofs = [];
let cachedLang = "en";
let currentTheme = "dark";
let currentCurrency = "usd";

const THEME_KEY = "kct_theme";
const LANG_KEY = "kct_lang";
const CURR_KEY = "kct_currency";

// Liefert Node-Typen "CPU" / "GPU" anhand des compute_profile strings
function detectNodeType(computeProfile) {
  const v = String(computeProfile || "").toLowerCase();
  if (v.includes("gpu")) return "GPU";
  if (v.includes("rtx") || v.includes("rx") || v.includes("gddr")) return "GPU";
  return "CPU";
}

// Kleines Badge für GPU-Nodes
function renderProfileWithBadge(computeProfile) {
  const nodeType = detectNodeType(computeProfile);
  const label = computeProfile || "unknown";
  if (nodeType === "GPU") {
    return `<span class="badge-gpu">${label}</span>`;
  }
  return `<span class="badge-cpu">${label}</span>`;
}

// Fetch Active Nodes
async function fetchNodes() {
  const tbody = document.getElementById("nodes-body");
  const summary = document.getElementById("nodes-summary");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/nodes`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    latestNodes = data;

    tbody.innerHTML = "";

    if (!data || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4">No nodes online yet.</td>
        </tr>
      `;
      if (summary) {
        summary.textContent = "No active nodes.";
      }
      return;
    }

    data.forEach((n) => {
      const tr = document.createElement("tr");

      const nodeType = detectNodeType(n.compute_profile);
      const profileHtml = renderProfileWithBadge(n.compute_profile);

      const lastSeenSec = Number(n.last_seen_unix || 0);
      const lastSeenDate = new Date(lastSeenSec * 1000);
      const lastSeenStr = lastSeenDate.toLocaleString();

      tr.innerHTML = `
        <td>${n.node_id}</td>
        <td>${profileHtml}</td>
        <td>${n.compute_score ?? 0}</td>
        <td>${lastSeenStr}</td>
      `;
      tbody.appendChild(tr);
    });

    if (summary) {
      summary.textContent = `${data.length} node(s) connected.`;
    }
  } catch (err) {
    console.error("Failed to fetch nodes", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4">Failed to load nodes.</td>
        </tr>
      `;
    }
    if (summary) {
      summary.textContent = "Error loading nodes.";
    }
  }
}

// -------------------------
// Proof-of-Compute Feed & Leaderboard
// -------------------------

function updateHeaderProofs(proofs) {
  const headerSpan = document.getElementById("poc-header-count");
  if (!headerSpan) return;
  headerSpan.textContent = proofs && proofs.length ? `${proofs.length}` : "0";
}

function updateLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  if (!tbody) return;

  if (!latestProofs || latestProofs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">No node activity yet.</td>
      </tr>
    `;
    return;
  }

  // Aggregiere Work + Reward pro Node
  const agg = {};
  latestProofs.forEach((p) => {
    const nodeId = p.node_id || "unknown";
    if (!agg[nodeId]) {
      agg[nodeId] = {
        node_id: nodeId,
        proofs: 0,
        work_units: 0,
        reward_kct: 0,
      };
    }
    agg[nodeId].proofs += 1;
    agg[nodeId].work_units += Number(p.work_units || 0);
    agg[nodeId].reward_kct += Number(p.estimated_reward_kct || 0);
  });

  const rows = Object.values(agg);

  rows.sort((a, b) => b.reward_kct - a.reward_kct);

  tbody.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.node_id}</td>
      <td>${r.proofs}</td>
      <td>${r.work_units.toLocaleString()}</td>
      <td>${r.reward_kct.toFixed(6)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderProofs(proofs) {
  const tbody = document.getElementById("proofs-body");
  if (!tbody) return;

  // Kein Proof → leere Zeile + Header / Leaderboard leeren
  if (!proofs || proofs.length === 0) {
    tbody.innerHTML = `
      <tr class="poc-empty-row">
        <td colspan="5">No proofs yet.</td>
      </tr>
    `;
    updateHeaderProofs([]);
    latestProofs = [];
    updateLeaderboard();
    return;
  }

  // Header + Leaderboard updaten
  updateHeaderProofs(proofs);
  latestProofs = proofs;
  updateLeaderboard();

  // Nur die neuesten 10 Proofs anzeigen (nach Zeit sortiert)
  const sorted = [...proofs].sort(
    (a, b) =>
      (b.timestamp_unix ?? b.timestamp ?? 0) -
      (a.timestamp_unix ?? a.timestamp ?? 0)
  );
  const visible = sorted.slice(0, 10);

  tbody.innerHTML = "";

  visible.forEach((p) => {
    const tr = document.createElement("tr");

    const unix = p.timestamp_unix ?? p.timestamp ?? 0;
    const date = new Date(unix * 1000);
    const ts = date.toLocaleString();

    tr.innerHTML = `
      <td>${p.node_id}</td>
      <td>${p.job_id}</td>
      <td>${(p.work_units ?? 0).toLocaleString()}</td>
      <td>${(p.estimated_reward_kct ?? 0).toFixed(6)}</td>
      <td>${ts}</td>
    `;

    tbody.appendChild(tr);
  });
}

async function fetchProofs() {
  const tbody = document.getElementById("proofs-body");
  try {
    // Backend-Route: GET /proofs
    const res = await fetch(`${API_BASE}/proofs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderProofs(data);
  } catch (err) {
    console.error("Failed to fetch proofs", err);
    if (tbody) {
      tbody.innerHTML = `
          <tr class="poc-empty-row">
            <td colspan="5">Could not load proofs.</td>
          </tr>
        `;
    }
    updateHeaderProofs([]);
    latestProofs = [];
    updateLeaderboard();
  }
}

// -------------------------
// Language, Theme, Currency
// -------------------------

function detectInitialLang() {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === "en" || stored === "de") return stored;

  const lang = navigator.language || "en";
  if (lang.toLowerCase().startsWith("de")) return "de";
  return "en";
}

function setLang(lang) {
  cachedLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.setAttribute("data-lang", lang);

  const enOnly = document.querySelectorAll("[data-lang='en']");
  const deOnly = document.querySelectorAll("[data-lang='de']");

  enOnly.forEach((el) => {
    el.style.display = lang === "en" ? "" : "none";
  });
  deOnly.forEach((el) => {
    el.style.display = lang === "de" ? "" : "none";
  });

  updateLangButtons();
}

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function updateLangButtons() {
  const btnEn = document.getElementById("btn-lang-en");
  const btnDe = document.getElementById("btn-lang-de");
  if (!btnEn || !btnDe) return;
  btnEn.classList.toggle("pill-active", cachedLang === "en");
  btnDe.classList.toggle("pill-active", cachedLang === "de");
}

function detectInitialTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;

  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function setCurrency(curr) {
  currentCurrency = curr;
  localStorage.setItem(CURR_KEY, curr);
  document.documentElement.setAttribute("data-currency", curr);
  updateCurrencyButtons();
}

function detectInitialCurrency() {
  const stored = localStorage.getItem(CURR_KEY);
  if (stored) return stored;
  return "usd";
}

function updateCurrencyButtons() {
  const buttons = document.querySelectorAll("[data-currency-button]");
  buttons.forEach((btn) => {
    const c = btn.getAttribute("data-currency-button");
    btn.classList.toggle("pill-active", c === currentCurrency);
  });
}

// -------------------------
// INIT
// -------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Theme
  const initialTheme = detectInitialTheme();
  applyTheme(initialTheme);

  const btnThemeLight = document.getElementById("btn-theme-light");
  const btnThemeDark = document.getElementById("btn-theme-dark");
  btnThemeLight?.addEventListener("click", () => applyTheme("light"));
  btnThemeDark?.addEventListener("click", () => applyTheme("dark"));

  // Language
  const initialLang = detectInitialLang();
  setLang(initialLang);

  document.getElementById("btn-lang-en")?.addEventListener("click", () =>
    setLang("en")
  );
  document.getElementById("btn-lang-de")?.addEventListener("click", () =>
    setLang("de")
  );

  // Currency
  const initialCurr = detectInitialCurrency();
  setCurrency(initialCurr);

  document
    .querySelectorAll("[data-currency-button]")
    .forEach((btn) =>
      btn.addEventListener("click", () => {
        const c = btn.getAttribute("data-currency-button");
        if (c) setCurrency(c);
      })
    );

  // Reward Preview Button
  document
    .getElementById("btn-reward")
    ?.addEventListener("click", handleRewardClick);

  // Investor Button
  document
    .getElementById("btn-investor")
    ?.addEventListener("click", handleInvestorClick);

  // Treasury Button
  document
    .getElementById("btn-treasury")
    ?.addEventListener("click", handleTreasurySimulate);

  // Investor sliders live labels
  updateInvestorSlidersLabels();

  // Nodes
  fetchNodes();
  setInterval(fetchNodes, 10000);

  const btnRefreshNodes = document.getElementById("btn-refresh-nodes");
  if (btnRefreshNodes) {
    btnRefreshNodes.addEventListener("click", (e) => {
      e.preventDefault();
      fetchNodes();
    });
  }

  // Proof-of-Compute feed
  fetchProofs();
  setInterval(fetchProofs, 5000);
});
