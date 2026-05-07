# Rebalancer Owner Card

## Role

`src/rebalancer/` owns placement planning, replica-operation lifecycle
coordination, storage admission, and execution handoff for topology changes.

## Primary Owners

- `MovePlanner` plans placement moves. Do not duplicate planning in
  `UnifiedRebalancer`.
- `RebalanceCoordinator` owns steady-state `replica_operations` workflow
  fields and step transitions.
- `OperationWorkflowOwner` owns durable workflow progression and re-entry
  decisions.
- `ExecutorOutcomeEmitter` is the executor-to-coordinator acknowledgement
  boundary. Executors emit outcomes; they do not write coordinator-owned
  fields directly.
- `StorageAdmissionService` owns storage/capacity admission decisions.

## First Files

- `index.js` for exported surface area.
- `rebalancer-constants.js`, `replica-operation-constants.js`, and
  `executor-outcome-constants.js` for vocabulary owners.
- `move-planner.js` before changing placement behavior.
- `rebalance-coordinator.js` before changing operation state.
- `operation-workflow-owner.js` before changing workflow progression.

## Do Not

- Do not write `replica_operations` owner-managed lifecycle fields outside the
  coordinator path.
- Do not infer workflow completion from cache visibility alone.
- Do not add local fallback planning, dispatch, or retry paths.
- Do not add new `segment` or `part` files when extracting; use owner-specific
  names for new boundaries.

## Proof Surface

- Focused tests under `test/rebalancer/`.
- Touched-file literal, decision-boundary, and runtime-grammar guardrails for
  lifecycle, admission, retry, or outcome changes.
- Representative distributed scenario rerun when the active package is
  scenario-driven.
