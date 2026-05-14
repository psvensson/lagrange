# Startup And Rebalancer Middle-Layer Closure Sprint (AGPL)

Status: done. Marked done on May 14, 2026 during sprint backlog cleanup.

## Goal

Collapse the remaining middle-layer compatibility and orchestration logic
between the now-canonical owner contracts and the runtime hot paths in startup,
join, and rebalancing.

The target is not another round of symptom fixes. The target is a structure in
which:

1. startup checkpoints are answered by one owner contract rather than object
   existence or hidden side effects
2. node admission uses one snapshot and one decision across fresh join,
   durable rejoin, and reintegration, with one cluster-incarnation fence
3. join readiness has one snapshot owner, one repair owner, and one waiter
4. rebalancer admission uses one shared snapshot and decision grammar across
   add, priority-add, and remove lanes
5. the planner/coordinator seam is explicit, with planning on one side and
   admission/execution on the other
6. legacy compatibility surfaces are deleted before sprint closure

## Why This Sprint Exists

Recent work closed the outer owner boundaries successfully:

1. startup workflow durability and authority are now on stronger owner paths
2. startup authority and runtime handoff have one much clearer story
3. publication and readiness contracts are materially more explicit
4. rebalancer visibility and workflow ownership are better normalized

The remaining complexity is now concentrated in the middle layer:

1. `BootstrapService` and `NodeJoiningService` still answer checkpoint
   progression through local predicates such as object existence and hidden
   post-phase work
2. startup checkpoint, promotion, join readiness, publication, runtime
   handoff, auto-rejoin selection, and reintegration still do not share one
   node-admission contract
3. `JoinReadinessEvaluator` still combines snapshot assembly, repair,
   waiter logic, timeout shaping, and active-node fallback in one boundary
4. `RebalanceCoordinator` still duplicates admission logic across lane-local
   helpers
5. `UnifiedRebalancer` still rebuilds budget and admission semantics that
   belong with the coordinator

That is now the highest-value simplification target.

## Relationship To Current Sprint

This is a successor sprint to:

1. [Coherence Closure Before Harness Sprint](./archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

It also builds directly on:

1. [Startup Workflow Durability And Authority Unification Umbrella](../packages/archived/done-20260420-startup-workflow-durability-and-authority-unification-umbrella.md)
2. [Rebalancer and Workflow Coordination Contract Hardening](../packages/archived/done-20260412-rebalancer-and-workflow-coordination-contract-hardening.md)
3. [Startup Authority and Available-Node Contract Unification](../packages/archived/done-20260412-startup-authority-and-available-node-contract-unification.md)

## Entry Gate

This successor sprint does not start while the current active sprint still owns
overlapping middle-layer semantics.

Predecessor closure status:

1. Closed: [Authoritative observation and topology blocker cutover](../packages/archived/done-20260419-authoritative-observation-and-topology-blocker-cutover.md)
2. Closed: [Membership publication runtime owner unification](../packages/archived/done-20260419-membership-publication-runtime-owner-unification.md)
3. Closed: [Canonical readiness ladder and admission closure](../packages/archived/done-20260419-canonical-readiness-ladder-and-admission-closure.md)
4. Closed: [Shadow-grammar deletion across readiness, bootstrap, and rebalancer](../packages/archived/done-20260419-shadow-grammar-deletion-across-readiness-bootstrap-and-rebalancer.md)
5. Remaining predecessor structural blockers:
   [Priority-recovery operation-scheduling pressure and follow-up creation closure](../packages/done-20260423-priority-recovery-operation-scheduling-pressure-and-followup-creation-closure.md)
6. Remaining predecessor structural blockers:
   [Priority-recovery workflow-owner progress state-machine and timeout-reconcile closure](../packages/archived/done-20260422-priority-recovery-workflow-owner-progress-state-machine-and-timeout-reconcile-closure.md)

This sprint remains a `todo-...` sprint until the predecessor sprint completes
its remaining under-load closure work and completes the scenario confirmation
pass.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

These rows are AGPL-scoped in `edition-matrix.md`.

## Out Of Scope

1. New product features or scope expansion
2. Broad transport redesign outside the touched join-readiness and rebalancer
   seams
3. Repo-wide file hygiene work except where a split is necessary to enforce the
   new owner boundary
4. New deployment, CLI, or operator capabilities

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`
4. `seven-node-load-during-partitioning`
5. `seven-node-postgres-baseline-partition-split`

## Sprint Umbrella

1. [Startup checkpoint contract and orchestrator cutover](../packages/todo-20260420-startup-checkpoint-contract-and-orchestrator-cutover.md)
2. [Node admission contract and cluster incarnation fence](../packages/todo-20260422-node-admission-contract-and-cluster-incarnation-fence.md)
3. [Join readiness snapshot, repair, and waiter owner split](../packages/todo-20260420-join-readiness-snapshot-repair-and-waiter-owner-split.md)
4. [Rebalancer operation admission snapshot and lane unification](../packages/todo-20260420-rebalancer-operation-admission-snapshot-and-lane-unification.md)
5. [Rebalancer plan, admission, and execution seam closure](../packages/todo-20260420-rebalancer-plan-admission-and-execution-seam-closure.md)
6. [Middle-layer legacy surface deletion and proof hardening](../packages/todo-20260420-middle-layer-legacy-surface-deletion-and-proof-hardening.md)

## Execution Order

1. Package `1` starts first and defines the startup checkpoint contract that
   seed/join orchestrators must consume.
2. Package `2` starts after package `1` and names the node-admission contract
   that fresh join, durable rejoin, and reintegration must all consume.
3. Package `3` starts after package `2` so join readiness feeds the explicit
   admission contract instead of staying another lifecycle side channel.
4. Package `4` starts after the sprint entry gate closes and defines the
   coordinator-owned admission snapshot for all rebalancer lanes.
5. Package `5` starts after package `4` so the planner/coordinator seam uses
   the shared admission contract instead of inventing another one.
6. Package `6` is mandatory and executes only after packages `1` through `5`
   land. This sprint does not close on "new path added."

## Simplification Rules

1. Replace checkpoint predicates based on object existence with one
   `StartupCheckpointSnapshot` contract.
2. Keep one node-admission story across checkpoint, promotion, readiness,
   publication, runtime handoff, and reintegration.
3. Separate observation from repair and waiting in join readiness.
4. Keep lane-specific admission policy small and data-driven over one shared
   snapshot.
5. Keep planning and cadence in `UnifiedRebalancer`; keep admission and
   execution decisions in `RebalanceCoordinator`.
6. Do not preserve old and new middle-layer meanings in parallel.
7. Closure requires deletion of compatibility predicates, wrapper logic,
   delegate surfaces, and stale diagnostics vocabulary.

## Contract Changes

1. Internal startup contract:
   `StartupCheckpointSnapshot { checkpoint, state, ready, reasonCodes, retryAfterMs, evidence, missingOwners }`
2. Internal node-admission contract:
   `NodeAdmissionSnapshot { nodeId, startupMode, clusterIncarnationId, checkpointState, promotionState, restoreState, readinessState, publicationState, runtimeHandoffState, admissionState, blockerReasonCodes, retryAfterMs, evidence }`
   plus
   `NodeAdmissionDecision { state, admitted, nextAction, reasonCodes, retryAfterMs }`
   plus
   `ClusterIncarnationFence { clusterIncarnationId, localIdentityState, durableMembershipState, peerProofState, decisionState, reasonCodes }`
3. Internal join-readiness split:
   `JoinReadinessSnapshot`, `JoinReadinessRepairDecision`, and
   `JoinReadinessWaitResult`
4. Internal rebalancer admission contracts:
   `OperationAdmissionSnapshot` and `OperationAdmissionDecision`
5. Internal planner/coordinator seam contracts:
   `RebalancePlan` and
   `RebalancePlanExecutionDecision { state, moveLimit, publicationEpoch, retryAfterMs, reasonCodes }`
6. Forbidden closure state:
   legacy predicates, fallback ladders, delegate bags, or planner-local
   admission grammar surviving beside the new contracts

## Validation

1. Focused startup workflow, checkpoint, join-readiness, and cleanup suites
2. Focused coordinator and unified-rebalancer suites for admission and seam
   ownership
3. Named scenario evidence for the scenario targets above
4. `npm run test:metrics`

## Exit Check

1. Seed/join checkpoint progression and resume decisions come from one
   checkpoint-owner contract.
2. Fresh join, durable rejoin, and reintegration consume one
   node-admission contract and one cluster-incarnation fence.
3. Join readiness has one snapshot owner, one repair owner, one waiter, and
   one active-node/cohort authority.
4. Add, priority-add, and remove admission consume one shared snapshot and one
   coordinator-owned decision grammar.
5. `UnifiedRebalancer` no longer rebuilds budget or admission semantics that
   belong with the coordinator.
6. Legacy middle-layer predicates, delegate bags, and local grammars are
   deleted.
7. `architecture/current-owner-maps.md` and any touched static guardrails are
   updated in the same closure cycle.
