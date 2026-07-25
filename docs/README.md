---
audience: human
---

# Documentation Index

Guides for running, inspecting, and administering a Lagrange cluster. Material
for developing Lagrange itself lives in the clearly marked subdirectories at
the end of this page — you do not need any of it to use or operate the system.

## Operating Lagrange

- **Service portability status:** the authoritative runtime matrix is
  [`docs/service-portability-capabilities.json`](service-portability-capabilities.json).
- [wasm-services-user-guide.md](wasm-services-user-guide.md) — supported WASM
  installation, Binding, Cell lifecycle, and internal command surfaces
- [component-distribution.md](component-distribution.md) — how components are
  distributed across nodes
- [admin-api-reference.md](admin-api-reference.md) — admin API actions,
  diagnostics endpoints, and CLI message contract
- [admin-test-run-landing.md](admin-test-run-landing.md) — admin test-run
  landing page
- [bootstrap-readiness-probes.md](bootstrap-readiness-probes.md) — readiness
  probes during cluster bootstrap
- [listener-port-model.md](listener-port-model.md) — REST, admin, and transport
  listener configuration and validation
- [storage-capacity-operations.md](storage-capacity-operations.md) — storage
  capacity operations
- [latency-topology-operations.md](latency-topology-operations.md) — latency
  and topology operations
- [runtime-resource-diagnostics.md](runtime-resource-diagnostics.md) — runtime
  resource diagnostics
- [adaptive-timing-resource-diagnostics-runbook.md](adaptive-timing-resource-diagnostics-runbook.md)
  — operator runbook for adaptive timing diagnostics
- [distributed-playback-viewer.md](distributed-playback-viewer.md) — replaying
  and viewing distributed test runs

For installing and starting a node in the first place, see the root
[README.md](../README.md); for the architecture, start at
[architecture/INDEX.md](../architecture/INDEX.md).

## Current Internal Contracts

Current internal contracts whose paths are pinned by scripts or baselines:

- [deterministic-directed-testing-plan.md](deterministic-directed-testing-plan.md)
  — deterministic in-process testing substrate map
- [deterministic-repro-tier.md](deterministic-repro-tier.md) — deterministic
  reproduction contract
- [convergence-donewhen-metric.md](convergence-donewhen-metric.md) —
  current convergence certification contract

## Subdirectories By Audience

Zoning rules: [`steering/audience-boundary.md`](steering/audience-boundary.md).

- [development/](development/README.md) — development-process documents for
  people working on Lagrange itself, including the Solver operator runbook
- [steering/](steering/) — agent steering: canonical rule sources and the
  generated compact packs (agents enter via the root [AGENTS.md](../AGENTS.md))
- [specs/](specs/) — machine-checked decision tables and statecharts used by
  the model-contract gates
- [case-studies/](case-studies/) — durable investigation case studies cited by
  steering and Quest history
- [evidence/](evidence/) — recorded evidence artifacts referenced by Solver
  history
