# Changelog

All notable changes to Lagrange are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is `0`, the public surface (SQL dialect, wire
protocols, admin CLI, cluster membership behaviour) may change between minor
releases without a compatibility guarantee.

## [Unreleased]

## [0.1.0] — 2026-07-02

First tagged release. **Experimental / alpha** — Lagrange is a research-grade
distributed SQL database and compute-near-data runtime. It is substantial and
extensively tested, but not production-hardened; see _Known limitations_ below.

### Added
- Distributed SQL over Raft-replicated partitions with a shared execution path.
- Compute-near-data runtime: distributed functions and services co-located with
  the partitions that own the relevant data.
- Unified rebalancer with load-aware placement; runtime services are first-class
  rebalancer entities (a partition is a service).
- SWIM/Lifeguard failure detection, shipped default-on and unconditional.
- Postgres wire (`pgwire`) SQL endpoint, registered as a managed service (a bare
  node exposes 8080/8081/8082; the SQL endpoint is started on demand, not at boot).
- Deterministic/directed testing substrate: virtual clock, seeded RNG, and PCT
  scheduling for reproducible convergence and safety investigations.
- Distroless Docker image and single-executable (SEA) builds.

### Changed
- Package version set to `0.1.0` (was an internal `1.0.0`); user-facing
  `--version` output (admin CLI and node entrypoint) now reports the release
  version, guarded against drift by a test.

### Fixed
- Raft safety: same-index stale-commit (CL-040), vote double-vote TOCTOU
  (CL-041), and empty-log-term masquerade (CL-042).
- Node restart with a new IP: stale-seed-vs-canonical reconciliation and
  keepalive/pong severing on transport re-resolution.
- Durable node identity: a node started without an explicit `NODE_ID` now
  restores its persisted identity from the data directory on restart instead
  of minting a fresh UUID and refusing to start over its own durable state
  (identity mismatch). Enables orchestrators (Kubernetes, plain restarts) to
  restart nodes onto their volumes without pinning `NODE_ID`.
- SEA single-executable boot: dynamic imports with const-variable specifiers
  were silently left out of the esbuild bundle, so the binary could never
  boot the full system (`ERR_MODULE_NOT_FOUND`); the entrypoint and SQL
  runtime composition imports are now literal and bundled.
- Dockerfile `EXPOSE` corrected to the real listener set 8080/8081/8082
  (nothing listens on the previously exposed 9080).

### Known limitations
- **Rolling-restart convergence is a statistical property, not a bounded-time
  guarantee.** Under a rolling restart the cluster settles into either a
  convergent basin or a slow/limit-cycle basin. *Eventual* stabilization is
  proven for the sole residual head (a monotone Φ-fixpoint over the real
  rebalancer kernel), but *bounded-time* convergence within any fixed window is
  a latency tail near its statistical floor. The measured per-run scenario-PASS
  rate is ≈25–33%; the release does not promise convergence by a specific
  deadline. See `docs/convergence-donewhen-metric.md`.
- **Safety is the hard floor and is never relaxed.** Every certified run holds
  the safety invariants (no data corruption, no unexpected node exit, no
  blind/stale oracle reads); convergence *latency* is the residual, not
  correctness.
- No autoscaler for load; scaling is operator-driven.
- Alpha surface: SQL coverage, wire protocols, and admin/CLI behaviour may
  change between `0.x` releases without migration guarantees.

[Unreleased]: https://codeberg.org/psvensson/lagrange/compare/v0.1.0...HEAD
[0.1.0]: https://codeberg.org/psvensson/lagrange/releases/tag/v0.1.0
