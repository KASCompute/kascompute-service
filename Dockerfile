# --------- Build-Stage (Rust) ----------
# Nimm eine aktuelle Rust-Version, die edition2024 versteht
FROM rust:latest AS builder

WORKDIR /app

# 1) Cargo-Dateien kopieren
COPY Cargo.toml Cargo.lock ./

# 2) Dummy main.rs für schnellen Dep-Cache
RUN mkdir -p src && echo "fn main() {}" > src/main.rs

# 3) Abhängigkeiten vorbauen (Cache)
RUN cargo build --release || true

# 4) Jetzt den echten Code kopieren
COPY . .

# 5) Release-Build für DEINEN Webserver
RUN cargo build --release --bin kascompute-service

# --------- Runtime-Stage (klein, ohne Rust-Toolchain) ----------
FROM debian:bullseye-slim

WORKDIR /app

# benötigte libs für Rust-Binary
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# fertiges Binary aus dem Builder holen
COPY --from=builder /app/target/release/kascompute-service /app/kascompute-service

# Port (Railway setzt $PORT) – dein Code liest PORT env
ENV PORT=8080
EXPOSE 8080

# Start-Kommando
CMD ["/app/kascompute-service"]
