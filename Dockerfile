# -----------------------------------------
# 1) Build stage mit moderner Rust-Version
# -----------------------------------------
FROM rust:1.75 AS builder

# Arbeitsverzeichnis setzen
WORKDIR /app

# Cargo Dateien zuerst kopieren (für Dependency-Cache)
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs

# Dependencies vorab kompilieren (Cache bleibt gültig)
RUN cargo build --release || true

# Jetzt gesamten Code kopieren
COPY . .

# Release-Build des echten Projekts
RUN cargo build --release


# -----------------------------------------
# 2) Runtime stage - kleines, schnelles Image
# -----------------------------------------
FROM debian:bullseye-slim
WORKDIR /app

# Das fertige Rust-Binary aus dem Builder holen
COPY --from=builder /app/target/release/kascompute-service /app/kascompute-service

# Railway nutzt automatisch den $PORT Env-Var
ENV PORT=8080
EXPOSE 8080

# Start-Befehl
CMD ["/app/kascompute-service"]
