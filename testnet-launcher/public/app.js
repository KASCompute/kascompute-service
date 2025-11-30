/******************************************************
 * KASCompute Testnet Dashboard — Final Version
 ******************************************************/

const API_BASE = "/api";

/* ============================================
   USER ACTIVITY → Auto-refresh pausing
============================================ */
let userActive = false;
let userActiveTimeout = null;

function markUserActive() {
    userActive = true;
    clearTimeout(userActiveTimeout);
    userActiveTimeout = setTimeout(() => {
        userActive = false;
    }, 10000); // 10 Sekunden Pause
}

/* ============================================
   HELPERS
============================================ */
async function fetchJson(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function formatNumber(n) {
    if (isNaN(n)) return "-";
    return n.toLocaleString();
}

/* =======================================================
   UNIFIED CHART CONFIG (BEIDE CHARTS → Einheitliche Optik)
======================================================= */
function buildUnifiedChartConfig(labels, datasets, yTitle) {
    return {
        type: "line",
        data: {
            labels,
            datasets: datasets.map(ds => ({
                ...ds,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
                fill: false,    // Variante C: keine Fill
                borderColor: "rgba(0,227,192,0.85)",
                backgroundColor: "rgba(0,227,192,0.35)"
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: "top" }
            },
            scales: {
                x: { display: true, grid: { display: false } },
                y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.06)" } }
            }
        }
    };
}

/* ============================================
   GLOBAL STATE
============================================ */
let emissionState = null;
let economics = null;

let econPrice = 0;
let econInvestor = 0;
let econTreasury = 0;
let econMarketCap = 0;

let currentCurrency = "KCT";
let investorChartInstance = null;
let treasuryChartInstance = null;

let lastNodes = [];
let lastProofs = [];

/* ============================================
   TOKEN ECONOMICS RENDER
============================================ */
function renderEconomics() {
    if (!economics) return;

    let symbol = "";
    let fx = 1;

    if (currentCurrency === "USD") { symbol = "$"; fx = 1; }
    if (currentCurrency === "EUR") { symbol = "€"; fx = 0.92; }
    if (currentCurrency === "KCT") { symbol = "KCT"; }

    if (currentCurrency === "KCT") {
        setText("kct-price", "1 KCT");
        setText("market-cap", formatNumber(economics.circulating_supply_kct) + " KCT");
        setText("investor-value", formatNumber(econInvestor / econPrice) + " KCT");
        setText("treasury-value", formatNumber(economics.treasury_balance_kct) + " KCT");
        return;
    }

    setText("kct-price", symbol + (econPrice * fx).toFixed(4));
    setText("market-cap", symbol + (econMarketCap * fx).toLocaleString());
    setText("investor-value", symbol + (econInvestor * fx).toLocaleString());
    setText("treasury-value", symbol + (econTreasury * fx).toLocaleString());
}

/* ============================================
   ECON SLIDERS UPDATE
============================================ */
function recomputeEconomics() {
    if (!economics) return;

    const sPrice = parseFloat(document.getElementById("kct-price-slider").value);
    const sInvMult = parseFloat(document.getElementById("investor-multiplier-slider").value);
    const sTreMult = parseFloat(document.getElementById("treasury-multiplier-slider").value);

    document.getElementById("kct-price-slider-value").textContent = sPrice.toFixed(4) + " $";
    document.getElementById("investor-multiplier-slider-value").textContent = "x" + sInvMult.toFixed(2);
    document.getElementById("treasury-multiplier-slider-value").textContent = "x" + sTreMult.toFixed(2);

    econPrice = sPrice;
    econMarketCap = economics.circulating_supply_kct * econPrice;
    econInvestor = econMarketCap * sInvMult;
    econTreasury = economics.treasury_balance_kct * econPrice * sTreMult;

    renderEconomics();
}

/* ============================================
   REWARD PREVIEW
============================================ */
function initRewardPreview() {
    const slider = document.getElementById("month");
    const label = document.getElementById("month-label");

    slider.addEventListener("input", () => {
        markUserActive();
        label.textContent = slider.value;
    });

    document.getElementById("btn-reward").addEventListener("click", () => {
        if (!emissionState) {
            setText("reward-summary", "Emission state not loaded.");
            return;
        }

        const m = parseInt(slider.value);
        const decay = emissionState.monthly_decay_pct / 100;
        const factor = 1 - decay;

        const rewardThisMonth = emissionState.current_block_reward_kct * Math.pow(factor, m - 1);
        const blocks = 30 * 24 * 60;
        const monthlyEmission = blocks * rewardThisMonth;

        const summary =
            `Month m = ${m}\n` +
            `Block reward: ${rewardThisMonth.toFixed(4)} KCT\n` +
            `Emission this month: ${monthlyEmission.toLocaleString()} KCT`;

        setText("reward-summary", summary);
        document.getElementById("reward-json").textContent = JSON.stringify({
            month: m,
            block_reward: rewardThisMonth,
            monthly_emission: monthlyEmission
        }, null, 2);
    });
}

/* ============================================
   INVESTOR VALUE FLOW CHART
============================================ */
function initInvestor() {
    document.getElementById("btn-investor").addEventListener("click", () => {
        markUserActive();

        const fee = parseFloat(document.getElementById("fee").value);
        const share = parseFloat(document.getElementById("investor").value);
        const years = parseInt(document.getElementById("years").value);
        const growth = parseFloat(document.getElementById("growth").value);
        const discount = parseFloat(document.getElementById("discount").value);

        const cf = [];
        let npv = 0;
        const base = fee * share;

        for (let t = 1; t <= years; t++) {
            const c = base * Math.pow(1 + growth, t - 1);
            cf.push(c);
            npv += c / Math.pow(1 + discount, t);
        }

        document.getElementById("investor-summary").textContent =
            `Total cashflow: ${cf.reduce((a,b)=>a+b,0).toFixed(2)} KCT\nNPV: ${npv.toFixed(2)} KCT`;

        const labels = cf.map((_, i) => `Year ${i + 1}`);

        const config = buildUnifiedChartConfig(labels, [{
            label: "Cashflow (KCT/year)",
            data: cf
        }], "KCT");

        const ctx = document.getElementById("investorChart").getContext("2d");

        if (!investorChartInstance)
            investorChartInstance = new Chart(ctx, config);
        else {
            investorChartInstance.data = config.data;
            investorChartInstance.options = config.options;
            investorChartInstance.update();
        }
    });
}

/* ============================================
   TREASURY VESTING CHART
============================================ */
function initTreasury() {
    document.getElementById("btn-treasury").addEventListener("click", () => {
        markUserActive();

        const total = parseFloat(document.getElementById("treasury-total").value);
        const years = parseInt(document.getElementById("treasury-years").value);
        const cliff = parseInt(document.getElementById("treasury-cliff").value);

        const months = years * 12;
        const vestMonths = months - cliff;
        const monthly = total / vestMonths;

        const released = [];
        const cumulative = [];

        let cum = 0;
        for (let m = 0; m < months; m++) {
            let rel = 0;
            if (m >= cliff && cum < total) {
                rel = monthly;
                cum += rel;
                if (cum > total) {
                    rel -= (cum - total);
                    cum = total;
                }
            }
            released.push(rel);
            cumulative.push(cum);
        }

        document.getElementById("treasury-summary").textContent =
            `Treasury total: ${formatNumber(total)} KCT\nMonthly release: ${monthly.toFixed(2)} KCT`;

        const labels = released.map((_, i) => `M${i + 1}`);

        const config = buildUnifiedChartConfig(labels, [
            { label: "Monthly release (KCT)", data: released },
            { label: "Cumulative vested (KCT)", data: cumulative }
        ], "KCT");

        const ctx = document.getElementById("treasuryChart").getContext("2d");

        if (!treasuryChartInstance)
            treasuryChartInstance = new Chart(ctx, config);
        else {
            treasuryChartInstance.data = config.data;
            treasuryChartInstance.options = config.options;
            treasuryChartInstance.update();
        }
    });
}

/* ============================================
   ACTIVE NODES
============================================ */
function updateActiveNodes(nodes) {
    lastNodes = nodes;

    setText("node-count", nodes.length);

    const list = document.getElementById("node-list");
    list.innerHTML = "";

    if (nodes.length === 0) {
        const li = document.createElement("li");
        li.className = "node-empty";
        li.textContent = "Waiting for heartbeats…";
        list.appendChild(li);
        return;
    }

    nodes.forEach(n => {
        const li = document.createElement("li");
        li.className = "node-item";
        const lastSeen = n.last_seen_unix ? new Date(n.last_seen_unix * 1000).toLocaleString() : "-";
        li.innerHTML = `
            <div class="node-id">${n.node_id}</div>
            <div class="node-meta">${n.compute_profile || "-"} • last seen ${lastSeen}</div>
        `;
        list.appendChild(li);
    });
}

/* ============================================
   PROOF FEED (with limit dropdown)
============================================ */
function updateProofs(proofs) {
    lastProofs = proofs;

    const limit = parseInt(document.getElementById("poc-limit").value);
    const list = proofs.slice(0, limit);

    const tbody = document.getElementById("proofs-body");
    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="poc-empty-row">Waiting for proofs…</td></tr>`;
        return;
    }

    list.forEach(p => {
        const t = p.timestamp_unix ? new Date(p.timestamp_unix * 1000).toLocaleString() : "-";
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${p.node_id}</td>
            <td>${p.job_id}</td>
            <td>${formatNumber(p.work_units)}</td>
            <td>${(p.estimated_reward_kct).toFixed(6)}</td>
            <td>${t}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ============================================
   NODE LEADERBOARD (slider)
============================================ */
function updateLeaderboard() {
    const limit = parseInt(document.getElementById("lb-limit").value);
    document.getElementById("lb-limit-label").textContent = limit;

    const tbody = document.getElementById("leaderboard-body");
    tbody.innerHTML = "";

    const stats = new Map();

    lastProofs.forEach(p => {
        const id = p.node_id;
        if (!stats.has(id)) {
            stats.set(id, { id, proofs: 0, wu: 0, reward: 0 });
        }
        const s = stats.get(id);
        s.proofs++;
        s.wu += p.work_units;
        s.reward += p.estimated_reward_kct;
    });

    const rows = Array.from(stats.values()).sort((a,b) => b.reward - a.reward).slice(0, limit);

    if (rows.length === 0) {
        tbody.innerHTML = `<tr class="lb-empty-row"><td colspan="5">Waiting for node activity…</td></tr>`;
        return;
    }

    rows.forEach((r, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${r.id}</td>
            <td>${(lastNodes.find(n => n.node_id === r.id)?.compute_profile) || "-"}</td>
            <td>${r.proofs}</td>
            <td>${formatNumber(r.wu)} / ${r.reward.toFixed(4)} KCT</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ============================================
   DASHBOARD REFRESH
============================================ */
async function refreshDashboard() {
    try {
        if (!userActive) {
            const data = await fetchJson("/state");

            emissionState = data.emission;
            economics = data.economics;

            econPrice = economics.kct_price_usd;
            econMarketCap = economics.market_cap_usd;
            econInvestor = economics.investor_value_usd;
            econTreasury = economics.treasury_value_usd;

            renderEconomics();
            updateActiveNodes(data.active_nodes);
            updateProofs(data.proofs_recent);
            updateLeaderboard();
        }

        const apiEl = document.getElementById("api-status");
        apiEl.textContent = "API online";
        apiEl.classList.add("pill-active");
    }
    catch {
        const apiEl = document.getElementById("api-status");
        apiEl.textContent = "API offline";
        apiEl.classList.remove("pill-active");
    }
}

/* ============================================
   INIT
============================================ */
document.addEventListener("DOMContentLoaded", () => {

    initRewardPreview();
    initInvestor();
    initTreasury();

    document.getElementById("poc-limit").addEventListener("change", () => {
        markUserActive();
        updateProofs(lastProofs);
    });

    document.getElementById("lb-limit").addEventListener("input", () => {
        markUserActive();
        updateLeaderboard();
    });

    document.getElementById("kct-price-slider").addEventListener("input", () => {
        markUserActive();
        recomputeEconomics();
    });
    document.getElementById("investor-multiplier-slider").addEventListener("input", () => {
        markUserActive();
        recomputeEconomics();
    });
    document.getElementById("treasury-multiplier-slider").addEventListener("input", () => {
        markUserActive();
        recomputeEconomics();
    });

    refreshDashboard();
    setInterval(() => {
        if (!userActive) refreshDashboard();
    }, 8000);
});
