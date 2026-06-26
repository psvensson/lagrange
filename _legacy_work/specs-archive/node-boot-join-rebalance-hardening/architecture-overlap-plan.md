# Architecture Overlap Audit and Convergence Plan

## Objective

Eliminate overlapping or contradictory runtime logic in boot, join, and
rebalancing by enforcing one owner and one execution path per concern.

This plan focuses on contradictions observed in February 8, 2026 runtime logs:

- repeated ADD planning despite target replica count already met
- repeated operation transitions for the same operation IDs
- transient leaderless writes on system partitions during rebalance
- join instability when learner replicas are treated as fully ready too early

## Single-Owner Matrix

| Concern | Canonical Owner (Target) | Overlap/Contradiction Today | Decision |
| --- | --- | --- | --- |
| Replica target placement planning | `MovePlanner` | `UnifiedRebalancer` still has duplicated placement logic with node wrapping behavior when nodes < target replica count | Remove duplicated placement logic from `UnifiedRebalancer`; route planning through `MovePlanner` only |
| Operation dispatch trigger | `ReplicaDispatchService` with atomic step claim | Dispatch can be initiated from multiple triggers without a claim transition guard | Keep both trigger sources, but require atomic `PENDING -> SENDING` claim before dispatch; only claimant can execute |
| Node readiness policy for dispatch/rebalance | Shared readiness evaluator | `UnifiedRebalancer.isNodeReady` and `ReplicaDispatchService.isNodeReady` are similar but not identical | Introduce shared readiness policy and use it in both places |
| ADD operation completion semantics | `PartitionService` role readiness + coordinator completion rules | `ReplicaHandler` marks ADD operation and service status active before learner promotion completes | Gate completion on voter-ready condition (not learner) for partition ADDs |
| Leader/service lookup for query routing | `services` table via system cache/SQL routing | `QueryExecutor` used a `NodeService` leader hint path that could bypass cache authority | Remove node-local leader hint path; use `services` table only for candidate ordering |
| Rebalance safety for system partitions | `RebalanceCoordinator` safety rules | REMOVE can start while replacement is not quorum-safe for critical system partitions | Add critical-partition remove guard requiring replacement voter readiness |
| Rebalance trigger ownership | single node-state transition trigger path | bootstrap delay trigger + periodic checks + other runtime triggers can overlap | Keep one canonical trigger manager; bootstrap delay path only in bootstrap window |
| Replica lifecycle state progression | `replica_operations` workflow + services status consistency | workflow transitions and service state updates can appear out of order during retries | Add step monotonicity checks and idempotent upsert/update contracts around operations |
| Join query-state execution | `NodeJoiningService.phaseQuerySystemState` | Legacy `QueryStatePhase` module duplicated runtime query-state/hydration flow | Remove duplicate phase module and retain a single join query-state owner |

## Contradiction Register

| ID | Symptom | Likely Root Cause | Matrix Mapping |
| --- | --- | --- | --- |
| CR-001 | ADD moves emitted even when count appears at target | planner duplication and wrapped target-node generation | placement planning |
| CR-002 | Same operation shows repeated `PENDING -> SENDING -> CREATING` patterns | non-atomic dispatch claim under repeated triggers | operation dispatch trigger |
| CR-003 | `No leader service found for partition` during node endpoint updates | leader routing path instability during concurrent rebalance/remove | leader lookup + system partition safety |
| CR-004 | Second/third node joins destabilize cluster then cleanup triggers | learner replicas marked active before true voter readiness | ADD completion semantics |
| CR-005 | High volume cache warnings (`INSERT on existing`, `UPDATE on non-existing`) | at-least-once updates without strict operation idempotency boundaries | lifecycle progression |
| CR-006 | Join-state flow diverges across modules and tests | duplicate query-state owner paths (`NodeJoiningService` + `QueryStatePhase`) | join query-state execution |

## Convergence Rules

1. One concern, one owner, one mutable source of truth.
2. Any additional path must be either:
   - read-only hint, or
   - explicit fallback with TTL and structured diagnostic logging.
3. Every state transition must be monotonic and idempotent.
4. For system partitions, safety beats liveness: never remove before replacement
   is quorum-safe and routable.

## Execution Order

1. Dispatch Claim Hardening
   - Add atomic claim transition for dispatch.
   - Reject duplicate dispatch attempts after claim is taken.
2. Learner-Safe Completion
   - Separate learner readiness from active readiness for ADD completion.
   - Prevent REMOVE on source until replacement voter readiness is proven.
3. Planner Unification
   - Remove duplicated placement methods from `UnifiedRebalancer`.
   - Use `MovePlanner` as the single planning implementation.
4. Leader Routing Unification
   - Enforce `services`-backed leader routing for writes.
   - Limit node-local leader directory to non-authoritative hint usage.
5. Trigger Consolidation
   - Ensure one canonical rebalance trigger path after bootstrap window.
6. System Partition Safety Guards
   - Add explicit guardrail checks in coordinator for critical system tables.

## Test Gates (Test-First)

1. Duplicate dispatch prevention
   - New integration test: operation dispatched once under repeated CDC/update
     events.
2. Learner-safe remove gating
   - New integration test: source remove blocked until target leaves learner
     role for critical partitions.
3. Planner single-path verification
   - Unit test: rebalancer planning path invokes only `MovePlanner` and does
     not wrap target nodes.
4. System write routability under rebalance
   - Integration test: no leaderless write failures for `node_endpoints-p1`,
     `nodes-p1`, `services-p1`, `replica_operations-p1` during join rebalance.
5. Trigger deduplication
   - Unit/integration test: one state transition to ready causes one rebalance
     trigger per partition manager in steady state.

## Exit Criteria

1. All contradiction register items (CR-001..CR-005) have passing tests.
2. No conflicting owner paths remain in runtime for the matrix concerns.
3. `architecture.md` and this spec stay aligned with implemented behavior.
