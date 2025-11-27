# BUILDER IMAGE
FROM rust:1.75 AS builder
WORKDIR /app

# Copy manifest files
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Pre-build for caching
RUN cargo build --release || true

# Copy full source
COPY . .

# Build your real binary
RUN cargo build --release

# RUNTIME IMAGE
FROM debian:bullseye-slim
WORKDIR /app

# Install required system libraries (important!)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/kascompute-service /app/kascompute-service

ENV PORT=8080
EXPOSE 8080

CMD ["/app/kascompute-service"]
