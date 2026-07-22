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

- **Binding schema v0:** exact source-specific configuration, context namespace,
  budget, capability, and elasticity shapes.
- **Binding migration order:** request/service ingress first, or the smaller CDC
  subscription surface first, after the artifact declaration prerequisite lands.
- **Cell convergence:** introduce the derived Cell vocabulary at the existing
  reconciler boundary before or during partition/service lifecycle consolidation.
- **Learner sequencing:** make learner replicas part of the first context-backed
  Cell, or defer elasticity until the fixed-voter context path is engaged.

## Open questions

- Which stable interface identifiers may each of the seven Binding sources call?
- Where do statement-scoped `pushdown` Bindings live when they must never become
  durable user declarations?
- What minimum set of axiomatic Cells reaches the binding-reconciler bootstrap
  fixed point?
- Which invocation, context-size, and safety-interval limits must be sealed as
  permanent kernel API in Binding v0?
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
