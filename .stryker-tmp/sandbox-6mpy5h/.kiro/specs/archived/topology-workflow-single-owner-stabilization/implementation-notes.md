# Implementation Notes — Topology Workflow Single-Owner Stabilization

## Purpose

Consolidated reference for the cutover from the current multi-writer,
process-local, fallback-tolerant topology workflow architecture to the
target single-owner, durable, fail-closed model.

Detailed evidence lives in the per-task inventories:

- `replica-operations-writer-inventory.md` (Task 2.1)
- `managed-split-owner-inventory.md` (Task 2.2)
- `owner-dependency-fallback-inventory.md` (Task 2.3)

---

## Key Findings Summary

### A. `replica_operations` has 6 writers — only 1 is legitimate

| Writer | Classification | Resolving task |
| --- | --- | --- |
| `RebalanceCoordinator` | Owner-legitimate | — (already correct) |
| `ReplicaHandler` | Owner-bypassing | Task 3 |
| `MessageGroupServiceHandler` | Owner-bypassing | Task 3 |
| `RuntimeServiceHandler` | Owner-bypassing | Task 3 |
| `ReplicaDispatchService` | Borderline (dispatch claim) | Task 3 |
| `BootstrapAPI` | Owner-bypassing (special) | Task 3 |

The three executor handlers contain triplicated `updateOperationStep`
logic (§1.2 violation). All three will be replaced with typed outcome
emission routed through the coordinator (Task 3, Task 4).

### B. Managed split ownership is fragmented across 5 components and 10 phases

| Gap | Current owner | Target owner | Resolving task |
| --- | --- | --- | --- |
| Backfill/catch-up/cutover phases | `PartitionService` (process-local) | `ManagedSplitWorkflow` | Task 5 |
| Cutover system table write | `PartitionService.markSplitCutoverActive()` | `ManagedSplitWorkflow` via acknowledgement | Task 5 |
| Catch-up phase constant | Bare string `'split_catchup'` | Add to `PARTITION_TRANSITION_STATE` | Task 5 |
| Source execution progress | `this.splitReplication` (memory only) | Durable participant state via `DurableWorkflowCoordinator` | Task 5 |
| Write mirroring activation | Cache-driven (`SQLQueryEngine` reads cache) | Acknowledgement-driven | Task 5, Task 9 |
| Cleanup phase | Does not exist | `ManagedSplitWorkflow` owns cleanup | Task 5 |
| Recovery after restart | Impossible (state lost) | Reconstruct from durable workflow rows | Task 5 |
| Child metadata atomicity | Sequential fallback when txn coordinator absent | Fail closed — no fallback | Task 7 |

### C. 6 active-path owner-dependency fallbacks must be eliminated

| # | Component | Missing owner | Fallback effect | Resolving task |
| --- | --- | --- | --- | --- |
| 1 | `ControlPlaneReadinessService` | `storageAccountingService` | `placementEligible: false` for all nodes | Task 8 |
| 2 | `ControlPlaneReadinessService` | `cdcGroupPropagationService` | Synthesized `REPAIR_ONLY` → all nodes ineligible | Task 8 |
| 3 | `ManagedSplitWorkflow` | `transactionCoordinator` | Sequential (non-atomic) child metadata insert | Task 7 |
| 4 | `RebalanceCoordinator` | `transactionCoordinator` | Sequential (non-atomic) workflow transitions | Task 7 |
| 5 | `MovePlanner` | `storageAdmissionService` | All nodes pass capacity — no filtering | Task 8 |
| 6 | `MovePlanner` | `storagePressureBehavior` | All moves pass pressure — no gating | Task 8 |

Structural concern: 4 components self-create `ControlPlaneReadinessService`
with potentially incomplete sub-owners (Task 8).

Acceptable: `PartitionSplitMergeManager.tablePolicyService` fallback is
diagnostic-only and not reachable in production wiring.

---

## Finding → Task Resolution Map

| Task | What it resolves |
| --- | --- |
| **3** | All non-owner `replica_operations` writes; triplicated `updateOperationStep`; dispatch-claim bypass |
| **4** | Typed participant acknowledgement payloads; stale/duplicate rejection; shared workflow runtime extension |
| **5** | Fragmented split ownership; process-local-only split state; missing cleanup phase; missing catch-up constant; cutover bypass by `PartitionService` |
| **6** | Readiness conflation (repair vs serve); serve-only gate blocking internal topology work |
| **7** | Optional transaction semantics for atomic cut points (findings #3, #4); sequential fallback removal |
| **8** | All 6 active-path owner-dependency fallbacks; self-created readiness instances; fail-closed wiring |
| **9** | Cache-as-proof completion; cache-driven write mirroring activation; cache divergence recovery |
| **10** | Invariant coverage for all new contracts |
| **11** | Architecture and steering doc sync |
| **12** | Verification ladder (unit → integration → harness) |

---

## Cutover Checklist

Use this as a PR description checklist. Each item maps to a task and must
be verified before the cutover is considered complete.

### Phase 1 — Owner and wiring closure (Tasks 3, 7, 8)

- [ ] `ReplicaHandler`, `MessageGroupServiceHandler`, `RuntimeServiceHandler`
      emit typed outcomes instead of writing `replica_operations` directly
- [ ] `ReplicaDispatchService` dispatch claim routes through coordinator
- [ ] `BootstrapAPI` MOVE_REPLICA writes delegated to coordinator or
      documented as explicit separate ownership domain
- [ ] Triplicated `updateOperationStep` logic eliminated
- [ ] `ManagedSplitWorkflow.insertPartitionMetadataAtomically()` fails
      closed without transaction coordinator
- [ ] `RebalanceCoordinator.executeAtomicTransition()` fails closed
      without transaction coordinator
- [ ] All 6 active-path owner-dependency fallbacks replaced with
      fail-closed behavior
- [ ] Self-created `ControlPlaneReadinessService` instances replaced
      with mandatory injection

### Phase 2 — Durable split workflow (Task 5)

- [ ] `ManagedSplitWorkflow` owns all phases: admission → cleanup
- [ ] `'split_catchup'` added to `PARTITION_TRANSITION_STATE` constants
- [ ] `PartitionService` converted to execution participant with typed
      acknowledgements (no direct system table writes for split state)
- [ ] Source execution progress persisted as durable participant state
- [ ] Cleanup phase implemented (source mirror removal, metadata clear,
      terminal success)
- [ ] Split recovery works after process restart

### Phase 3 — Readiness and cache boundary (Tasks 6, 9)

- [ ] `ControlPlaneReadinessService` exposes `repairEligible` and
      `serveEligible` from one snapshot
- [ ] Internal topology consumers rewired to `repairEligible`
- [ ] Client-routing and benchmark remain on `serveEligible`
- [ ] Cache-as-proof completion branches removed
- [ ] Write mirroring activation is acknowledgement-driven, not
      cache-driven
- [ ] Cache divergence routes through owner queue, not direct mutation

### Phase 4 — Participant acknowledgements (Task 4)

- [ ] Typed acknowledgement payloads defined for rebalance and split
      executors
- [ ] Acknowledgements carry workflow identity and fencing context
- [ ] Stale/duplicate acknowledgements rejected with diagnostics
- [ ] `DurableWorkflowCoordinator` participant persistence reused

### Phase 5 — Invariants and verification (Tasks 10, 11, 12)

- [ ] Invariant checks for: single-writer `replica_operations`,
      acknowledgement-before-advance, split resume, readiness dimension,
      mandatory transaction availability
- [ ] Deterministic regressions for each bug class (from Task 1)
- [ ] Architecture docs and steering synced with final owner map
- [ ] Targeted suites green before harness run
- [ ] 7-node harness confirms (not discovers) correctness

---

## Non-Negotiable Guardrails

These are hard constraints that apply to every task in this spec:

1. **No new workflow engine** beside `DurableWorkflowCoordinator`.
2. **No direct executor mutation** of owner-owned workflow fields.
3. **No process-memory-only split correctness state.**
4. **No serve-readiness gate** on repair/provision paths.
5. **No sequential fallback** for atomic topology cut points.
6. **No owner-dependency fallback** that reconstructs active production
   semantics from raw rows.
7. **No harness-only closure evidence** — deterministic repros first.

---

## Wiring Gaps to Close in Production Setup

From the owner-dependency inventory, `ControlPlaneSetup.create()` is
missing these wirings:

| Dependency | Currently wired? | Consumer |
| --- | --- | --- |
| `DistributedTransactionCoordinator` | No | `ManagedSplitWorkflow`, `RebalanceCoordinator` |
| `StoragePressureBehavior` | No | `MovePlanner` |
| `cdcGroupPropagationService` | Optional (`|| null`) | `ControlPlaneReadinessService` |

These must be wired as mandatory dependencies in Task 8.
