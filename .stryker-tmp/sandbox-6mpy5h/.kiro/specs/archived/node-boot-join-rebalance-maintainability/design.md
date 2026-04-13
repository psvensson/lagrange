# Design Document: Node Boot/Join/Rebalance Maintainability

## Overview

This design restructures bootstrap, join, and rebalancing internals around one
principle: every control-plane concern should have one obvious owner and one
obvious execution path.

The intent is not to alter behavior. The intent is to reduce cognitive load,
remove hidden coupling, and make future control-plane changes safer.

## D1. Design Principles And Invariants

1. Single-owner path per concern: cleanup, readiness, lifecycle transitions,
   operation progression.
2. Structural refactor only: no feature additions and no protocol changes.
3. Explicit contracts over positional coupling: named phase groups and typed
   dependency bundles.
4. Extract-and-delegate: preserve external interfaces while moving logic behind
   focused modules.
5. Test-backed parity: each extraction ships with seam-level tests.

## D2. Thin Orchestrator Model For Bootstrap And Join

### D2.1 Target orchestrator responsibilities

`BootstrapService` and `NodeJoiningService` should each own:

- lifecycle state/sub-phase transitions
- startup/checkpoint orchestration
- high-level result assembly
- dependency handoff to runtime owners

They should not own large swaths of phase-specific implementation detail once
phase owner modules already exist.

### D2.2 Concern-scoped delegate bundles

Replace monolithic mixed delegate maps with concern-scoped bundles:

- `phaseExecutionDelegates`
- `readinessDelegates`
- `cleanupDelegates`
- `runtimeWiringDelegates`

This keeps each extracted helper bound only to required state.

### D2.3 Wrapper-collapse rule

For methods that currently only proxy to extracted owners, use one of:

1. direct owner invocation from call sites, or
2. compact public adapter section grouped by concern (documented as API
   compatibility adapters).

Long proxy blocks should be removed.

## D3. Single Cleanup Ownership Contract

### D3.1 Canonical cleanup owner

`SeedCleanupHandler` is the canonical seed cleanup owner:

- cleanup step order
- phase-to-cleanup mapping
- cleanup-step execution and result aggregation
- best-effort step failure handling

Duplicate cleanup constants and duplicate orchestration logic in
`BootstrapService` should be removed.

### D3.2 Pipeline cleanup alignment

`StartupPipelineRunner` cleanup support currently exists but is not the active
bootstrap/join path. Choose one explicit contract:

- Option A: route cleanup through pipeline `cleanup` hooks
- Option B: keep handler-owned cleanup and remove unused pipeline cleanup for
  this flow

Either option must leave exactly one active cleanup execution path.

### D3.3 Error-shape parity

Seed and join cleanup paths should emit a consistent error/result shape for
logging and diagnostics.

## D4. Named Join Phase Segment Contract

### D4.1 Join plan schema

Evolve `createJoinStartupPlan()` from positional phase arrays to named
segments.

Proposed shape:

```javascript
{
  phases: [...],
  segments: {
    seedContact: [...],
    infrastructure: [...],
    membership: [...],
    readiness: [...],
  },
}
```

### D4.2 Checkpoint integration

`buildJoinCheckpointSteps()` should consume segment names and explicit phase
keys, not `slice(start, end)` offsets.

### D4.3 Fast-fail validation

Add one plan validator (`assertJoinPlanSegments`) that throws if any required
segment is missing or empty when mandatory.

## D5. Lifecycle Sub-Phase Parity

### D5.1 Declarative phase-to-sub-phase map for join

Bootstrap already maps phase->sub-phase before executing phases. Join should
adopt the same pattern with a centralized map keyed by `JOINING_PHASE`.

### D5.2 Terminal behavior parity

Terminal join sub-phase (`QUERYING_STATE`) should preserve current
`JOINING/SYNCING -> READY` behavior, including existing readiness convergence
and `signalReadyForReplicas` ordering.

### D5.3 Unified diagnostics

Phase logs/events should include a consistent lifecycle tuple:

- `state`
- `phase`
- `subPhase`
- `duration`

## D6. Canonical Readiness Policy Adoption

### D6.1 Shared readiness owner

`node-readiness-policy.js` becomes the single owner for node readiness
predicates used by rebalancer paths.

`UnifiedRebalancer` should call policy helpers instead of duplicating:

- connection checks
- outbound queue checks
- ping checks

### D6.2 Adapter strategy

Where `UnifiedRebalancer` needs rebalancer-specific defaults (for example ping
settings), use thin adapter methods that compose policy helpers rather than
re-implementing logic.

### D6.3 Readiness reason continuity

Keep detailed skip reasons by mapping policy outcomes to existing rebalancer
log/event reason codes.

## D7. RebalanceCoordinator Concern Decomposition

### D7.1 Target component split

Split coordinator internals into focused components while keeping
`RebalanceCoordinator` as runtime facade:

1. `ReplicaOperationRepository`
   - SQL/cache reads and writes
   - row <-> operation translation
2. `OperationWorkflowOwner`
   - single-flight owner keys
   - transition/claim progression
   - observed-progress reconciliation entry
3. `ProvisioningAdmissionPolicy`
   - readiness/storage admission synthesis
   - admission error construction
4. `OperationIntentStore` (optional extraction)
   - recent-intent dedupe cache management

### D7.2 Facade contract

`RebalanceCoordinator` remains the integration point consumed by partition
services and rebalancers. Existing public methods remain available, delegating
internally to extracted owners.

### D7.3 Sequencing

Extract repository first, then workflow owner, then admission policy to reduce
blast radius.

## D8. Deterministic Dependency Wiring

### D8.1 Dependency bundle for partition/rebalancer

Introduce explicit dependency bundle objects used by `PartitionService` to wire
`UnifiedRebalancer` and coordinator dependencies in one place.

### D8.2 Canonical rebalancer wiring function

Create one method (for example `applyRebalancerDependencies(bundle)`) that is
the only path for updating rebalancer owner dependencies after construction.

### D8.3 Coordinator rebind semantics

If coordinator replacement is required, route through one explicit rebind API
that:

- updates coordinator reference
- updates rebalancer binding
- emits one diagnostic event/log

## D9. Entrypoint Composition Extraction (`src/index.js`)

### D9.1 Shared composition helpers

Extract repeated startup/shutdown composition into helper modules/functions:

- readiness event wiring
- bootstrap API runtime hydration
- SQL engine + split manager assembly
- admin/live-query startup
- logs persistence startup/shutdown
- coordinated signal shutdown flow

### D9.2 Branch-specific inputs

Seed and join remain separate branches, but each branch should call shared
helpers with branch-specific owner objects and result containers.

### D9.3 Main function target shape

`main()` should read as:

1. resolve config/runtime primitives
2. decide `seed` vs `join`
3. call `startJoinNode(...)` or `startSeedNode(...)`

## D10. Migration Order

1. Characterization tests for existing behavior seams.
2. Named join segments + lifecycle parity (low-risk orchestration shape).
3. Cleanup owner dedup.
4. Readiness policy adoption.
5. Dependency wiring consolidation.
6. Coordinator decomposition.
7. Entrypoint composition extraction.
8. Final targeted + full regression runs.

## D11. Testing Strategy

### D11.1 Characterization-first seams

Add/extend tests to lock behavior before structural refactor:

- join checkpoint progression and resume behavior
- bootstrap/join phase event order
- cleanup step order and best-effort behavior
- lifecycle state/sub-phase transitions
- rebalancer readiness skip behavior
- partition rebalancer dependency handoff
- seed/join entrypoint startup + shutdown choreography

### D11.2 Extraction-level unit tests

Each extracted component (repository/workflow/admission/composition helper)
gets focused unit tests with mocked boundaries.

### D11.3 Integration safety set

Run targeted integration suites touching boot/join/rebalance and one full suite
checkpoint before completion.

## D12. Risks And Mitigations

1. Risk: hidden ordering dependencies during join checkpoint refactor.
   Mitigation: characterization tests plus named-segment validation.

2. Risk: cleanup path drift while deduplicating ownership.
   Mitigation: preserve cleanup step order tests and failure-tolerant behavior
   assertions.

3. Risk: coordinator extraction alters transition semantics.
   Mitigation: keep facade API unchanged and add operation progression
   regression tests before/after extraction.

4. Risk: entrypoint extraction changes startup side effects.
   Mitigation: add start/shutdown parity tests and branch-specific fixture
   assertions.

## Requirement To Design Mapping

| Requirement | Design Sections |
| --- | --- |
| 1 | D2, D10, D11 |
| 2 | D3, D10, D11 |
| 3 | D4, D10, D12 |
| 4 | D5, D11 |
| 5 | D6, D11 |
| 6 | D7, D10, D11 |
| 7 | D8, D10 |
| 8 | D9, D10, D11 |
| 9 | D10, D11, D12 |
