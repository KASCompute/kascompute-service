# ------------ BUILDER STAGE ------------
FROM rust:1.75 AS builder
WORKDIR /app

# Vollen Code kopieren
COPY . .

# Falls ein moderner Cargo.lock Probleme macht: einfach im Container löschen
RUN rm -f Cargo.lock || true

# Release-Build deines Services
RUN cargo build --release

# ------------ RUNTIME STAGE ------------
FROM debian:bullseye-slim
WORKDIR /app

# Minimale System-Pakete
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Binary rüberkopieren (Name muss zu deinem Package passen!)
COPY --from=builder /app/target/release/kascompute-service /app/kascompute-service

ENV PORT=8080
EXPOSE 8080

CMD ["/app/kascompute-service"]
