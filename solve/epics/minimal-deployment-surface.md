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

- **Cell convergence:** introduce the derived Cell vocabulary at the existing
  reconciler boundary before or during partition/service lifecycle consolidation.
- **Learner sequencing:** make learner replicas part of the first context-backed
  Cell, or defer elasticity until the fixed-voter context path is engaged.

## Open questions

- How do durable `call` and `pushdown` registrations map to transient
  per-statement invocations without creating statement-scoped Bindings?
- What minimum set of axiomatic Cells reaches the binding-reconciler bootstrap
  fixed point?
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
