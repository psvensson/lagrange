# PG-wire placement refusal on f580579a5 (GCP formation run 1): causal investigation (read-only)

Evidence: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-formation-f580579a5-run1/` (node logs from `.playback/report/.full-logs/…/*.log.gz`, `snapshots.ndjson`).
Control: the earlier physical run on 60fe32768, `/tmp/lagrange-physical-peerbytes-nov21/test-output/.playback/report/.full-logs/…`.
Code: `git show f580579a5:<path>`; every file:line below is at f580579a5.
Nodes: SEED = 751f5575, FAB = fab780c9, 868 = 868fba57. Times are each node's own clock.
**[V]** = read directly in code or evidence. **[I]** = my inference. Nothing was run; one run establishes no rate.

## Answer in brief

- The planner for `sys-postgres-wire` runs on the node that leads `service_definitions-p1`. In this run that was FAB from 12:20:54 **[V]**.
- The topology guard reads SERVICES in the gateway's default mode: this node's own replica first, owner RPC only if no local replica answers **[V]**.
- FAB held a `services-p1` replica but never led it (leader: SEED until 12:22:44, then 868) **[V]**.
- A local non-leader replica answers that read with `success: true` and `rowSetComplete: false`, with no error and no reason code. The owner RPC is then never tried **[V code]**.
- The guard requires `rowSetComplete === true`, so it treats the answer as "SERVICES unavailable" and refuses **[V code]**.
- This is the most probable branch, confidence about 90 %. The log line omits the fields that would prove it (section 2).
- Not a regression of the integrated work. The cause entered at c1c57b1d9 (2026-11-08) and is in both 60fe32768 and f580579a5. The 60fe32768 run passed because one node led both partitions **[V]**.

## 1. Decision path

### 1.1 Who decides, where, and when

| Step | Owner and code | Status |
| --- | --- | --- |
| Desired state | Harness scales `sys-postgres-wire` to `replicaCount: 1` through the seed's owner operation (`test/distributed/harness/oltp-scenario-a-lagrange-public-pg-context.js:110-123`). Row change seen on FAB at 12:22:30.649 | V |
| Planner owner | `RuntimeServiceRebalancerOwner`, one `UnifiedRebalancer` per active runtime service (`src/bootstrap/shared/runtime-service-rebalancer-setup.js:1-22, 357-380`) | V |
| Which node | The leader of `service_definitions-p1`; the partition service drives `setLeader` (`…-setup.js:484-526`). FAB: `service_definitions-p1 … role_transition leader quorum_elected` 12:20:54.336, then `Became leader, starting rebalancing scheduler` for `sys-postgres-wire` 12:20:54.643 | V |
| First wake | Cache change on `service_definitions` calls `_wakeOwnedRebalancers` (`…-setup.js:50-54, 144-151, 387-411`). First attempt 12:22:30.865, 216 ms after the row change | V code, I link |
| Cadence | A runtime service below its target uses the priority cadence (`rebalancer-priority-recovery-planning-gate-methods.js:130-154`). A pass that executes no move sets `forcePriorityRetry` (`rebalancer-planning-gate-methods.js:650-677`), which schedules `criticalCheckDelayMs` = 5000 ms (`:751-760`, `unified-rebalancer-policy-scheduler-methods.js:163-170`, `config-definitions.js:139`) | V |
| Logged trigger | Always `periodic`: `advanceCheckCadence` passes `TriggerType.PERIODIC` regardless of the wake (`rebalancer-planning-gate-methods.js:658-662`) | V |

Observed cadence **[V]**: 25 attempts, 12:22:30.865 to 12:24:34.971. Gaps: 0.85 s once, then 5.04–7.16 s (median 5.07 s).

### 1.2 The request

`buildCoordinatorOperationRequest` (`src/rebalancer/unified-rebalancer-move-execution.js:55-69`), sent with `rebalanceCoordinator.createOperation` (`:312`) to the **local** coordinator on FAB:

```
{type: ADD, partitionId: 'sys-postgres-wire', entityType: 'runtime_service',
 entityId: 'sys-postgres-wire', nodeId: <FAB>, replicaId: null,
 moveReason: 'increase_replica_count', enforceConcurrentOperationBudget: true}
```

Log **[V]**: `12:22:30.897 "Executing rebalancing move" … "moveTargetNodeId":"fab780c9…","reason":"increase_replica_count","usingCoordinator":true`.

### 1.3 The guard and its predicate

- Called from `runOperationCreationAdmissionGates` (`rebalance-coordinator-operation-creation-admission.js:280-301`) and `createOperationInternal` (`rebalance-coordinator-operation-creation.js:473-485`).
- Applies only when the entity type is partition, message group or runtime service, the move is ADD or REPLACE, and `enforceConcurrentOperationBudget === true` (`rebalance-coordinator-topology-guard-methods.js:400-416`). Only the unified rebalancer sets that flag (`unified-rebalancer-move-execution.js:65`).
- Predicate behind `replica_inventory_unusable` (`…-topology-guard-methods.js:546-553`): `!inventory.provenance.topologyIncreaseUsable` and neither conservative-union escape applies. Both escapes are partition-only (ledger, priority spread cure).
- `topologyIncreaseUsable` is false when the committed-rows state is `unavailable` (`replica-inventory.js:498-505, 581-586`).
- The committed-rows state is `unavailable` exactly when `authoritativeObservation.available === false` (`…-topology-guard-methods.js:476-478`).
- The refusal is thrown as an admission error (`rebalance-coordinator-concurrent-budget-gate.js:333-350`), turned into a skipped move (`unified-rebalancer-move-execution.js:128-145`) and logged at info (`unified-rebalancer-follow-up-move.js:761-775`).

### 1.4 The "authoritative SERVICES read"

| Property | Value | Where |
| --- | --- | --- |
| Call | `getAuthoritativeEntityServiceRowsObservation({partitionId, entityType, entityId})`, no `readOptions` | `…-topology-guard-methods.js:431-436` |
| Options | `{timeoutMs, routingReadinessDimension: CONTROL_PLANE_RECOVERY_ELIGIBLE}` only | `rebalance-coordinator-shared.js:195-199`, `timeout-budget.js:96-100` |
| SQL | `SELECT * FROM services WHERE service_type = ? AND service_id LIKE ?` with `['runtime_service', 'sys-postgres-wire-r%']` | `entity-service-row-read.js:22-29, 46-51` |
| Strategy | `AUTHORITATIVE` | `control-plane-system-table-gateway-read-contracts.js:228-244` |
| Read mode | `OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK` (the default for an authoritative strategy) | `…-read-contracts.js:133-149` |
| Leader mode | `ANY` (nothing requested) | `…-read-contracts.js:74-82` |
| Local consistency | `local_leader`, fallback `any_replica` | `…-read-dispatch.js:78-86`, `…-gateway-constants.js:63-64` |
| Partition | `services-p1` | `INITIAL_PARTITION_IDS[SERVICES]` |
| Usable when | `success === true && partial !== true && rowSetComplete === true && Array.isArray(rows)` | `rebalance-coordinator-operation-read-methods.js:516-532` |

Classification: this is row 2 of the W4 A.0 table (`OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK`: L, then R only when L is unavailable). Its "leader" is the role-derived belief W3 describes: `resolveLeaderRole` reads the partition service's own `getRole()` (`cdc-integration-service-local-system-table-routing.js:372-403`), and the witness role comes from `this.role` (`partition-service-remote-query-methods.js:192-218`). It is not a strict shape: no `OWNER_RPC_REQUIRED`, no leader `REQUIRED`.

How the local arm answers on a node that holds a non-leader replica **[V code]**:

1. `local_leader` pass finds no service (`…-local-system-table-routing.js:465-470`), so the snapshot is unavailable (`cdc-integration-service-authoritative-read-flow.js:305-307`).
2. `any_replica` pass runs (`…-read-flow.js:572-587`). `executeLocalQuery` has no role check and returns `{success: true, rows, rowSetComplete: true}` (`partition-service-write-metrics-base.js:236-263`).
3. No valid leader witness can be built, because the role is `follower` (`…-local-system-table-routing.js:46-62`, `control-plane-authoritative-read-witness.js:22`).
4. The rows are still accepted and `available = true` (`…-read-flow.js:323-339`), but `rowSetComplete` is false because zero witnesses were collected (`:355-363`).
5. Because `localRead.available` is true the function returns the local result at once (`:627-634`): `success: true, rowSetComplete: false, source: 'local_partition_replica', localReplicaFallbackHit: true`, no `error` (`:590-613`). The owner RPC at `:706` is not reached.
6. The gateway keeps `rowSetComplete: false` and labels the outcome `AUTHORITATIVE` (`control-plane-system-table-gateway-read-strategies.js:62-67, 183-201, 439-447`).
7. The coordinator computes `available: false, rows: [], error: null, reasonCode: null, snapshotVersion: null` (`rebalance-coordinator-operation-read-methods.js:516-547`).

That is field for field what was logged: `"authoritativeAvailable":false,"authoritativeReasonCode":null,"authoritativeRetryAfterMs":null`, `"committedRowsState":"unavailable"`, `"inventorySourceRevisions":{"committedRows":null,…}`.

### 1.5 Every way the read comes back "not usable", and the reason code each sets

**No branch of the real gateway or CDC read path sets `reasonCode` [V]** (`git grep reasonCode` over the gateway read files, `src/cdc` read flow, owner-RPC execution, terminal gate and pressure governor: no producer). The only producer is B0. So `authoritativeReasonCode: null` does not identify a branch; every branch below except B0 logs null.

| # | Branch | Result shape | `reasonCode` |
| --- | --- | --- | --- |
| B0 | Unsupported entity type (`entity-service-row-read.js:84-91`) | `success: false`, error text | `unsupported_rebalancer_entity_type` |
| B1 | Pressure governor defers or rejects (`…-read-dispatch.js:112-131`, `pressure-governor.js:478-491`) | `success: false`, `errorCode`, `retryAfterMs` | none |
| B2 | CDC service lacks the read method (`…-read-strategies.js:386-428`) | `AUTHORITATIVE_READ_OWNER_UNAVAILABLE` | none |
| B3 | Read authority token missing (`…-read-flow.js:526-533`) | `READ_AUTHORITY_REQUIRED` | none |
| **B4** | **Local non-leader replica answers** (`…-read-flow.js:355-363, 590-613, 627-634`) | **`success: true`, `rowSetComplete: false`, no error** | **none** |
| B4b | Local leader whose witness fails validation, e.g. term < 1 or null indices (`…-local-system-table-routing.js:29-44`) | same as B4 | none |
| B5 | Local unavailable, owner RPC fails: routing, timeout, transport (`cdc-integration-service-owner-rpc-read-execution.js:388-503`) | `success: false`, `error`, `errorCode` | none (top level; not exhaustively enumerated for the query executor, **I**) |
| B6 | Owner RPC succeeds but rows are not an array, or `partial`, or `rowSetComplete !== true` (`…-owner-rpc-read-execution.js:56-90`) | `AUTHORITATIVE_QUERY_FAILED` or `success: true` incomplete | none |
| B7 | No local replica and no owner RPC route (`…-read-flow.js:755-771`) | `authoritative_row_source_unavailable` | none |
| B8 | Terminal gate refuses the stage (`cdc-terminal-gate.js:39-53`) | `success: false`, `errorCode` | none |
| B9 | Failure evidence on a success: `failedPartitions`, `partitionErrors`, `participantFailures` (`…-read-strategies.js:50-67`) | `rowSetComplete: false` | none |
| B10 | Leader `REQUIRED` and witness invalid (`…-operation-read-methods.js:523-532`) | not this caller | none |

B4 is the only branch where the read itself reports success. It is unavailability expressed as a successful answer with one false flag.

## 2. Which branch fired

**B4, confidence about 90 %.** Support:

| Evidence | Status |
| --- | --- |
| FAB led `service_definitions-p1` (term 2, 12:20:54.336) and so ran the planner | V |
| FAB's `services-p1` replica `replace-replica-d3bb…` was learner from 12:16:36, then follower; never leader. FAB log: `12:22:38.740 … "partitionId":"services-p1" … "role":"follower" … "previousLeader":"services-p1-r1","newLeader":null`; `12:22:44.153 … "role":"follower" … "newLeader":"replace-replica-9a87…"` | V |
| `services-p1` leader: SEED term 1 from 12:14:32.186; 868 `quorum_elected` term 2 at 12:22:44.050 | V |
| Published `partitions.leader_node_id` in snapshots: `services-p1` = SEED at 12:22:20 and 12:22:34, 868 from 12:22:46; `service_definitions-p1` = FAB throughout; `replica_operations-p1` SEED then FAB | V |
| SERVICES rows: 141, all `service_type: partition`; zero runtime-service rows in every sampled snapshot of the window | V |
| All 25 refusals are byte-identical in the admission snapshot, including source revisions and watermarks (`committedRows` watermark 1795263749875 = 12:22:29.875 in all 25) | V |
| Guard duration: 548 ms, 227 ms, then 15–25 ms in 20 of the remaining 23 (others 42, 207 ms) on a node at 85–94 % CPU | V |
| The outcome did not change across the `services-p1` election (attempts at 12:22:36.969 and 12:22:44.130 both refuse in 17–18 ms). A remote read would have had no leader for about 5 s | V times, I reading |
| No `Wait bound spent` for a `services-p1` read on any node in the window (the three on FAB at 12:22:40 are a `logs-p1` write). No "Failed to read authoritative system table rows from local partition replica" warning. No `owner_rpc`, `leader witness`, `row set incomplete` or `Partition service not found` line | V |
| Code: with an initialised local replica the local arm always answers, so B5–B7 are unreachable from FAB | V code |

Alternatives not excluded by logs: B1 (pressure) and B8 (terminal gate) also produce a fast local refusal with null reason. Neither fits 25 identical answers over two minutes on a node that was otherwise serving; neither logged anything. B4b is excluded because FAB was not the leader.

**Serving replica [I]:** FAB's own follower replica. No node logs individual reads (`metrics.partition.sqlite` count is 0 in all three logs; no level-20 lines), so the serving side is silent.

**The missing log fields.** The snapshot built at `…-topology-guard-methods.js:591-604` copies only `available`, `reasonCode` and `retryAfterMs` from the observation. The observation already carries `source`, `rowSetComplete`, `partial`, `error` and `readAuthorityWitness` (`…-operation-read-methods.js:533-547`). Any one of these would have settled it:
- `source` (expected `local_partition_replica`),
- `rowSetComplete` (expected `false`) together with the read's `success` (expected `true`),
- `readAuthorityWitness.role` / `servingNodeId` (expected absent).

## 3. Why it never recovers

- **Identical attempts [V].** Same node, same local replica role, same SQL, same answer. One distinct admission snapshot across 25 attempts.
- **What would change it [V code].** Only a leadership event: FAB becoming leader of `services-p1`, or `service_definitions-p1` leadership moving to the `services-p1` leader. The one leadership change that did occur (SEED → 868 at 12:22:44) moved it to another non-planner node and changed nothing. No publication, cache refresh or SERVICES row can change it: availability is decided by the local replica's role, not by content.
- **Wakes [V].** Cache changes on `service_definitions`, `call_activation_leases`, `service_partition_access` (`runtime-service-rebalancer-setup.js:50-54`), plus the 5 s timer. A SERVICES change only reconciles the rebalancer set (`:44-49, 144-147`). There is no wake on `services-p1` leadership, and none is needed while the timer runs; the timer simply repeats the same question.
- **Owned consequence: none [V].** The refusal becomes a skipped move, an info log line, a zero executed-move count and a 5 s reschedule (`unified-rebalancer-move-execution.js:128-145`, `rebalancer-planning-gate-methods.js:663-676`). No other read mode is tried, no retry-after is carried (`authoritativeRetryAfterMs: null`), nothing is recorded on the service definition, and the scale operation had already answered `applied`. It is a blind retry.
- **R07 / R11 [V].** Unavailability is not a typed outcome here. The read says `success: true`; the coordinator infers "unavailable" from `rowSetComplete !== true`; the guard infers "inventory unusable" from that; the log carries reason code null. R11 ("dependency unavailability is an explicit, typed outcome") and R07 ("never inferred from an empty, absent or ambiguous value") are both breached at the read boundary.

## 4. How specific is it

Not specific to wasm or runtime services, to single-replica services, or to the target being the planner's own node.

- **Target node is irrelevant [V].** In the 60fe32768 run the target was a different node (`f848ecc2`) and the planner admitted it.
- **The condition [V code]:** a topology-increasing ADD or REPLACE created through the unified rebalancer, on a node that holds a `services-p1` replica it does not lead.
- **Odd asymmetry [V code, I runtime]:** a node with *no* local `services-p1` replica falls through to the owner RPC, which in leader mode `ANY` accepts any replica's answer as complete (`…-owner-rpc-read-execution.js:442-451`, `partition-service-remote-query-methods.js:147-165`). So a node holding a follower replica is refused, while a node holding none is served by a follower elsewhere. In a three-node, replication-factor-three cluster every node holds a replica, so every non-leader is refused.

**Why the 138 partition placements succeeded: they never ran this guard [V].**

| | Formation partition ADDs | `sys-postgres-wire` ADD |
| --- | --- | --- |
| Planner | `ReplicaPlacementOwner` (`replica-placement-owner.js:3-8`), partition-only (`:417, 504`) | `UnifiedRebalancer` under `RuntimeServiceRebalancerOwner` |
| Admission | `requestPlacementAdmission` on the ledger partition; census from committed `replica_operations` | coordinator `createOperation` gates, then placement admission |
| `enforceConcurrentOperationBudget` | not set | `true` |
| Topology guard | returns ALLOWED before any read (`…-topology-guard-methods.js:406-416`) | full read and decision table |
| Evidence | zero `Executing rebalancing move` lines for a partition entity on any node | 25 on FAB |

Differences inside the guard for the partition case, had it run **[V code]**: the SQL is an equality on `partition_id` instead of `LIKE`; a target replica count is resolved (`:287-305`); two conservative-union escapes exist for ledger and priority spread cures (`:156-285`). The read and the usability predicate are the same, so an untyped partition ADD or REPLACE from a partition leader that does not lead `services-p1` would be refused the same way **[I]**.

## 5. History and blast radius

### 5a. Regression or older

**Older, and latent.** Not caused by named control-plane writes, read lifetime or placement custody.

- `git diff 60fe32768 f580579a5` over the guard, the coordinator read, the entity read, the CDC read flow and local routing, the gateway read contracts, dispatch and strategies, the partition local query and witness builder, the inventory, the runtime rebalancer setup: **one line changed** (an added export in `…-read-strategies.js`) **[V]**. 60fe32768 is not an ancestor of f580579a5 (merge base 675532a63).
- **c1c57b1d9** (2026-11-08, "enforce complete leader read provenance and multi-write policy fences") introduced both halves **[V]**:
  - the local arm's `rowSetComplete` now requires a leader witness per local service, and the local result carries it explicitly;
  - the coordinator's `available` changed from `result.success === true && Array.isArray(result.rows)` to require `rowSetComplete !== false`.
  The mode's fall-through rule ("R only when L is unavailable") was not changed with it.
- **947fbe658** (2026-11-09) tightened `!== false` to `=== true` **[V]**. No effect on this case.
- Both commits are ancestors of both run commits **[V]**.

**The 60fe32768 control [V].** Node f3ef88ba led `service_definitions-p1` (06:46:09.017) and `services-p1` (06:46:09.106, until 06:57:51). PG-wire placement ran at 06:55:52: `Executing rebalancing move` → `Storage reservation created with operation … "operationId":"pl-sys-postgres-wire-732-0"` 06:55:53.832 → `Operation completed` 06:56:03.017; replica created on f848ecc2. Same guard code; the only difference is that the planner node led `services-p1`.

**Prior quests on this guard [V from quest logs at f580579a5].**

| Quest | What it concluded |
| --- | --- |
| `priority-recovery-replace-owner-inventory-unavailable` | Priority REPLACEs "repeatedly rejected as replica_inventory_unusable" while SERVICES authority was unavailable; added a typed recovery-cure exception |
| `formation-priority-spread-without-exclusive-self-move-cost` | Concentrated-ledger cure classified as generic `replica_inventory_unusable`; widened the ledger escape |
| `spread-cure-at-target-minting-gap` | Guard "denied every untyped ADD replica_inventory_unusable"; fixed cure typing and the escape's creation-phase test |
| `movielens-nodes-priority-recovery-escape` | 101 of 375 skipped moves were `replica_inventory_unusable`; noted it "blocks the 2nd runtime-service replica placement"; attributed to rebalancer churn |
| guard comment `…-topology-guard-methods.js:193-209` | 2026-07-18 terminal stall: every spread ADD denied for 3 minutes |

Pattern: each took "SERVICES owner unavailable" as given and added an escape for one partition cure class. None covers runtime services, and none asked why the read was unavailable. Those incidents predate c1c57b1d9, when a follower answer still counted as available, so they are not the same mechanism **[I]**.

`postgres-wire-owner-scale` explicitly scoped itself to durable desired state, "not achieved placement".

### 5b. Other consumers of the same read

| Consumer | Mode | Effect on a non-leader host |
| --- | --- | --- |
| Topology guard (`…-topology-guard-methods.js:431`) | default | blocks ADD/REPLACE (this defect) |
| `getRetiredReplaceSourceMoveSafetyError` (`rebalance-coordinator-replica-identity-methods.js:407-413`) | default | silently gets `rows: []` |
| `allocateCanonicalReplicaId` via `getAuthoritativeEntityServiceRows` (`…-replica-identity-methods.js:438-443`) | default | silently gets `[]`; allocator sees cache rows only |
| `readBootstrapServiceRows` (`rebalance-coordinator-operation-creation.js:374-401`) | default | falls back to cache rows |
| Priority surplus REMOVE fence (`…-topology-guard-methods.js:362-371`) | `OWNER_RPC_REQUIRED` + leader `REQUIRED` | not affected |
| Ledger quorum-spread confirmation (`rebalance-coordinator-ledger-interlock-admission.js:515-524`) | `OWNER_RPC_REQUIRED` | not affected |
| `priority-publication-safety-rows.js:122` | own options, own completeness test (`:66-70`) | not checked |

The two "silently `[]`" consumers turn unavailability into "no rows" (R07). I did not trace their consequences.

Every other default-mode authoritative read that tests `rowSetComplete === true` has the same exposure. Candidates from `git grep rowSetComplete` **[not traced]**: `replica-operation-repository-entity-read-methods.js:230, 268`, `…-observation-methods.js:506`, `…-read-methods.js:391, 662`, `control-plane-publications-owner.js:117`, `replica-cleanup-tombstone-owner.js:264`, `replica-handler-learner-retirement-authority.js:37`, `table-policy-resolution.js:76`.

## 6. Reproducing witness

No multi-node or timing condition is needed. The follower role is a property of the injected partition service.

**Construction (production objects):**
- Real `RebalanceCoordinator`, built as in `test/rebalancer/rebalance-coordinator-topology-guard.test.js:5-14` (`fixtureCommittedReadCoordinator`).
- Real `ControlPlaneSystemTableGateway`, real `CDCIntegrationService`, real `SystemTableCache`, composed as in `test/integration/control-plane-postgres-wire-scale.integration.test.js:35-64`.
- The CDC service's `partitionServicesProvider` returns one `services-p1` partition service in follower role. Preferred: a real `PartitionService` over SQLite with the services schema, so `executeLocalQuery` and `buildRemoteReadAuthorityWitness` are production code. Existing lighter fixture: `createLocalSystemTablePartitionServices(SYSTEM_TABLE_NAME.SERVICES, {isLeader: false, executeLocalQuery})` (`test/cdc/cdc-integration-service-test-support.js:125-157`).
- `sqlQueryEngine.queryExecutor.executeOnPartition` stands for the `services-p1` leader on another node: answers the same SQL with `success: true, rowSetComplete: true`, rows from the same table, and a witness `{state: 'observed', role: 'leader', partitionId: 'services-p1', servingNodeId, servingReplicaId, observedAtMs}`. Count its calls.

**Do not reuse** the fake SQL engine of `rebalance-coordinator-topology-guard.test.js:75-92`: it answers `rowSetComplete: true` directly and matches only `partition_id = ?`, which is why the existing guard tests cannot see this.

**State:**
- `service_definitions` row from `createPostgresWireDefinition()` with `replica_count: 1`.
- SERVICES holds partition rows only; no `sys-postgres-wire-rN` row; no in-flight operation; operation visibility usable.

**Action:** `coordinator.createOperation` with exactly the request in section 1.2.

**Red today:** rejects with `admissionResult.reason === 'replica_inventory_unusable'`, `topologySnapshot.authoritativeAvailable === false`, `authoritativeReasonCode === null`; `executeOnPartition` call count is 0.

**Property to assert:** the guard decides on a complete SERVICES answer or on a typed unavailability. With the leader reachable, the ADD is admitted (an operation row is created). With the leader unreachable, the refusal carries a non-null typed reason.

**Anti-vacuity anchors:**
1. Same fixture with the local replica as leader (`getRole()` → `leader`) admits today. This mirrors the 60fe32768 control.
2. In the red case, assert the gateway read result has `source === 'local_partition_replica'`, `localReplicaFallbackHit === true`, `success === true`, `rowSetComplete === false`, so the test is red for the stated reason and not for an incomplete fixture.
3. With a row `sys-postgres-wire-r1` on the target node present at the leader, the guard still refuses with `target_node_already_occupied`.

Note: `test/cdc/cdc-integration-service-authoritative-reads.test.js:349-418` pins the local arm's behaviour as intended ("should use a local follower before routed SQL when replica fallback is allowed") and does not assert `rowSetComplete`.

## 7. What "healthy public PostgreSQL wire endpoint" requires

- **Scale [V]:** one request to the seed for `replicaCount: 1` with `{host: '0.0.0.0', authMode: 'password', tlsMode: 'disable'}`; must answer `success: true, outcome: 'applied'` (`…-public-pg-context.js:21-27, 95-123`). That proves durable desired state only.
- **Probe [V]:** on the seed's admin SQL, `SELECT service_id, node_id, protocol, address, port, health_status FROM service_endpoints WHERE service_id = 'sys-postgres-wire'`, every 250 ms for 120 s (`:151-167`; `constants.js:54, 126`).
- **Passing row [V]:** `service_id = 'sys-postgres-wire'`, `protocol = 'postgresql'`, `health_status = 'healthy'`, integer `port > 0`, and `node_id` is a node the harness knows with an IP (`:125-149`; contract `oltp-scenario-a-lagrange-proof-plan.js:37-45`).
- **Meaning:** the service must run on **one** node, any node. The harness connects to that node's IP and port. It is not required on every node and not behind every node.
- **"Every node" in predicate e [V]** refers to the row, not the wire: one INSERT and readback through the PG wire, then the row read through each node's admin query, then one admin INSERT per node read on the next node (`fresh-formation-user-table-routability.js:399-441`).
- In this run no replica was ever created, so no `service_endpoints` row existed and the 120 s poll expired.

## 8. First causal divergence

- **Owner:** the authoritative read's mode contract in the CDC read flow, `executeAuthoritativeSystemTableRead` (`cdc-integration-service-authoritative-read-flow.js:590-634`), as consumed by the coordinator's SERVICES observation (`rebalance-coordinator-operation-read-methods.js:496-548`).
- **Divergence:** since c1c57b1d9 the local arm labels a non-leader answer incomplete, yet still counts it as "available" and returns it as the final, successful result. The consumer requires completeness and requests a mode that cannot deliver it from a non-leader host.
- **Contracts violated:** R11 (unavailability is an explicit typed outcome, never a competing decision path) and R07 (an outcome is a named state, never inferred from an ambiguous value). The blind 5 s retry downstream is the missing owned consequence of a refusal.

## 9. Not determined

- Direct proof of B4: the refusal log omits the read's `source`, `success`, `rowSetComplete` and witness; no node logs individual reads.
- Whether B1 (pressure) or B8 (terminal gate) can be excluded by evidence rather than by fit.
- Why the first two attempts took 548 ms and 227 ms. FAB became ledger leader at 12:22:34.6, so the operation-visibility read may have been remote before that **[I]**.
- Whether the July–September `replica_inventory_unusable` incidents share any part of this mechanism.
- The consequences for the two consumers that silently receive `[]`, and for the other `rowSetComplete === true` readers listed in 5b.
- Top-level fields of query-executor failure results on the owner-RPC arm (whether any carries `reasonCode`).
- How often the two leaderships coincide. Two runs: once yes, once no.
