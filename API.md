# KASCompute API Documentation

Version: **v0.1 – Testnet Tools**  
Service: **KCT Emission Engine & Live Tokenomics Dashboard**

The KASCompute service exposes a small, focused HTTP API for:

- previewing the KCT emission schedule,
- retrieving the full monthly emission curve,
- simulating investor cashflows after the mining phase,
- checking service health.

All endpoints currently serve **read‑only simulation data** based on your KCT token model.

---

## 1. Base URLs

### Local (development)

```text
http://127.0.0.1:8080
```

### Production (Railway – current testnet tools)

```text
https://kascompute-service-production.up.railway.app
```

In this document, we’ll use `/` paths.  
To call them, prepend the correct base URL, e.g.:

```text
GET https://kascompute-service-production.up.railway.app/health
```

---

## 2. Response format

All JSON endpoints use:

- **Content-Type:** `application/json; charset=utf-8`
- **Encoding:** UTF‑8
- **Error format (generic):**

```json
{
  "error": "human-readable error message"
}
```

If an endpoint is unavailable, you will receive a standard HTTP status code (`4xx` or `5xx`).

---

## 3. Health Check

Simple liveness check for monitoring or external integrations.

### Request

```http
GET /health
```

### Response (example)

```json
{
  "status": "ok"
}
```

Use this endpoint for uptime monitoring or to verify that the service is running before calling other endpoints.

---

## 4. Reward Preview

Returns the simulated **block reward** for a given month `m` based on the KCT emission model.

Model parameters:

- Start reward: **200 KCT / block**
- Monthly decay: **1%**
- Duration: **168 months (~14 years)**

Mathematical form:

```text
R(m) = R₀ · (0.99)^(m - 1)
R₀ = 200 KCT
1 ≤ m ≤ 168
```

### Request

```http
POST /reward/preview
Content-Type: application/json
```

Body:

```json
{
  "month": 12
}
```

- `month` (integer, required): Month index in the emission schedule  
  - valid range: `1` – `168`

### Successful Response (example)

```json
{
  "month": 12,
  "block_reward_kct": 178.48,
  "note": "KCT emission preview for month 12 (start 200 KCT, 1% monthly decay over 14 years)."
}
```

### Error Responses

- `400 Bad Request` – invalid or missing `month`
- `422 Unprocessable Entity` – month outside valid emission window

Example:

```json
{
  "error": "month must be between 1 and 168"
}
```

---

## 5. Monthly Emission Curve

Returns the **full emission curve** from month `1` to `168` based on the same KCT model.

### Request

```http
GET /emission/monthly
```

No parameters.

### Successful Response (example)

```json
[
  { "month": 1, "block_reward_kct": 200.0 },
  { "month": 2, "block_reward_kct": 198.0 },
  { "month": 3, "block_reward_kct": 196.02 },
  ...,
  { "month": 168, "block_reward_kct": 37.33 }
]
```

Each entry describes the monthly block reward **after** applying the 1% monthly decay.

---

## 6. Investor Value Flow (Post‑Mining)

Simulates a simplified **post‑mining cashflow** model for potential investors.  
This is a pure **simulation tool** – it does **not** execute real transactions or represent financial advice.

### Request

```http
GET /investor/value_flow?fee_annual=100000&investor_pct=0.1&years=20&growth=0.1&discount=0.05
```

### Query Parameters

All parameters are optional, but some combinations may be invalid. Defaults are defined in the backend.

- `fee_annual` (number)  
  Annual fee volume flowing through the KASCompute network (in KCT, KAS or USD-equivalent depending on interpretation).

- `investor_pct` (number, 0–1)  
  Share of fees attributed to the investor (e.g. `0.1` = 10%).

- `years` (integer)  
  Horizon of the simulation in years (e.g. `20`).

- `growth` (number)  
  Expected annual growth rate of the fee volume (e.g. `0.1` = 10% p.a.).

- `discount` (number)  
  Discount rate used for NPV (e.g. `0.05` = 5% p.a.).

### Successful Response (example)

```json
{
  "years": 20,
  "fee_annual_start": 100000,
  "investor_pct": 0.1,
  "growth": 0.1,
  "discount": 0.05,
  "cashflows": [
    { "year": 1,  "cash_kct": 10000.0, "discounted_kct": 9523.81 },
    { "year": 2,  "cash_kct": 11000.0, "discounted_kct": 9970.40 },
    { "year": 3,  "cash_kct": 12100.0, "discounted_kct": 10440.43 }
    // ...
  ],
  "npv_investor_kct": 98765.43
}
```

The exact field names and structure may evolve as the model is refined, but the endpoint remains focused on post‑mining cashflow simulation.

### Error Responses

- `400 Bad Request` – invalid numeric parameters (negative years, invalid percentage, etc.)
- `422 Unprocessable Entity` – internal validation failure

Example:

```json
{
  "error": "years must be a positive integer"
}
```

---

## 7. Rate limits & usage

There are currently **no enforced rate limits** on the public testnet service, but this may change in the future.

Guidelines:

- Cache responses for static queries (e.g. `/emission/monthly`).  
- Avoid aggressive polling – the emission model is deterministic and does not change per request.

If hard rate limits are introduced, they will be documented here.

---

## 8. Versioning

Current status: **Experimental / Testnet**

Breaking changes can still occur. When the API stabilizes, a versioned path such as `/v1/...` may be introduced.

---

## 9. Contact & Contributions

- **GitHub:** https://github.com/KASCompute/kascompute-service  
- **Project:** KASCompute – decentralized compute layer on top of Kaspa

Issues and pull requests are welcome for:

- bug reports,
- documentation improvements,
- new simulation endpoints that fit the scope of the project.
