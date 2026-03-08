# Implementation Plan: Topology Workflow Single-Owner Stabilization

## Overview

This plan closes the remaining topology-workflow contradictions by reusing the
existing durable workflow, transaction, readiness, and owner-queue primitives.

The order matters:

1. reproduce the failure classes in targeted tests
2. close owner and dependency violations
3. cut over `replica_operations` to a true single-writer model
4. cut over managed split to one durable owner
5. tighten readiness, transaction, and cache semantics
6. use the 7-node harness only as confirmation

Please see details in all .md documents in this folder; .kiro/specs/topology-workflow-single-owner-stabilization

Status markers:

- `[ ]` not started
- `[~]` in progress
- `[x]` completed

## Tasks

- [x] 1. Capture the current topology workflow contradictions with deterministic repros
  - [x] 1.1 Add a targeted failing test where executor-side replica creation succeeds but the owner-side `replica_operations` workflow remains stuck.
  - [x] 1.2 Add a targeted failing test where split progress depends on process-local state and cannot be resumed cleanly after restart/recovery.
  - [x] 1.3 Add a targeted failing test where an internal topology action is blocked by serve-only readiness even though the node is repair-eligible.
  - [x] 1.4 Add a targeted failing test where an atomic topology path silently falls back when the transaction coordinator is absent.
  - _Requirements: 1, 2, 4, 5, 8_
  - _Design: §2, §3, §5, §6, Phase 5_

- [x] 2. Inventory and document owner boundaries before code movement
  - [x] 2.1 Enumerate every writer of `replica_operations` and classify the owned field subsets.
  - [x] 2.2 Enumerate every component currently advancing managed split state and map which phases they own in practice.
  - [x] 2.3 Enumerate all active topology decision paths that still accept missing owner dependencies and fall back locally.
  - [x] 2.4 Record these results in the implementation notes or PR description so the cutover is explicit.
  - _Requirements: 1, 2, 6_
  - _Design: §2, §3, §7, Phase 1_

- [x] 3. Make `RebalanceCoordinator` the sole `replica_operations` writer
  - [x] 3.1 Replace direct `workflow_step` updates in executor-side code with typed outcome emission.
  - [x] 3.2 Route those outcomes through the owner-key reconcile path back to `RebalanceCoordinator`.
  - [x] 3.3 Keep recovery, polling, and event-triggered progression on the same owner path.
  - [x] 3.4 Remove non-owner writes and any fallback row reconstruction tied to those writes.
  - [x] 3.5 Add owner-path regressions proving `ReplicaHandler` cannot bypass the coordinator.
  - _Requirements: 1, 6, 8_
  - _Design: §2, §7, Phase 2_

- [x] 4. Extend the shared workflow runtime for topology participant acknowledgements
  - [x] 4.1 Reuse `DurableWorkflowCoordinator` participant persistence for topology executor acknowledgements and checkpoints.
  - [x] 4.2 Define typed participant acknowledgement payloads for rebalance and split executors, including workflow identity and fencing context.
  - [x] 4.3 Add duplicate/stale acknowledgement rejection rules and diagnostics.
  - [x] 4.4 Add deterministic tests proving stale or duplicate acknowledgements cannot advance workflow state.
  - _Requirements: 3, 8_
  - _Design: §1, §4, Phase 2, Phase 5_

- [x] 5. Convert managed split into one durable owner-driven workflow
  - [x] 5.1 Keep `ManagedSplitWorkflow` as the only split lifecycle owner.
  - [x] 5.2 Persist workflow id, phase, participant state, and source checkpoint durably with the partition transition metadata.
  - [x] 5.3 Convert `SQLQueryEngine` into a thin ingress/orchestration adapter for split requests.
  - [x] 5.4 Convert `PartitionService` into a source-execution participant that reports acknowledgements and checkpoints instead of owning split phase transitions.
  - [x] 5.5 Remove process-memory-only split correctness state.
  - [x] 5.6 Add recovery tests proving split resume works after restart/reconstruction.
  - _Requirements: 2, 3, 7, 8_
  - _Design: §1, §3, §4, §8, Phase 3, Phase 5_

- [x] 6. Introduce canonical readiness stratification
  - [x] 6.1 Extend `ControlPlaneReadinessService` to produce both `repairEligible` and `serveEligible` from one shared snapshot.
  - [x] 6.2 Rewire dispatch, rebalance, and split admission to consume `repairEligible`.
  - [x] 6.3 Keep routing and benchmark readiness on `serveEligible`.
  - [x] 6.4 Record readiness dimension and reason codes in workflow decision metadata.
  - [x] 6.5 Add regressions proving internal topology work is not blocked by serve-only gating.
  - _Requirements: 4, 8_
  - _Design: §5, Phase 4, Phase 5_

- [x] 7. Remove optional transaction semantics from atomic topology cut points
  - [x] 7.1 Identify all topology transitions that are semantically atomic cut points.
  - [x] 7.2 Require `DistributedTransactionCoordinator` for those transitions.
  - [x] 7.3 Delete sequential fallback branches from those paths.
  - [x] 7.4 Add tests proving construction/startup fails closed when the required transaction facility is absent.
  - _Requirements: 5, 8_
  - _Design: §1, §6, Phase 4, Phase 5_

- [x] 8. Close owner dependency wiring gaps and delete active fallback logic
  - [x] 8.1 Wire required owner dependencies through production setup for readiness, capacity, and publication decisions used by active topology paths.
  - [x] 8.2 Remove local fallbacks that reconstruct owner-managed semantics from raw row fields in those paths.
  - [x] 8.3 Add injected-owner usage tests proving the canonical owners are actually consumed.
  - [x] 8.4 Fail closed when an active path is reachable without its required owner.
  - _Requirements: 6, 8_
  - _Design: §7, Phase 1, Phase 5_

- [x] 9. Enforce the cache observation boundary
  - [x] 9.1 Audit topology workflow advancement logic for cache-as-proof behavior.
  - [x] 9.2 Replace cache-only advancement with owner commit plus explicit acknowledgement.
  - [x] 9.3 Keep cache divergence reporting as a typed diagnostic and invariant input.
  - [x] 9.4 Route cache-divergence recovery through the same owner queue instead of a direct mutation fallback.
  - [x] 9.5 Add regressions proving cache visibility lag cannot stall or falsely complete a workflow phase.
  - _Requirements: 3, 7, 8_
  - _Design: §4, §8, Phase 4, Phase 5_

- [x] 10. Add invariant coverage for the new architecture contracts
  - [x] 10.1 Add invariant checks for single-writer `replica_operations`, acknowledgement-before-advance, split resume completeness, readiness dimension correctness, and mandatory transaction availability.
  - [x] 10.2 Surface these invariant breaches in targeted diagnostics and harness artifacts.
  - [x] 10.3 Add deterministic tests that intentionally violate each hard invariant and fail fast.
  - _Requirements: 8_
  - _Design: §4, §8, Phase 5_

- [x] 11. Update architecture and steering after implementation cutover
  - [x] 11.1 Sync `architecture.md` and `.kiro/steering/system guidelines.md` with the final owner map and readiness split once code is cut over.
  - [x] 11.2 Ensure `.kiro/steering/testing-guidelines.md` continues to require deterministic repros plus owner-path verification for topology fixes.
  - [x] 11.3 Remove any now-stale guidance that assumes optional workflow writers or cache-driven completion.
  - _Requirements: 1, 2, 4, 5, 6, 7, 8_
  - _Design: §2, §3, §5, §6, §7, §8, Phase 5_

- [x] 12. Run the verification ladder in the correct order
  - [x] 12.1 Run the new targeted unit/integration regressions first.
  - [x] 12.2 Run focused topology suites next.
  - [x] 12.3 Run the 7-node partitioning harness only after the lower layers are green.
  - [x] 12.4 Use the harness result to confirm the architecture change, not to discover first-order bugs that should have been caught earlier.
  - _Requirements: 8_
  - _Design: Phase 5_

## Non-Negotiable Guardrails

1. No new workflow engine beside `DurableWorkflowCoordinator`.
2. No direct executor mutation of owner-owned workflow fields.
3. No process-memory-only split correctness state.
4. No serve-readiness gate on repair/provision paths.
5. No sequential fallback for atomic topology cut points.
6. No owner-dependency fallback that reconstructs active production semantics
   from raw rows.
7. No harness-only closure evidence.
