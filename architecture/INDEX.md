# Architecture Index

This is the canonical entrypoint for current system architecture. The former monolithic `../architecture.md` now points here for compatibility.

Use this index to choose the narrowest architecture domain file before reading implementation detail.

<!-- architecture-domain-files:start -->
- [Architecture Overview](overview.md) - Global architecture role, principles, and single-path ownership contract.
- [Runtime Lifecycle Architecture](runtime-lifecycle.md) - Runtime readiness, lifecycle ownership, runtime descriptors, and observability contracts.
- [Control Plane Architecture](control-plane.md) - Control-plane progression, system-table ownership, node state vocabulary, and configuration ownership.
- [Runtime Components](runtime-components.md) - Node-local components, replicated services, metadata services, and runtime service owners.
- [PostgreSQL Wire And SQL Compatibility](postgres-wire.md) - PostgreSQL wire service flow, endpoint discovery, SQL compatibility, and planned compatibility extensions.
- [Query Runtime Architecture](query-runtime.md) - Programmatic runtime, query bridge, execution-mode dispatch, callback execution, and movement primitives.
- [Bootstrap And Data Flow](bootstrap.md) - Seed and joining bootstrap, query routing, CDC continuity, and meta-service management flow.
- [Raft, Rebalancing, And Placement](rebalance.md) - Addressing, Raft consensus, rebalancing, storage placement, and message-group assignment.
- [Operational Appendices And Archived Patterns](archived-patterns.md) - Error handling, testing, endpoint sync, and discovery appendix material.
<!-- architecture-domain-files:end -->

## Supporting Documents

- [Current Owner Maps](current-owner-maps.md) - Current concrete owner maps and subsystem ownership detail.
- [System Contract Records](contracts/) - Durable failure-class contracts that bind invariants, owners, models, runtime paths, Quest history, archived trace evidence, and residual evidence.
- [Invariant Registry](contracts/invariants.json) - Machine-readable owner-scoped safety/liveness invariants. **Tier 1** verifies each entry's `formalPredicate` against formal models (`npm run model:invariants` / `model:contracts`). **Tier 2 (live-evidence, default-off)** verifies an entry's optional `liveEvidence` predicate against the running system / a deterministic repro and derives HELD/BREACHED as a fold over the Solver event log — run `LAGRANGE_STANDING_INVARIANTS=true node scripts/solve.js invariants --evaluate`; a BREACH means the doc no longer reflects the system (spec: [`.kiro/specs/standing-invariant-closure/`](../.kiro/specs/standing-invariant-closure/)).
- [Architecture Models](models/) - Architecture-owned executable and structured models that move with owner-boundary architecture changes.
- [Core System Logic Contract](contracts/core-system-logic.md) - Low-resolution core owner-flow contract backed by an architecture-adjacent statechart.
- [Readiness Handoff Liveness Contract](contracts/readiness-handoff-liveness.md) - Startup readiness and handoff temporal contract backed by TLA+.
- [Rolling Restart Rebalancer Handoff Contract](contracts/rolling-restart-rebalancer-handoff.md) - Priority recovery handoff convergence contract and decision-table binding.
- [Active Gate Convergence Contract](contracts/active-gate-convergence.md) - Coupled active-gate/rebalancer invariant contract backed by TLA+ and fast-check models.
- [Quest Lifecycle Contract](contracts/quest-lifecycle.md) - Workflow statechart contract for Quest attempts, findings, closure, and redirect safety.
- [Runtime Grammar Hierarchy](runtime-grammar-hierarchy.md) - Runtime grammar and boundary hierarchy reference.
- [Lagrange Kernel Platform API v0](lagrange-kernel-platform-api-v0.md) - Kernel platform API contract.
- [Lagrange Service Manifest](lagrange-service-manifest.md) - Service manifest format and activation model.
- [Lagrange Service Registry](lagrange-service-registry.md) - Service registry architecture.
- [Lagrange Architecture Diagrams](lagrange_architecture_diagrams.md) - Primary visual architecture references.
- [Lagrange Advanced Architecture Diagrams](lagrange_advanced_architecture_diagrams.md) - Advanced architecture diagrams.

## Future Architecture

- [Activation-Cost-Aware Placement](future/activation-cost-aware-placement.md) - Planned placement-cost architecture.
- [Native Artifact Store](future/native-artifact-store.md) - Planned native artifact store architecture.
- [Metastable Convergence Resilience](future/metastable-convergence-resilience.md) - Rolling-restart non-convergence reframed as metastable failure; three resilience directions + measurement gate.
