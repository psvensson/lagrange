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
- [System Contract Records](contracts/) - Durable failure-class contracts that bind invariants, owners, models, runtime paths, package history, and residual evidence.
- [Rolling Restart Rebalancer Handoff Contract](contracts/rolling-restart-rebalancer-handoff.md) - Priority recovery handoff convergence contract and decision-table binding.
- [Active Gate Convergence Contract](contracts/active-gate-convergence.md) - Coupled active-gate/rebalancer invariant contract backed by TLA+ and fast-check models.
- [Package Lifecycle Contract](contracts/package-lifecycle.md) - Workflow statechart contract for package status, closure, supersession, and redirect safety.
- [Runtime Grammar Hierarchy](runtime-grammar-hierarchy.md) - Runtime grammar and boundary hierarchy reference.
- [Lagrange Kernel Platform API v0](lagrange-kernel-platform-api-v0.md) - Kernel platform API contract.
- [Lagrange Service Manifest](lagrange-service-manifest.md) - Service manifest format and activation model.
- [Lagrange Service Registry](lagrange-service-registry.md) - Service registry architecture.
- [Lagrange Architecture Diagrams](lagrange_architecture_diagrams.md) - Primary visual architecture references.
- [Lagrange Advanced Architecture Diagrams](lagrange_advanced_architecture_diagrams.md) - Advanced architecture diagrams.

## Future Architecture

- [Activation-Cost-Aware Placement](future/activation-cost-aware-placement.md) - Planned placement-cost architecture.
- [Native Artifact Store](future/native-artifact-store.md) - Planned native artifact store architecture.
