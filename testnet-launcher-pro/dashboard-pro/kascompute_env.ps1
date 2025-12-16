# =========================
# KASCompute PRO ENV
# =========================

$env:API_BASE = "https://kascompute-testnet.onrender.com"

# identity
$env:NODE_ID = "kct-node-001"
$env:PUBLIC_KEY_HEX = "deadbeef00112233445566778899aabb"

# node heartbeat timing
$env:HEARTBEAT_SEC = "10"

# miner polling timing
$env:POLL_SEC = "2"

# workloads: sim (light) | hash (real CPU)
$env:WORKLOAD_MODE = "sim"
$env:HASH_ITERS_PER_WU = "2"
$env:HASH_MAX_ITERS = "200000"

# client version shown in proofs
$env:CLIENT_VERSION = "miner-pro/1.0.0"

# optional country tag (if backend stores it)
$env:COUNTRY = "DE"

# optional: allow miner to do one-time registration check (community convenience)
# set "1" if you want miner to auto-register once; keep "0" for clean separation.
$env:MINER_AUTO_REGISTER = "0"
