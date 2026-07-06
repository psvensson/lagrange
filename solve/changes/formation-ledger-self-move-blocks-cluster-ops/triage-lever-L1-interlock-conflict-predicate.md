# Triage lever L1 — narrow operation-ledger interlock conflict predicate

## Verdict

**DROP for the current live bundle.** The external practice argument is sound as a design principle — production systems scope freeze/rebalance gates away from foreground admission (Elasticsearch separates allocation from rebalance, Ceph rebalance flags do not gate client I/O, Consul Autopilot gates voter promotion only) — but the E-cheap guardrail fails here: the live `data/examples/service-data-affinity-demo/node-*.log` bundle does **not** show the ratings table being rejected by `operation_ledger_self_move_in_flight` during [2/4]. It shows earlier rebalancer move skips, then a ratings `ADD` operation that is admitted and fails while inserting its `replica_operations` row.

External-practice citations: Elasticsearch's allocation/rebalance gates are orthogonal (`research-external-systems-selfmove-interlock.md:93-116`), Ceph `NOREBALANCE` does not gate client I/O (`research-external-systems-selfmove-interlock.md:120-145`), and Consul Autopilot gates only the `AddVoter` transition (`research-external-systems-selfmove-interlock.md:163-175`).

## T1 — actual live rejection site

### Count normalization

The headline counts are raw string occurrences, not distinct JSON events:

| reason | raw occurrences | JSON log records | first record | last record | records after ratings create starts |
| --- | ---: | ---: | --- | --- | ---: |
| `operation_ledger_self_move_in_flight` | 318 | 159 | `node-0.log:1503` at 15:23:21.100Z | `node-1.log:589` at 15:23:58.952Z | 0 |
| `operation_ledger_quorum_concentrated` | 68 | 34 | `node-0.log:2188` at 15:23:39.031Z | `node-1.log:394` at 15:23:42.909Z | 0 |
| `operation_ledger_self_move_waiting_for_idle_ledger` | 4 | 2 | `node-1.log:614` at 15:24:00.824Z | `node-1.log:1088` at 15:25:11.378Z | 0 |

Each `MOVE_SKIPPED` line carries the reason twice (`admissionReason` and `admissionBlockingReasonCodes`), e.g. `node-0.log:1503` and `node-0.log:2188`; that explains 159×2 = 318 and 34×2 = 68.

### What emitted them

The 318 `operation_ledger_self_move_in_flight` occurrences are **rebalancer create-operation skips for control-plane/system partition REPLACEs**, not ratings DDL provisioning rejections:

```text
node-0.log:1499 15:23:21.093Z execute REPLACE replica_operations-p1
node-0.log:1502 15:23:21.097Z execute REPLACE control_plane_publications-p1
node-0.log:1503 15:23:21.100Z MOVE_SKIPPED control_plane_publications-p1 reason=budget_exceeded admissionReason=operation_ledger_self_move_in_flight
node-0.log:1513 15:23:21.113Z MOVE_SKIPPED sql_transaction_participants-p1 reason=budget_exceeded admissionReason=operation_ledger_self_move_in_flight
node-0.log:1514 15:23:21.113Z MOVE_SKIPPED sql_transactions-p1 reason=budget_exceeded admissionReason=operation_ledger_self_move_in_flight
node-0.log:1515 15:23:21.113Z MOVE_SKIPPED sql_write_operations-p1 reason=budget_exceeded admissionReason=operation_ledger_self_move_in_flight
node-0.log:1517 15:23:21.157Z CREATE_OPERATION REPLACE replica_operations-p1
```

The ordering above is the synchronous create interlock shape: a ledger self-move is between the gate and persist, so siblings are rejected before the ledger self-move's own `Creating operation` line. The wrapper is `createOperation()` -> `runOperationLedgerInterlockAccountedCreate()` (`src/rebalancer/rebalance-coordinator-operation-creation.js:127-136`); the synchronous non-emergency branch throws `operation_ledger_self_move_in_flight` when `state.selfMoveCreateInFlight` or `state.heldSelfMoveOperationId` is live (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:485-511`). The rebalancer log source is `executeMoveViaCoordinator()` catching `createOperation()` errors and attaching `error.admissionResult` (`src/rebalancer/unified-rebalancer-move-execution.js:87-117`), then `logSkippedMoveOutcome()` emitting `admissionReason` and `admissionBlockingReasonCodes` (`src/rebalancer/unified-rebalancer-follow-up-move.js:622-633`).

The 68 quorum-concentration occurrences are the later dependent-operation hold, also rebalancer skips:

```text
node-0.log:2187 15:23:39.031Z operation-ledger quorum concentrated; deferredMoveType=REPLACE deferredPartitionId=control_plane_publications-p1
node-0.log:2188 15:23:39.031Z MOVE_SKIPPED movePartitionId=control_plane_publications-p1 admissionReason=operation_ledger_quorum_concentrated
node-0.log:2189 15:23:39.031Z MOVE_SKIPPED movePartitionId=control_plane_publications-p1 admissionReason=operation_ledger_quorum_concentrated
node-0.log:2190 15:23:39.031Z MOVE_SKIPPED movePartitionId=control_plane_publications-p1 admissionReason=operation_ledger_quorum_concentrated
```

That code path is `ensureOperationLedgerQuorumSpreadFirst()` throwing the concentrated reason (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:315-337`). The 4 waiting occurrences are ledger self-move REPLACEs themselves waiting for idle ledger, e.g. `node-1.log:614` and `node-1.log:1088`; the disruptive self-move predicate is REPLACE/REMOVE of `replica_operations` (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:18-27`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:64-68`).

### Ratings evidence

Ratings starts **after** all interlock reason records have ended:

```text
node-0.log:9215 15:29:32.424Z table-creation-service Creating table tableName=ratings
node-0.log:9223 15:29:32.442Z Create dispatch proceeding without bootstrap topology partitionId=tbl-...-p1
node-0.log:9224 15:29:32.442Z CREATE_OPERATION ADD partitionId=tbl-...-p1 targetNodeId=d376...
```

The `Creating operation` log is after all interlock checks and just before `persistNewOperation()` (`src/rebalancer/rebalance-coordinator-operation-creation.js:580-594`). Therefore the ratings `ADD` was **not** rejected by `runOperationLedgerInterlockAccountedCreate()` and was not blocked by provisioning admission probing. If admission probing had rejected a target, provisioning would have built/logged target rejections via `createProvisioningTargetRejection()` and `logProvisioningTargetRejection()` (`src/query/sql-query-engine-provisioning-admission-methods.js:95-138`) from the precheck loop (`src/query/sql-query-engine-initial-partition-provisioning.js:285-337`); this bundle has no such ratings rejection line, while it has the positive `ADD` creation at `node-0.log:9224`.

The actual ratings failure is the ledger row write itself:

```text
node-0.log:9361 15:29:47.951Z Failed to insert system table row tableName=replica_operations id=8ece... operation=INSERT firstFailedParticipant.partitionId=replica_operations-p1 error=Pending response timeout
node-0.log:9507 15:30:03.866Z Failed to insert system table row tableName=replica_operations id=8ece... operation=INSERT firstFailedParticipant.partitionId=replica_operations-p1 error=Pending response timeout
node-0.log:9508 15:30:03.867Z Failed to persist operation operationId=8ece... tableName=replica_operations code=DISTRIBUTED_PARTICIPANT_FAILURE
node-0.log:9509 15:30:03.867Z Initial table partition provisioning failed tableName=ratings replicaCount=3 error=Distributed operation failed due to participant failures
node-0.log:9510 15:30:03.867Z CREATE TABLE IF NOT EXISTS ratings failed errorCode=DISTRIBUTED_PARTICIPANT_FAILURE deferRetry=true
```

That is a non-conflicting `ADD` row write for another partition, but it was already admitted. L1's proposed admission exemption would not make this INSERT succeed.

## T2 — why the degraded-floor fallback did not save [2/4]

The fallback did not save [2/4] because the CREATE did **not** fail at the target-count admission/floor decision. It failed after an `ADD` operation had been admitted and while that operation tried to insert/update `replica_operations`.

Relevant code shape:

- CREATE TABLE defaults the minimum routable cohort to quorum (`replicaCount=3` -> minimum 2) unless explicitly supplied (`src/query/table-creation-service-partition-provisioning.js:31-39`, `src/query/table-creation-service-partition-provisioning.js:95-108`).
- The transient-shortfall reasons include the three interlock codes (`src/query/sql-query-engine-provisioning-admission-methods.js:7-24`), and `hasOnlyTransientProvisioningShortfall()` recognizes only all-transient rejected targets (`src/query/sql-query-engine-provisioning-admission-methods.js:202-247`).
- The fallback floor can degrade to 1 only when there is a positive but below-target provisionable count and the rejected-target set qualifies (`src/query/sql-query-engine-provisioning-admission-methods.js:256-272`; applied in `src/query/sql-query-engine-initial-partition-provisioning.js:187-234`, `src/query/sql-query-engine-initial-partition-provisioning.js:340-385`, and `src/query/sql-query-engine-initial-partition-provisioning.js:447-493`).
- Even after planning, every planned replica still requires `createOperation()` and then dispatch/persist (`src/query/sql-query-engine-initial-partition-provisioning.js:401-420`, `src/query/sql-query-engine-initial-partition-provisioning.js:520-590`).

Live evidence:

```text
node-0.log:9218-9222 15:29:32.431Z-15:29:32.435Z storage admission allowed for all five target nodes
node-0.log:9224 15:29:32.442Z admitted one ratings ADD operation
node-0.log:9361 15:29:47.951Z ratings operation INSERT into replica_operations failed
node-0.log:9507-9510 15:30:03.866Z-15:30:03.867Z retry INSERT failed; CREATE TABLE failed
```

So the partition did not become routable and no ADD-more-replicas backfill is the observed blocker. The create itself threw before provisioning completion (`node-0.log:9509-9510`). One ratings `ADD` already added failed ledger writes: two failed `INSERT`s (`node-0.log:9361`, `node-0.log:9507`) and a later failed `UPDATE` after the client-visible failure (`node-0.log:9614-9616`). During the ratings-create window, the bundle has 7 failed `replica_operations` writes total; admitting more operation rows would increase pressure on the same failing ledger rather than fix the row-write substrate.

## T3 — narrowed-predicate design options

Current interlock contract:

- Only REPLACE/REMOVE of the operation-ledger partition is classified as a disruptive self-move (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:18-27`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:64-68`).
- A disruptive self-move admits only into an idle ledger; while a live self-move exists, every other non-emergency operation defers (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:100-121`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:192-222`).
- Emergency bypass is ADD-only and limited to `control_plane_publications` and `replica_operations` (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:136-140`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:485-487`, `src/control-plane/priority-recovery-admission-constants.js:43-52`).
- The synchronous create wrapper also blocks non-emergency creates during a local self-move create/hold and blocks self-moves while any other create is in the gate (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:423-535`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:537-561`).
- Stale terminal/timeout exclusions exist; a wedged phantom is not a permanent holder (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:71-97`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:581-615`).

Option evaluation:

| option | Minimal implementation if premise were true | Run-20 risk | Run-22 risk | Test impact |
| --- | --- | --- | --- | --- |
| (i) Exempt all non-disruptive creates for non-ledger partitions | Add a predicate such as `isNonLedgerPartitionOperation(move)` and skip both async and synchronous dependent-hold branches for those moves. | **High.** The run-20 DT's fault model fails progress writes whenever a disruptive ledger self-move and any other non-terminal operation overlap (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:105-110`). The modeled storm includes system REPLACEs and a client table ADD (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:56-75`, `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:216-253`, `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:303-329`). Letting all non-ledger operations in would intentionally recreate the overlap that assertions forbid (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:411-432`, `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:454-470`). | **High.** Run-22's fault model fails while ledger quorum is concentrated and more than one live operation contends (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:275-279`). Tests explicitly require dependents to be rejected while concentrated so the late spread runs alone (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:515-567`, `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:570-607`). | Would require rewriting the core safety assertions, not merely labels. Not justified by current logs. |
| (ii) Exempt only ADDs for non-ledger partitions | Let user/table `ADD` operations bypass `operation_ledger_self_move_in_flight` and perhaps quorum-concentrated holds, while keeping REPLACE/REMOVE serialized. | **Medium-high.** The run-20 DT includes a client `ADD:movies-p1`; the model says one extra ADD is enough to make liveOperationCount > 1 and fail ledger progress writes (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:216-253`, `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:105-110`). Current live ratings already shows one admitted ADD causing failed ledger INSERTs (`node-0.log:9361`, `node-0.log:9507`). | **Medium-high.** Run-22 includes `CLIENT_ADD` as a dependent that must be held while concentrated (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:347-372`, `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:534-567`). Exempting it would need a new proof that ADD row writes do not starve the concentrated ledger; current logs say the opposite. | `test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js` also asserts precheck defers a user-table ADD under a live self-move (`test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js:309-387`); an ADD exemption would deliberately break this run-25 regression unless replaced with stronger evidence. |
| (iii) Extend emergency category to formation-time user provisioning | Treat formation user-table ADDs like emergency quorum-restore ADDs. | **High semantic risk.** Emergency is currently a narrow spine-availability class: `control_plane_publications` and `replica_operations` only (`src/control-plane/priority-recovery-admission-constants.js:43-52`). Ratings is foreground workload, not control-plane quorum restore. | **High.** Same as option (ii), plus it blurs the owner boundary and creates a formation special-case with no current live proof. | Would require new formation-state ownership and tests. This is NEW policy surface, not a surgical predicate narrowing. |

The live bundle quantifies the write-risk direction: one admitted ratings ADD produced at least two failed `INSERT`s to `replica_operations` before the CREATE failed (`node-0.log:9361`, `node-0.log:9507`), plus a retry `UPDATE` after client-visible failure (`node-0.log:9614-9616`). That is not the run-20 skip storm, but it is the same ledger-write starvation substrate; admitting more rows while the ledger cannot persist rows is not a credible fix without a separate buffering/level-triggered progress design.

## T4 — DT-ability

Yes, the existing DT harness can reproduce the **claimed** RED without fake preconditions, but that RED is not what this live bundle shows.

Sketch for the claimed L1 RED:

1. Reuse `createTimeoutTestCoordinator()` and virtual time as in `dt6-rebalancer-formation-self-move-interlock` (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:201-223`, `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:294-355`).
2. Create a real `REPLACE replica_operations-p1` operation through `coordinator.createOperation()`; drive it to a non-terminal in-flight step using the existing tick-driver style (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:145-169`).
3. Instantiate `SQLQueryEngine` initial provisioning (not only `coordinator.createOperation`) and call `provisionInitialTablePartition({partitionId: 'ratings-p1', replicaCount: 3, minimumRoutableReplicaCountWasDefaulted: true})` as the run-24 test does (`test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js:131-181`).
4. Assert the current RED is the binding observable: target rejection/precheck or create rejection with `operation_ledger_self_move_in_flight`, then after the candidate change assert at least one `ADD` operation is created and the partition becomes routable.

That test must not use the run-24 mock hold (`test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js:74-112`) as proof for L1, because L1's guardrail requires a **real in-flight ledger self-move** from the coordinator. It also must be paired with run-20/run-22 controls: the current dt6 tests intentionally model that client ADD overlap can wedge progress (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:105-110`, `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:275-279`).

For the **actual current log failure**, the DT should instead model admitted ratings ADD + failing `replica_operations` INSERT/UPDATE while the ledger raft group is degraded. That is a different lever class (ledger write durability/buffering or faster ledger spread), not L1 admission-predicate narrowing.

## T5 — final classification

- **Verdict:** **DROP** as a ship candidate for this quest attempt. If someone supplies a different live bundle where ratings `CREATE TABLE` after its `Creating table` line produces `Table partition target node rejected` / `operation_ledger_self_move_in_flight` for `tbl-...ratings...-p1` before any `Creating operation`, re-triage as **NEEDS-PREREQ** with the DT above.
- **Reuse level:** L1 would be **EXTENDED** if revived (it would alter the existing ledger interlock and existing SQL provisioning tests), not NEW architecture. Option (iii) would become NEW policy because it expands the emergency class beyond the control-plane spine.
- **Blast radius if revived:** `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js`; possibly `src/control-plane/priority-recovery-admission-constants.js` for emergency category changes; tests in `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js`, `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js`, `test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js`, and `test/rebalancer/interlock-skip-label-fidelity.test.js`.
- **Risk of re-opening run-20/run-22:** High unless the exemption is proven not to add live ledger-progress/write contenders. Existing tests encode the opposite: run-20 fails on self-move + any other live operation (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:105-110`), and run-22 fails on concentrated ledger + more than one live contender (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:275-279`).
- **Falsifier for this DROP:** a timestamped live excerpt in the ratings window showing ratings target admission rejected by `operation_ledger_self_move_in_flight` or `operation_ledger_quorum_concentrated` before `CREATE_OPERATION ADD`; and a deterministic RED where a real in-flight ledger self-move rejects ratings provisioning, with run-20/run-22 still green after narrowing.
