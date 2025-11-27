# ==== BUILDER STAGE ====
FROM rustlang/rust:nightly-slim AS builder

WORKDIR /app

# Install OpenSSL and pkg-config for Rust crates that need them
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    build-essential

COPY . .

RUN rm -f Cargo.lock || true

RUN cargo build --release


# ==== RUNTIME STAGE ====
FROM debian:bullseye-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/kascompute-service /app/kascompute-service

ENV PORT=8080
EXPOSE 8080

CMD ["/app/kascompute-service"]
