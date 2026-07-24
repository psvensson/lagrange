---
audience: human
---

# Documentation Index

Guides for running, inspecting, and administering a Lagrange cluster. Material
for developing Lagrange itself lives in the clearly marked subdirectories at
the end of this page — you do not need any of it to use or operate the system.

## Operating Lagrange

- **Service portability status:** the current runtime matrix is
  [`docs/service-portability-capabilities.json`](service-portability-capabilities.json);
  target architecture is not an implemented install path.
- [wasm-services-user-guide.md](wasm-services-user-guide.md) — current callback
  lifecycle rehearsal plus clearly labelled target WASM service contracts
- [component-distribution.md](component-distribution.md) — how components are
  distributed across nodes
- [admin-api-reference.md](admin-api-reference.md) — admin API actions,
  diagnostics endpoints, and CLI message contract
- [admin-test-run-landing.md](admin-test-run-landing.md) — admin test-run
  landing page
- [bootstrap-readiness-probes.md](bootstrap-readiness-probes.md) — readiness
  probes during cluster bootstrap
- [storage-capacity-operations.md](storage-capacity-operations.md) — storage
  capacity operations
- [latency-topology-operations.md](latency-topology-operations.md) — latency
  and topology operations
- [runtime-resource-diagnostics.md](runtime-resource-diagnostics.md) — runtime
  resource diagnostics
- [adaptive-timing-resource-diagnostics-runbook.md](adaptive-timing-resource-diagnostics-runbook.md)
  — operator runbook for adaptive timing diagnostics
- [runtime-ownership-rollout-runbook.md](runtime-ownership-rollout-runbook.md)
  — operator runbook for the runtime ownership rollout
- [distributed-playback-viewer.md](distributed-playback-viewer.md) — replaying
  and viewing distributed test runs

For installing and starting a node in the first place, see the root
[README.md](../README.md); for the architecture, start at
[architecture/INDEX.md](../architecture/INDEX.md).

## Design Specs (internal, path-pinned)

Design documents for the system's internals. They stay at this level because
scripts and baselines reference their paths:

- [deterministic-directed-testing-plan.md](deterministic-directed-testing-plan.md)
  — deterministic in-process testing substrate plan
- [deterministic-repro-tier.md](deterministic-repro-tier.md) — deterministic
  reproduction tier design
- [admission-decision-model.md](admission-decision-model.md) — admission
  decision model design notes
- [convergence-donewhen-metric.md](convergence-donewhen-metric.md) —
  convergence done-when metric design
- [runtime-unification-and-modularization-spec.md](runtime-unification-and-modularization-spec.md)
  — runtime unification and modularization spec

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
- [reviews/](reviews/) — dated point-in-time work reviews
- [evidence/](evidence/) — recorded evidence artifacts referenced by Solver
  history
