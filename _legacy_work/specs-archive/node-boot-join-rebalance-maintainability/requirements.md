# Requirements Document

## Introduction

This specification captures maintainability and understandability improvements
for node bootstrap, node join, and replica rebalancing. The current runtime
behavior is broadly correct, but critical ownership paths remain difficult to
read and modify due to oversized orchestrators, duplicate cleanup ownership,
index-coupled phase orchestration, and mutable dependency wiring.

The refactor defined here is structural and ownership-oriented. The goal is to
make control-plane code easier to reason about without changing functional
semantics.

## Roadmap Alignment

This work supports `roadmap.md` Phase 0.1 internal coherence (topology workflow
stabilization) by improving owner boundaries and reducing contradiction-prone
control-plane wiring in AGPL runtime paths.

## Scope

In scope:

- `src/bootstrap/bootstrap-service.js`
- `src/bootstrap/node-joining-service.js`
- `src/bootstrap/pipeline/*`
- `src/bootstrap/phases/*` (seed and join phase owners)
- `src/node/node-readiness-policy.js`
- `src/rebalancer/unified-rebalancer.js`
- `src/rebalancer/rebalance-coordinator.js`
- `src/partition/partition-service.js`
- `src/index.js`

Out of scope:

- New cluster features
- SQL/user-facing behavior changes
- Protocol changes on wire formats
- Edition-specific (Pro/Enterprise) behavior

## Constraints

1. Runtime behavior MUST remain equivalent before and after refactoring.
2. No second owner path may be introduced for lifecycle, cleanup, readiness,
   or operation progression.
3. Public APIs consumed by existing runtime entrypoints MUST remain compatible
   unless a compatibility adapter is provided in the same change tranche.
4. Every extraction MUST include regression coverage for touched seams.

## Requirements

### Requirement 1: Thin Bootstrap And Join Orchestrators

**User Story:** As a maintainer, I want seed/bootstrap and join services to act
as thin orchestrators so phase logic is discoverable in focused modules.

#### Acceptance Criteria

1.1 `BootstrapService` SHALL primarily coordinate phase execution, lifecycle
state transitions, and post-phase wiring; phase-heavy logic SHALL live in phase
owner modules.

1.2 `NodeJoiningService` SHALL primarily coordinate checkpoint progression,
phase execution, lifecycle transitions, and result assembly; phase-heavy logic
SHALL live in phase owner modules.

1.3 Wrapper-only method blocks that only forward to extracted owners (for
example readiness wrappers) SHALL be removed or collapsed to a compact,
documented delegation boundary.

1.4 Delegate surfaces for extracted owners SHALL be bounded by concern
(readiness, cleanup, phase execution, runtime wiring) rather than one large
mixed delegate map.

1.5 Refactoring SHALL preserve join/bootstrap phase ordering and emitted events.

### Requirement 2: Single Cleanup Ownership Path

**User Story:** As a maintainer, I want one cleanup owner for seed bootstrap
failure/shutdown so cleanup behavior is predictable and non-duplicated.

#### Acceptance Criteria

2.1 Cleanup ordering constants and phase-to-cleanup index mapping SHALL have one
canonical owner.

2.2 Cleanup execution SHALL run through one path (either explicit handler or
pipeline-managed cleanup), not parallel duplicated orchestration paths.

2.3 Seed cleanup helper methods in `BootstrapService` SHALL not duplicate logic
already owned by `SeedCleanupHandler`.

2.4 Join and seed cleanup flows SHALL use equivalent ownership patterns and
error reporting shape.

2.5 Cleanup path changes SHALL preserve existing best-effort semantics for
individual cleanup step failures.

### Requirement 3: Named Join Phase Segments (No Index Slicing)

**User Story:** As a maintainer, I want join checkpoint orchestration to use
named phase groups instead of array slicing so changes to phase order do not
silently break checkpoints.

#### Acceptance Criteria

3.1 Join startup plan SHALL expose named phase segments for each checkpoint
boundary (seed contact, infrastructure, membership, readiness/finalization).

3.2 `NodeJoiningService` checkpoint steps SHALL reference named segments and
explicit phase identifiers, not `phases.slice(...)` offsets.

3.3 The join plan contract SHALL fail fast when a required named segment is
missing.

3.4 Existing join checkpoint semantics and resumability SHALL be preserved.

### Requirement 4: Lifecycle Sub-Phase Parity Between Seed And Join

**User Story:** As a maintainer, I want bootstrap and join phase execution to
update lifecycle sub-phases consistently so diagnostics and transitions are
uniform.

#### Acceptance Criteria

4.1 Join phase execution SHALL apply `JOINING_SUB_PHASE` transitions with the
same rigor used by bootstrap phase execution.

4.2 Terminal join sub-phase completion SHALL preserve existing transition to
`READY` state behavior.

4.3 Lifecycle event payloads and logs SHALL include consistent phase/sub-phase
context across seed and join paths.

4.4 Sub-phase mapping SHALL be declarative and centralized, not hardcoded in
multiple execution sites.

### Requirement 5: Canonical Readiness Policy For Rebalancing Decisions

**User Story:** As a maintainer, I want one readiness policy used by
rebalancing owners so readiness decisions are consistent and auditable.

#### Acceptance Criteria

5.1 Runtime rebalancer readiness checks SHALL use
`node-readiness-policy` owner functions for node/table/transport readiness.

5.2 Rebalancer-specific duplicate readiness helpers (connection checks,
outbound checks, ping checks) SHALL be removed or reduced to thin adapters.

5.3 Readiness diagnostics SHALL preserve reason granularity for skipped moves
(e.g., lease, status, connection, ping).

5.4 Coordinator/rebalancer readiness expectations SHALL remain aligned with
control-plane readiness dimensions.

### Requirement 6: RebalanceCoordinator Concern Decomposition

**User Story:** As a maintainer, I want `RebalanceCoordinator` broken into
clear concern modules so operation logic, storage admission, and observed-state
reconciliation are easier to modify safely.

#### Acceptance Criteria

6.1 SQL/cache row access and record translation logic SHALL be extracted behind
one repository-style boundary.

6.2 Operation workflow advancement/single-flight ownership logic SHALL be
extracted into a dedicated workflow owner component.

6.3 Admission and readiness gating composition SHALL be isolated from raw
operation persistence methods.

6.4 `RebalanceCoordinator` SHALL remain the runtime facade and preserve current
external behavior/entrypoints.

6.5 Extracted components SHALL have focused unit tests for their contracts.

### Requirement 7: Deterministic Dependency Wiring (No Mutable Rebinding Drift)

**User Story:** As a maintainer, I want rebalancer/coordinator dependencies to
be wired once through explicit contracts so ownership does not depend on setter
order.

#### Acceptance Criteria

7.1 Partition/rebalancer dependency wiring SHALL use explicit dependency bundles
(or builders) instead of repeated in-place property rebinding.

7.2 `UnifiedRebalancer` SHALL not mutate core owner dependencies from multiple
call sites without a single canonical wiring method.

7.3 Coordinator replacement/rebinding behavior (when required) SHALL be
centralized and observable.

7.4 Rebalancer initialization SHALL remain gated on required dependencies and
existing leader/background readiness rules.

### Requirement 8: Entrypoint Composition Extraction For Seed/Join Parity

**User Story:** As a maintainer, I want `src/index.js` to compose runtime paths
through shared helpers so seed and join startup are symmetric and easier to
modify.

#### Acceptance Criteria

8.1 Repeated startup composition blocks (readiness logging, `BootstrapAPI`
post-bootstrap wiring, SQL engine construction, split manager wiring, admin
startup, shutdown choreography) SHALL be extracted to shared helpers.

8.2 `main()` SHALL retain high-level branch decisions (seed vs join) while
delegating branch internals to explicit composition functions.

8.3 Extracted startup/shutdown composition SHALL preserve existing side effects
and initialization order.

8.4 Branch-specific differences (seed-only vs join-only behavior) SHALL be
explicit in helper inputs rather than implicit duplicated code.

### Requirement 9: Regression Safety, Traceability, And Documentation

**User Story:** As a maintainer, I want this refactor to be shipped with clear
traceability and regression coverage so future changes can be made confidently.

#### Acceptance Criteria

9.1 Each implementation task SHALL reference requirement IDs and relevant
design sections.

9.2 Tests SHALL cover all modified ownership boundaries (phase orchestration,
cleanup ownership, lifecycle sub-phases, readiness policy adoption,
coordinator decomposition seams, entrypoint composition).

9.3 Targeted test suites for bootstrap/join/rebalancer/partition/entrypoint
paths SHALL pass before full-suite execution.

9.4 The spec SHALL include a requirement-to-design/task mapping that enables
reviewers to validate completion objectively.
