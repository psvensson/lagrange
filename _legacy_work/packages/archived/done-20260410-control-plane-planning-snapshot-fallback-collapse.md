# Control-Plane Planning Snapshot Fallback Collapse

## Why

Planning answers for priority recovery and topology admission still depend on
caller-owned degradation policy.

`OperationWorkflowOwner` currently owns `sync snapshot -> async refresh with
timeout -> sync fallback`, and `RebalanceCoordinator` still reconstructs a
planning answer from diagnostics when the planning snapshot is unavailable.

That violates the single-owner rule for the semantic question "what planning
answer should this caller trust right now?"

## Scope Basis

Phase 0.1 roadmap scope: control-plane correctness, cache-observation boundary
enforcement, and topology workflow stabilization.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../../sprints/archived/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-CP-001`
2. `FB-CP-002`
3. `FB-CP-004`

## In Scope

1. Define the canonical readiness-owner surfaces for synchronous and
   best-effort planning answers.
2. Remove caller-local timeout and sync fallback policy from rebalancer
   callers.
3. Remove diagnostics-based reconstruction of planning epoch/plan answers.
4. Keep the remaining async stale-summary repair boundary explicit and
   documented.

## Out Of Scope

1. Publication-row acknowledgment selection.
2. Startup/bootstrap mutation ingress bridges.
3. Leader-identity convergence during bootstrap.

## Invariants

1. Planning answers have one semantic owner.
2. Sync callers do not reconstruct owner truth from diagnostics.
3. Async repair remains explicit where it is still genuinely required.

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/rebalancer/operation-workflow-owner.js`
3. `src/rebalancer/rebalance-coordinator.js`

## Detection / Analysis Tasks

- [x] Enumerate every planning-answer call site and which surface it should use.
- [x] Define the readiness-owner sync and best-effort planning contracts.
- [x] Confirm which async repair behavior must remain behind the readiness
  owner.

### Current Call-Site Map

1. `src/rebalancer/operation-workflow-owner.js`
   - Use `getPriorityRecoveryPlanningAnswerBestEffort(...)` for
     priority recovery gating.
   - Falls through to `getPriorityRecoveryPlanningSnapshotBestEffort(...)` or
     legacy `getMembershipPublicationPlanning*` methods only when explicit
     priority-named methods are unavailable.
2. `src/rebalancer/rebalance-coordinator.js`
   - Use `getCurrentPublishedMembershipEpochSync(...)` for topology admission
     epoch checks.
   - Delegate to readiness-owned sync planning surface; no local planning-row
     reconstruction.
3. `src/control-plane/control-plane-readiness-service.js`
   - Exposes canonical sync/best-effort planning surfaces and owns async repair.

## Implementation Tasks

- [x] Introduce the canonical readiness-owner APIs for planning answers.
- [x] Route `OperationWorkflowOwner` through the owner API instead of
  orchestrating its own fallback sequence.
- [x] Route `RebalanceCoordinator` through the owner API instead of rebuilding
  planning state from diagnostics.
- [x] Add guardrails for sync and async planning callers.

## Validation

1. Targeted unit tests for readiness planning surfaces.
2. Rebalancer tests covering priority recovery admission and topology mutation
   admission.
3. Distributed scenarios: `rolling-restart`, `seed-restart-under-load`.

## Done When

1. Planning snapshot degradation policy lives in one owner.
2. Rebalancer callers stop reconstructing planning answers locally.
3. The remaining sync/async split is explicit, justified, and tested.
