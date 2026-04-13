# Implementation Tasks

## Overview

This task plan implements deterministic control-plane progression using existing
shared primitives first, then removes duplicated tactical paths.
Please see .kiro/specs/control-plane-predictability-and-determinism/progression-entry-inventory.md for reference to some tasks

Status markers:

- `[ ]` not started
- `[~]` in progress
- `[x]` completed

## Task List

### 1. Owner-Key Reconcile Queue Consolidation (Requirements 1, 9, 10)

- [x] 1.1 Inventory progression entry points
  - Enumerate event-triggered, cache-triggered, and polling-triggered
    progression paths for dispatch, rebalance, and split.
  - Map each path to owner key and owning component.
  - Document duplicate progression paths to remove.

- [x] 1.2 Enforce enqueue-only event handlers
  - Refactor event handlers to enqueue owner keys with typed reason codes.
  - Remove direct long-running progression execution from handlers.
  - Add queue-level de-duplication by owner key.

- [x] 1.3 Enforce single in-flight reconcile per owner key
  - Add claim tracking and in-flight guard.
  - Add typed stale-claim diagnostics for rejected duplicate work.
  - Add tests for no parallel execution on the same owner key.

### 2. Durable Workflow and Atomic Transition Reuse (Requirements 2, 5, 10)

- [x] 2.1 Align topology operations on one durable workflow contract
  - Route split/rebalance/replace transitions through
    `DurableWorkflowCoordinator`.
  - Persist `previousStep`, `nextStep`, `reason`, `timestamp`, `ownerKey`.
  - Remove local step-transition side channels.

- [x] 2.2 Reuse `DistributedTransactionCoordinator` for atomic step transitions
  - Identify transitions requiring atomic multi-row state changes.
  - Wrap those transitions in distributed transaction boundaries.
  - Add idempotency checks by operation id and step id.

- [x] 2.3 Add monotonic workflow regression coverage
  - Add tests proving no backward step transitions outside explicit recovery
    terminals.
  - Add tests proving transition + authoritative row updates commit atomically.

### 3. Read-Model Contract Closure (Requirements 3, 9)

- [x] 3.1 Define declared read-model source per decision
  - Annotate control-plane decisions with explicit read model:
    `SystemTableCache` or authoritative SQL.
  - Forbid mixed cache/SQL fallback in the same semantic decision.

- [x] 3.2 Remove parallel truth derivations
  - Delete path-local in-memory mirrors and fallback read branches.
  - Keep SQL reconciliation only for explicit recovery/diagnostics.
  - Emit typed divergence events when cache and authoritative state differ.

- [x] 3.3 Add read-contract tests
  - Add owner-path tests that fail if a decision silently falls back to a
    second source of truth.
  - Add diagnostics tests for divergence event payloads.

### 4. Unified Readiness and Admission Consumption (Requirements 4, 7, 9)

- [x] 4.1 Ensure all topology-changing workflows consume canonical readiness
  - Route dispatch/rebalance/split admission checks through
    `ControlPlaneReadinessService` outputs.
  - Remove superseded local readiness heuristics.

- [x] 4.2 Persist readiness snapshot in decisions
  - Include readiness snapshot metadata with admission/progression decisions.
  - Expose snapshot linkage in diagnostics/failure bundles.

- [x] 4.3 Add shared-consumption regression tests
  - Add tests proving all three workflows consume the same readiness contract.
  - Add regression that fails when workflow-local readiness logic reappears.

### 5. Fencing and Stale-Work Rejection (Requirements 5, 9)

- [x] 5.1 Add fence tokens to claim and transition paths
  - Persist owner epoch/lease token with claims and transitions.
  - Validate fence token before applying any transition.

- [x] 5.2 Add stale-owner diagnostics and metrics
  - Emit typed stale-fence rejection events.
  - Expose counts and recent samples in control-plane diagnostics.

- [x] 5.3 Add stale-fence regression coverage
  - Add tests for late event handling and stale claim rejection.
  - Prove stale work cannot overwrite newer transitions.

### 6. Canonical Timeout-Budget Tree Adoption (Requirements 6, 8, 9)

- [x] 6.1 Standardize top-level budgets and derived sub-budgets
  - Ensure each top-level control-plane operation creates one absolute budget.
  - Ensure sub-operations derive from remaining budget only.
  - Reject sub-operations below minimum viable budget.

- [x] 6.2 Standardize timeout classification
  - Emit stable categories for all timeout outcomes.
  - Include boundary-hit flags and remaining-budget context.
  - Treat exact-boundary hits as hard correctness failures in tests.

- [x] 6.3 Add timeout contract regressions
  - Add deterministic tests for nested budget derivation.
  - Add deterministic tests for exact-boundary classification.
  - Remove tests that only assert generic timeout strings.

### 7. Always-On Invariant Engine and Gates (Requirements 7, 8, 9)

- [x] 7.1 Implement canonical invariant set evaluation
  - Add invariant checks for leader uniqueness, monotonic steps, claim
    exclusivity, and orphan in-flight operations.
  - Tag invariant outcomes as hard/soft with typed reason codes.

- [x] 7.2 Integrate invariant outcomes into diagnostics and failure bundles
  - Include invariant breaches in bundle summaries and root-cause sections.
  - Add owner key, operation id, and transition context.

- [x] 7.3 Add deterministic invariant gate tests
  - Add tests that intentionally violate each hard invariant and verify
    deterministic failure.
  - Require hard invariant gates in targeted integration suites.

### 8. Deterministic Failure Closure Workflow (Requirements 8, 10)

- [x] 8.1 Introduce failure-class mapping for harness findings
  - Map each harness-discovered failure to a deterministic test id.
  - Keep issue open when deterministic reproduction is missing.

- [x] 8.2 Add owner-path regression for each newly closed failure class
  - For every fixed class, add:
    - deterministic repro test
    - owner-path regression
    - invariant assertion

- [x] 8.3 Use harness reruns as confirmation only
  - Keep harness rerun tasks as final confirmation checkpoints.
  - Disallow harness-only closure evidence.

### 9. Migration and Cleanup Gates (Requirement 10)

- [x] 9.1 Define and track phase exit criteria
  - Add measurable exit gates per phase in the spec and task tracker.
  - Record rollback notes for each phase.

- [x] 9.2 Remove dual paths at phase closure
  - Delete temporary toggles and duplicated progression branches.
  - Confirm single owner path remains after each closure.

- [x] 9.3 Update architecture documentation and steering
  - Keep `architecture.md` and steering docs synchronized with final owner
    boundaries and contracts.
