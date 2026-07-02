# Documentation Index

This directory mixes two audiences. If you are here to **run or operate
Lagrange**, everything you need is in the first section; the rest is internal
material for people (and agents) developing the system itself.

## Operating Lagrange

Guides for running, inspecting, and administering a cluster:

- [wasm-services-user-guide.md](wasm-services-user-guide.md) — build, upload,
  and run distributed WASM services (the main user guide)
- [component-distribution.md](component-distribution.md) — how components are
  distributed across nodes
- [admin-migration-guide.md](admin-migration-guide.md) — admin API / CLI
  migration guide
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

## Internal: development process, planning, and design notes

Working documents for developing Lagrange itself — process plans, design
specs, and the agent/Solver workflow. Not needed to use or operate the
system:

- [solver-runbook.md](solver-runbook.md) — operator quickstart for the Solver
  Quest workflow (the repo's unit of work)
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
- [autonomy-and-parallel-defaults-plan.md](autonomy-and-parallel-defaults-plan.md)
  — autonomy and parallelism defaults plan
- [llm-dev-process-improvement-plan.md](llm-dev-process-improvement-plan.md)
  — LLM dev-process improvement plan
- [llm-ergonomics-improvement-plan.md](llm-ergonomics-improvement-plan.md)
  — LLM ergonomics improvement plan
- [workflow-improvement-plan.md](workflow-improvement-plan.md) — workflow
  improvement plan

Subdirectories:

- [steering/](steering/) — canonical steering sources and the generated
  compact packs under `steering/llm/` (entry point: root
  [AGENTS.md](../AGENTS.md))
- [specs/](specs/) — machine-checked decision tables and statecharts used by
  the model-contract gates
