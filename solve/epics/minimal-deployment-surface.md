---
epicContractVersion: 2
id: minimal-deployment-surface
roadmapRow: RM-2.0-minimal-deployment-surface
graduatesTo: null
---

# Minimal deployment surface: artifacts, bindings, cells

## Intent (why now)

Lagrange exposes several mechanism-first ways to deploy code, backed by
overlapping registries and validators. This epic retains only unresolved choices
that span later Quests. The selected three-noun architecture, owner map,
invariants, and migration sequence now live in
[`architecture/minimal-deployment-surface.md`](../../architecture/minimal-deployment-surface.md).

## Options under discussion

- **Transient invocation routing:** resolve durable `call` and `pushdown`
  registration names to ready Cells through an existing owner, or introduce a
  shared invocation resolver before either data-plane integration.
- **Genuine component execution:** replace the current JavaScript-envelope WASM
  scaffold before request routing, or make that replacement and the first ready
  request Cell one closure-gated Quest.

## Open questions

- How do durable `call` and `pushdown` registrations map to transient
  per-statement invocations without creating statement-scoped Bindings?
- When does the current JavaScript-envelope WASM mechanism get renamed or
  removed relative to a genuine component engine?

## Decision log

- 2026-07-22 — Selected Artifact / Binding / Cell as the complete deployment
  vocabulary; fixed seven Binding sources; code is stateless and context is
  table-backed.
- 2026-07-22 — Selected one Cell contract over the existing replica substrate,
  fixed voters plus elastic learners, partition-as-built-in-service, and
  axiomatic bootstrap Cells.
- 2026-07-22 — Literature and adversarial review required artifact exports to
  declare read/write sets, immutable version-pinned Bindings, and CDC-woken
  eventually-stable reconciliation.
- 2026-07-22 — Graduated the selected architecture and migration order to
  `architecture/minimal-deployment-surface.md`; the epic now retains only
  cross-Quest choices.
- 2026-07-22 — Started product Quest
  `minimal-deployment-artifact-export-contract` as the first executable slice:
  strict analyzable v2 exports through the existing install/catalog owners while
  preserving manifest v1 compatibility.
- 2026-07-22 — Adversarial review rejected OCI `artifact_digest#export` as a
  canonical Binding target because one payload digest may back multiple
  installed manifests. The prerequisite was delivered by
  `minimal-deployment-artifact-binding-identity-replacement`: canonical Binding
  targets pin installed `package_id`, derived `manifest_digest`, and export
  name. Its predecessor remains an exhausted audit record because an early
  malformed measurement event could not be repaired honestly.
- 2026-07-22 — Classified `call` and `pushdown` Bindings as durable
  registrations; their individual statement calls and plans are transient
  invocations, not a second ephemeral Binding persistence model.
- 2026-07-22 — Sealed Binding v0 as a strict seven-variant source union with
  one-to-one export interfaces, export-bounded contexts, owner-derived Artifact
  capabilities, explicit resource maxima, fixed odd voters plus bounded
  learners, and create-only immutable generation 1. Landed product Quest
  `minimal-deployment-binding-v0-declaration`; request Binding compilation is
  the next cutover rather than a side effect of declaration persistence.
- 2026-07-22 — Selected request Binding compilation as the first Binding
  cutover. The existing `service_definitions` planning leader performs one
  level-triggered CDC-woken projection into inactive zero-replica desired rows;
  direct user service-definition mutation ingress is retired atomically, while
  runtime activation and Cells remain later work.
- 2026-07-22 — Selected `change` as the next source cutover. The request
  compiler becomes the shared Binding-to-desired-service compiler, preserving
  inactive zero-replica output while projecting change operations and tables;
  the unused UUID-based `CDCSubscriptionManager` declaration/callback API is
  retired, and actual change-event subscription and dispatch remain deferred to
  Cell activation.
- 2026-07-22 — Landed `change` and selected `time` as the next source cutover.
  The shared compiler projects the bounded `interval_ms` declaration into the
  same inactive zero-replica desired state. Scheduling remains a Cell-activation
  concern: compilation must not arm a timer or engage the per-replica timer
  runtime.
- 2026-07-22 — Landed `time` and selected `once` as the next source cutover.
  `once` contributes no source configuration beyond its kind, so the cutover is
  limited to closed compiler admission and the same inactive zero-replica
  desired-state projection; invocation remains deferred to Cell activation.
- 2026-07-23 — Landed `once` and selected `boot` as the next source cutover.
  `boot` is a handler source, not a node/cluster bootstrap hook: it receives the
  same inactive zero-replica desired-state projection, while invocation and all
  infrastructure bootstrap lifecycle remain unchanged until Cell activation.
- 2026-07-23 — Landed `boot` and selected `call` as the next source cutover.
  `call` is a durable named registration compiled into the same inactive
  zero-replica desired state; individual statement invocations remain transient
  and deferred until Cell activation.
- 2026-07-23 — Landed `call` and selected `pushdown` as the final source
  compilation cutover. `pushdown` is likewise a durable named registration;
  individual query-plan invocations remain transient and compilation neither
  installs nor executes pushdown behavior.
- 2026-07-23 — Landed `pushdown`; all seven Binding sources now compile through
  the existing `service_definitions` planning leader into inactive zero-replica
  desired state.
- 2026-07-23 — Fixed the Cell owner boundary before lifecycle consolidation:
  Binding-derived `service_definitions` rows are desired state, `services` rows
  are replica actuals, and only an actual made ready and running by
  `ServiceRuntimeLifecycle` is a Cell. `RuntimeServiceRebalancerOwner` and one
  existing `UnifiedRebalancer` per active service remain the only placement
  path; no Cell table, scheduler, or lifecycle is added.
- 2026-07-23 — Fixed request-only activation as the first Cell slice. The
  `service_definitions-p1` planning leader level-triggers request-derived rows
  to `status = active` with `replica_count = elasticity.voters`, preserves
  immutable lineage and runtime projection, and admits that lineage to the
  existing runtime-service placement owner. The other six sources remain
  inactive at zero replicas.
- 2026-07-23 — Fixed learner sequencing: voter placement engages first and
  learner bounds remain persisted but non-authoritative until a later Quest
  adds elastic capacity through the same replica substrate without changing
  consensus quorum.
- 2026-07-23 — Fixed the axiomatic bootstrap boundary to the existing
  bootstrap-owned system-table/message-group partition actuals and the three
  built-in meta runtime services. The Cell cutover adds no seed registration,
  built-in, or Binding-derived user Cell. Started product Quest
  `minimal-deployment-request-cell-placement` for the engaged placement slice;
  genuine component execution, ready handler context, and request routing
  remain separately closure-gated.
