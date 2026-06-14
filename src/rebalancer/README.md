# Rebalancer Owner Card

## Role

`src/rebalancer/` owns placement planning, replica-operation lifecycle
coordination, storage admission, and execution handoff for topology changes.

## Primary Owners

- `MovePlanner` plans placement moves. Do not duplicate planning in
  `UnifiedRebalancer`.
- `RebalanceCoordinator` owns steady-state `replica_operations` workflow
  fields and step transitions.
- `OperationWorkflowOwner` owns `operation_progress`, durable workflow
  progression, and re-entry decisions. Other owners observe its outcome; they
  do not write or re-derive operation lifecycle state.
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
- `operation-lifecycle.js` before changing `operation_progress` states,
  lifecycle events, side effects, or bounded progress reasons.
- `operation-progress-store.js` before changing progress persistence,
  compare-and-swap, versioning, or event-log append behavior.
- `operation-progress-events.js` before changing progress event definitions or
  event projection behavior.
- `operation-progress-observer.js` before changing diagnostics, gate, or test
  projections over progress records.
- `operation-workflow-owner-adapter.js` before changing ingress orchestration
  from durable operation evidence into progress advances and effects.
- `operation-workflow-owner-ports.js` before changing owner-side effect
  execution.
- `operation-workflow-owner-decision.js` only as the compatibility facade for
  existing workflow decision callers.
- Existing `rebalance-coordinator-segment-*`
  and `unified-rebalancer-segment-*` files are legacy compatibility surfaces.
  Use `_legacy_work/inventory/ordinal-segments.md` when opening semantic migration
  packages for these files. New code should not add more stage/segment files.

## Do Not

- Do not write `replica_operations` owner-managed lifecycle fields outside the
  coordinator path.
- Do not infer workflow completion from cache visibility alone.
- Do not infer operation progress from publication, active-gate, or snapshot
  coverage symptoms. Consume `operation_progress` owner outcomes instead.
- Do not consume or reintroduce retired source-vocabulary fields for operation
  lifecycle authority. Use `operation_progress` record fields and event
  projections.
- Do not add local fallback planning, dispatch, or retry paths.
- Do not add new `segment`, `stage`, or `part` files when extracting; use
  owner-specific names for new boundaries. The current ordinal files are
  inventoried in `_legacy_work/inventory/ordinal-segments.md` and should move only
  through explicit semantic migration packages.

## Proof Surface

- Focused tests under `test/rebalancer/`.
- Touched-file literal, decision-boundary, and runtime-grammar guardrails for
  lifecycle, admission, retry, or outcome changes.
- Representative distributed scenario rerun when the active package is
  scenario-driven.
- `npm run audit:operation-progress-authority` for lifecycle source vocabulary
  and rebalancer ordinal-file guardrails.
