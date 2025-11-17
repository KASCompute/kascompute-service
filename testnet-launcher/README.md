# KCT Testnet Launcher (Axum API)
Startet eine kleine API auf Basis der `genesis.json`.

## Run
1) Genesis bauen:
```powershell
cd genesis-builder
cargo run --release
```
2) Launcher starten:
```powershell
cd ..\testnet-launcher
# (optional) GENESIS_PATH anpassen, sonst default: ..\genesis-builder\genesis.json
$env:PORT=8080
cargo run --release
```

## Endpunkte
- `GET /health` → `"ok"`
- `POST /reward/preview` with JSON `{"month":12}`
- `GET /treasury/vested?t_years=1.5`
- `GET /investor/value_flow?fee_annual=2000000&years=10&investor_pct=0.25&growth=0&discount=0`

CORS ist offen (für dein lokales Frontend).
