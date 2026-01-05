# KASCompute Protocol v1

**Status:** Stable · Testnet
**Protocol ID:** `kascompute-v1`
**Version:** `1.0.0`
**Last Updated:** 2026

---

## 1. Introduction

KASCompute is a decentralized compute protocol designed to execute off-chain computational work and produce **deterministic, verifiable Proof-of-Compute** results.

Protocol v1 defines the **minimal, stable core** of the KASCompute network.
It intentionally excludes economic, governance, and advanced execution layers in order to preserve **clarity, auditability, and long-term extensibility**.

> **Protocol v1 is not a product.
> It is a contract.**

---

## 2. Design Principles

Protocol v1 is built on the following principles:

* **Determinism over performance**
* **Verifiability over optimization**
* **Stability over feature velocity**
* **Protocol guarantees over implementation details**

Anything not explicitly defined in this document is considered **out of scope** for v1.

---

## 3. Scope Definition

### Included in Protocol v1

* CPU-based deterministic compute jobs
* Job distribution and execution
* Proof-of-Compute generation
* Server-side proof verification
* Node registration and heartbeat tracking
* Time-window-based network metrics

### Explicitly Excluded from Protocol v1

* GPU / AI / ML workloads
* Token rewards or payments
* On-chain settlement
* Governance or DAO mechanisms
* Slashing or economic reputation
* Zero-knowledge or cryptographic extensions

These features are reserved for **future protocol versions**.

---

## 4. Network Roles

### Coordinator

The Coordinator is the authoritative entity in Protocol v1.

Responsibilities:

* Job creation and dispatch
* Proof verification
* Metrics aggregation
* Network state validation

In v1, the Coordinator acts as the **single source of truth**.

---

### Node (Worker)

A Node is a participant that performs compute work.

Responsibilities:

* Register with the network
* Request and execute jobs
* Produce Proof-of-Compute
* Send periodic heartbeats

Nodes are **stateless with respect to global consensus** in v1.

---

## 5. Core Data Structures (Protocol Contract)

### 5.1 Job Object

```json
{
  "job_id": "uuid-v4",
  "job_type": "cpu_sha256",
  "payload": "base64",
  "difficulty": 50000,
  "created_at": 1700000000
}
```

**Invariants**

* Payload is immutable
* Difficulty is part of proof validation
* A job may be solved only once

---

### 5.2 Proof Object

```json
{
  "job_id": "uuid-v4",
  "node_id": "node_public_key",
  "result_hash": "hex",
  "nonce": 912381,
  "compute_ms": 312,
  "proof_hash": "sha256(job_id + node_id + result_hash + nonce + compute_ms)"
}
```

A proof is considered **valid** if all of the following hold:

1. The referenced job exists
2. Payload integrity is preserved
3. Difficulty requirement is satisfied
4. The computation is deterministically reproducible
5. The proof hash is correct
6. Submission occurs within the allowed time window

---

### 5.3 Node Object

```json
{
  "node_id": "public_key",
  "protocol": "kascompute-v1",
  "node_version": "1.0.0",
  "capabilities": ["cpu"],
  "last_seen": 1700000033,
  "status": "active"
}
```

---

## 6. API Contract (Frozen for v1)

### Required Endpoints

```http
GET  /api/v1/health
GET  /api/v1/metrics

POST /api/v1/node/register
POST /api/v1/node/heartbeat

POST /api/v1/job/request
POST /api/v1/proof/submit
```

### API Guarantees

* `/api/v1/*` endpoints will never introduce breaking changes
* New fields may only be added as optional
* Breaking changes require a new major protocol version

---

## 7. Proof-of-Compute Definition

Proof-of-Compute is the cryptographic and deterministic proof that a specific computation was executed according to protocol rules.

Properties:

* Deterministic
* Reproducible
* Time-measurable
* Independent of node location

**Economic interpretation is intentionally excluded from Protocol v1.**

---

## 8. Timing & Windows

* Heartbeat window: **90 seconds**
* Metrics aggregation window: **300 seconds**
* Job timeout: Coordinator-defined
* Proof replay: strictly prohibited

---

## 9. Security Baseline (v1)

Protocol v1 enforces the following minimum security guarantees:

* Rate limiting on proof submission
* Single-solution enforcement per job
* Unique node identities
* No secrets stored client-side
* Full server-side validation

---

## 10. Versioning & Upgrade Policy

### Versioning Rules

* `v1.x.x` → backward compatible
* `v2.0.0` → breaking changes allowed

### Upgrade Guarantee

> **Protocol v1 remains valid indefinitely.**
> Future functionality must extend, not invalidate, this version.

---

## 11. Release Status

Protocol v1 may be declared **live (Testnet)** once:

* Continuous operation exceeds 24 hours
* No proof inconsistencies are observed
* API contract remains unchanged
* This documentation is publicly available

Approved statement:

> **“KASCompute Protocol v1 is live on Testnet.”**

---

## 12. Final Note

Protocol v1 establishes the **foundation layer** of KASCompute.
All future expansion — economic, computational, or cryptographic — is built **on top of this contract**, not inside it.

