# GCP formation run 1 on f580579a5: causal analysis (read-only)

Run: `fresh-formation-user-table-routability`, three e2-standard-4 VMs, one node per VM, 1.0 CPU / 1 GiB per container, source f580579a5. FAIL after 617.7 s.
Evidence: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-formation-f580579a5-run1/` (node logs from `.playback/report/.full-logs/…/*.log.gz`; operation rows from `snapshots.ndjson`, 523 snapshots; `report.json`; `events.ndjson`; `samples.ndjson`).

Conventions. SEED = 751f5575 (fdiag-1), FAB = fab780c9 (fdiag-2), 868 = 868fba57 (fdiag-3, shares its host with the controller). Node-log times are that node's clock; row times are ledger timestamps; "scenario s" counts from 12:15:11.974. OBSERVED = read from evidence; INFERRED = my reading. One run establishes no rate.

## Summary

- **Nothing was stuck and nothing was re-planned.** Formation is a fixed queue of 138 operations (46 system partitions × 2 ADD + 1 GROWTH_PROMOTE). Each ran exactly once and succeeded. No REPLACE, no REMOVE, no failed or repeated operation.
- **The queue drained at a constant rate and finished 7 s after the bound.** Last system operation terminal at 427.2 s (12:22:19.162); the bound is 420 s plus a 5 s quiet window. The two operations named by the harness were the tail of the queue, 6 s and 3 s old at the last poll. They completed at 12:22:16.811 and 12:22:10.367.
- **The cluster was then quiet for 125 s**, from 12:22:28.905 to the last snapshot. The harness stops evaluating `c` at 420 s, so it never saw this.
- **The rate is set by two things:** the placement copy limit `K_SRC: 3` (all copies come from the seed) and 12.4 s per ADD on a saturated cluster. 92 ADDs × 12.7 s / 3 = 390 s before any disturbance.
- **`e` is a separate, logical failure.** The single `sys-postgres-wire` replica was refused 25 times in 123 s with the same answer, `replica_inventory_unusable`. More time did not change it.
- **CPU saturation is not formation work and not a retry storm.** All three nodes stayed at 85–94 % for the last two minutes with zero operations in flight. Load tracks the number of replicated groups.
- **Leadership left the seed by election timeout on a clean network.** 42 of 44 partitions changed leader 1–31 s after gaining joiner voters.

## 1. Timeline

| Time (own clock) | Scenario s | Event (OBSERVED) |
| --- | --- | --- |
| 12:14:16.683 | −55.3 | seed container started; first seed log line 12:14:19.805 |
| 12:14:40.565 | −31.4 | seed loop gap 5026 ms (bootstrap) |
| 12:14:45.118 | −26.9 | `setup.seed.bootstrap.ready`; both joiners started 12:14:45.4–45.5 |
| 12:15:03.561 | −8.4 | first operation: ADD `replica_operations-p1` → FAB |
| 12:15:05.173 / 12:15:09.823 | −6.8 / −2.2 | FAB / 868 `joining → active` |
| 12:15:11.973 | 0 | `cluster.ready`; formation step starts |
| 12:15:22.955 | 11.0 | ledger 3/3 (its GROWTH_PROMOTE terminal) |
| 12:15:53–12:16:22 | 41–70 | other five priority partitions promoted; poll sees 3/3 at 72.2 s |
| 12:15:53.349 | 41.4 | first non-priority ADD (`nodes-p1`), while two priority partitions were still 1/3 |
| 12:16:22 → 12:22:19 | 70 → 427 | 40 remaining system partitions, alphabetical, 3 ADDs at a time |
| 12:18:34 → 12:19:14 | 203 → 242 | `logs-p1` ADDs: 20.2 s and 17.5 s; joiner loop gaps 3.6–4.4 s |
| 12:22:11.974 | 420.0 | formation bound spent; `CREATE TABLE ffr_probe` issued |
| 12:22:19.162 | 427.2 | last system operation terminal (`wasm_operations-p1` GROWTH_PROMOTE) |
| 12:22:28.905 | 436.9 | three user-table ADDs terminal; CREATE answers 12:22:29.083 (`under_replicated`, `proceed`) |
| 12:22:30.209 | 438.2 | user table routable (first routability poll) |
| 12:22:30.2 → 12:24:32.8 | 438 → 561 | wait for a healthy public PG endpoint; 0 operations in flight in all 246 snapshots |
| 12:22:34.605 | 442.6 | ledger leadership moves SEED → FAB (term 2) |

**Why 438 s.** The table was not waiting for the cluster. The scenario issues CREATE only after `a`–`c` hold or the bound is spent, so 420.0 s is harness waiting. The remaining 18.2 s: partition row 0.8 s, admission of three ADDs 2.8 s, the ADDs 12.5–13.3 s (pipeline speed, all three in parallel), answer and one poll 1.3 s.

### Operations per 30 s (from ledger rows; created / completed / overlapping the bucket)

| Bucket s | Created | Completed | In flight in bucket |
| --- | --- | --- | --- |
| −30 | ADD pri 1 | – | ADD pri 1 |
| 0 | ADD pri 7, GP pri 1 | ADD pri 5, GP pri 1 | ADD pri 8, GP pri 1 |
| 30 | ADD pri 4, ADD sys 2, GP pri 3 | ADD pri 5, ADD sys 1, GP pri 3 | ADD pri 7, ADD sys 2, GP pri 3 |
| 60 | ADD sys 7, GP pri 2, GP sys 2 | ADD pri 2, ADD sys 5, GP 3 | ADD pri 2, ADD sys 8, GP 4 |
| 90–180 (each) | ADD sys 7, GP sys 3–4 | ADD sys 7, GP sys 3–4 | ADD sys 10, GP sys 4 |
| 210 | ADD sys 4, GP sys 2 | ADD sys 4, GP sys 2 | ADD sys 7, GP sys 2 |
| 240 | ADD sys 9, GP sys 5 | ADD sys 9, GP sys 5 | ADD sys 12, GP sys 5 |
| 270–360 (each) | ADD sys 6–8, GP sys 3–4 | ADD sys 6–8, GP sys 3–4 | ADD sys 9–11, GP sys 3–4 |
| 390 | ADD sys 3, GP sys 3 | ADD sys 5, GP sys 3 | ADD sys 6, GP sys 3 |
| 420 | ADD user 3, GP sys 1 | ADD sys 1, ADD user 3, GP sys 1 | ADD sys 1, ADD user 3, GP sys 1 |

Totals: 95 ADD (47 → FAB, 47 → 868, 1 → SEED for the user table), 46 GROWTH_PROMOTE, 0 REPLACE, 0 REMOVE. All 141 end `active / ACTIVE`, `error_message` null.

## 2. Predicate c

**Is the cluster ever quiet?** Not before 436.9 s; continuously after. Zero operations in flight for 0.6 s in total between −8.4 s and 436.9 s.

**Shape (OBSERVED).** Exactly three ADDs were in flight for 81 % of the time (one for 7 %, two for 11 %). A freed slot is refilled in 0.48 s (p50), 3.2 s (max). A partition's GROWTH_PROMOTE is created 0.32 s (p50) after its second ADD.

**Cause of the cap (OBSERVED in source).** `src/rebalancer/replica-placement-owner-constants.js:22`: `PLACEMENT_COPY_CAPACITY = {K_SRC: 3, K_TGT: 2}`, "Owner decision D2 (2026-11-18)". Every system partition starts as one replica on the seed, so the seed is the copy source for all 92 ADDs.

**Per-step cost (95 ADDs, node logs and row timestamps).**

| Segment | p50 s | p90 s | Sum s |
| --- | --- | --- | --- |
| row created → seed sends CREATE_REPLICA | 0.92 | 1.38 | 94 |
| send → target logs `Handling CREATE_REPLICA request` | 1.86 | 2.98 | 189 |
| handle → replica state `pending` | 0.50 | 0.92 | 56 |
| `pending` → `[replica-create] stage=starting` | 2.43 | 3.50 | 235 |
| starting → `creating` | 1.33 | 2.06 | 130 |
| `creating` → learner started → `syncing` | 0.81 | about 1.6 | 83 |
| `syncing` → `active` | 3.78 | 5.95 | 415 |
| **ADD total (row created → terminal)** | **12.4** | – | **1215** |
| GROWTH_PROMOTE total | about 2.0 | about 3.0 | 96 |

The network round trip is 0.25 ms, so the 1.86 s between send and handling is queueing in the two processes.

**The two named operations (every step, OBSERVED).**

`pl-wasm_operations-p1-1434-0` (ADD → 868):
- 12:22:04.855 row created `PENDING` (admission entry `placement-owner:751f5575…:admit:wasm_operations-p1`, `repair: false`).
- 12:22:05.894 SEED `Sending replica operation … CREATE_REPLICA`.
- 12:22:07.365 SEED `MESSAGE_TIMEOUT_MS (delivery ACK)`, `boundMs 500, elapsedMs 742, repeats 5`.
- 12:22:07.466 868 `Handling CREATE_REPLICA request`; 12:22:07.959 state `pending`.
- 12:22:09.123 868 `remaining SERVICE_RESPONSE grant after ACK`, `boundMs 411`, source `control-plane:write:replica_operations:replica-operation:pl-wasm_operations-p1-1434-0`, target SEED.
- 12:22:11.186 SEED `remaining SERVICE_RESPONSE grant after ACK`, `boundMs 4722, elapsedMs 5014`, `deliverySource replica_operation_dispatch`.
- 12:22:12.114 868 `stage=starting`; 12:22:12.882 `creating`.
- 12:22:12.917 SEED `Replica operation dispatch failed … skipped … retained operation row repair refused`.
- 12:22:13.278 SEED step `SENDING → CREATING`; 12:22:13.295 SEED sends CREATE_REPLICA again.
- 12:22:13.946 SEED leader admits the replica (`in_flight`); 12:22:14.889 868 handles the second request: `Replica creation already in progress`.
- 12:22:15.107 SEED `CREATING → SYNCING`; 12:22:16.708 868 `syncing → active`; row `ACTIVE` 12:22:16.811.

`pl-storage_reservations-p1-1440-0` (GROWTH_PROMOTE, target SEED): created 12:22:07.630, `SENDING` 12:22:08.128, `SYNCING` 12:22:08.664, `ACTIVE` 12:22:10.367. No refusal, no retry.

**What each was waiting for at the last poll (419.07 s).** Nothing that an owner had to end. The ADD was 6.2 s into its 12 s course (the target had not yet created the replica). The promote was complete in the ledger 0.7 s before that poll was captured; the poll's read started earlier.

**Would more time at 1 CPU have converged?** Yes, OBSERVED: backlog fell monotonically (138 → 70 at 210 s → 28 at 339 s → 6 at 407 s → 0 at 427 s) with in-flight flat at the cap. It did converge, 7.2 s after the bound, then stayed quiet.

## 3. Predicate e

The harness scales the public PG wire service to one replica through the seed, then polls `service_endpoints` on the seed for 120 s for a `healthy` row (`oltp-scenario-a-lagrange-public-pg-context.js:153-166`). No such row appeared. The readback mismatches are the same failure: the public INSERT never ran. The three per-node admin inserts and cross-node readbacks all succeeded.

Chain (OBSERVED, FAB clock):
1. 12:22:30.649–.789: `service_definitions` row `sys-postgres-wire` changes on all three nodes.
2. 12:22:30.865 FAB `Critical rebalancing state detected … replica_count_below_minimum: 0 < 1`; `Executing rebalancing move … moveTargetNodeId fab780c9`.
3. 12:22:31.445 FAB `Rebalancing move skipped … admissionReason "replica_inventory_unusable" … "authoritativeAvailable":false,"authoritativeReasonCode":null … "committedRowsState":"unavailable" … "consistency":"source_unavailable"`.
4. The same refusal 25 times, about every 5 s, until 12:24:34.997. The first attempt took 548 ms; later ones about 20 ms. Three more cycles logged `Waiting for local control-plane mutation readiness … control_plane_write_unhealthy, metadata_publication_degraded`.

- **Which node:** FAB, the planner and the chosen target. No replica was ever created, so no endpoint existed on any node.
- **Which gate:** the rebalance coordinator's topology guard (`rebalance-coordinator-topology-guard-methods.js`, the `INVENTORY_UNUSABLE` row of the decision table, about line 547). It refuses a topology increase when the authoritative SERVICES read for the entity is not usable (`rebalance-coordinator-operation-read-methods.js:496-541`).
- **Not the gate:** serve lane, ready lease (`ready_lease_expired` 0), a participant, or the user table's routability.
- **Not determinable:** why the authoritative read was unusable. The log line omits the read's `error`. A 20 ms answer suggests a local refusal, not a spent wait (INFERRED).
- **Starved or logical:** logical. 25 identical answers in 123 s; no bound was spent on FAB in that window.
- Owner: rebalance coordinator replica-inventory admission (authoritative entity-service-rows observation) for runtime services.

## 4. CPU and rule R12

### 4.1 What the nodes are busy with

**Tagged synchronous sections cover 8–17 % of one CPU** (`Sync-section periodic sample`, per 60 s): SEED 4.6–7.5 s, FAB 4.5–16.7 s, 868 5.9–14.5 s. `raft_follower_commit_apply_slice` is 4–5 s of it. The rest of the CPU is untagged; there is no profile.

**Per 30 s (OBSERVED).** `cpu` = container p50 %; `resp` = unmatched service responses (logged plus suppressed); `wbs` = spent bounds.

| s | SEED cpu / ops steps / wbs / resp | FAB cpu / wbs / resp | 868 cpu / wbs / resp |
| --- | --- | --- | --- |
| 0 | 100 / 18 / 3 / 0 | 58 / 12 / 0 | 80 / 13 / 1 |
| 60 | 99 / 26 / 12 / 811 | 89 / 8 / 720 | 94 / 8 / 1141 |
| 120 | 99 / 29 / 6 / 3001 | 65 / 20 / 3686 | 77 / 12 / 3866 |
| 180 | 98 / 32 / 3 / 4783 | 69 / 4 / 5905 | 91 / 0 / 7279 |
| 210 | 99 / 18 / 25 / 6042 | 86 / 29 / 7762 | 90 / 33 / 6733 |
| 300 | 100 / 26 / 3 / 8045 | 91 / 24 / 10799 | 97 / 33 / 9772 |
| 390 | 99 / 19 / 12 / 10084 | 91 / 21 / 13557 | 93 / 30 / 12467 |
| 450 | 90 / 0 / 2 / 12861 | 89 / 0 / 16634 | 93 / 0 / 16584 |
| 510 | 89 / 0 / 0 / 16769 | 90 / 0 / 22438 | 94 / 0 / 21000 |
| 540 | 85 / 0 / 0 / 16822 | 88 / 2 / 24030 | 94 / 1 / 21514 |

- **CPU does not fall when the work ends.** From 450 s there are no operation steps, no sends and 0–2 spent bounds per bucket, yet CPU is 85–94 % on every node.
- **Unmatched responses scale with remote replicas.** Cluster total per remote replica per second: 12.6–14.6 from 120 s to 420 s, rising to 19.4–21.9 after the operations end (95 remote replicas, 2,079 responses/s). All 57 sampled warnings are `unmatchedClassification: orphaned` with no retired-request record, so nobody was waiting for them. About 514,000 over the run.
- Raft timing is `heartbeatMs 50, tickIntervalMs 20` on every replica (`Applied runtime raft timing configuration`). 50 ms is 20 per second. INFERRED: these are per-replica raft-cadence messages answered with a response no one awaits, and the rate of 13.5 under load means the 50 ms cadence was slipping to about 74 ms.
- By configuration, 47 replicas per node at a 20 ms tick is 2,350 timer callbacks per second per node (INFERRED from the configuration line; not counted).
- Other fixed-cadence work, counts over the run (OBSERVED): `publication_recovery_gate_snapshot_build` 24,769 / 35,959 / 53,605; `stuck_transaction_heal` 22,013 / 13,416 / 13,399; readiness planning admission flips `admitted ↔ deferred` 1,894 / 3,307 / 4,249 (`freshness_not_current`, `source_change_unclassified`); `Learner promotion deferred` 559 / 664 on the joiners at 1 Hz (516 / 622 with `growth_promote_owned`, a poll that cannot succeed until the promote operation runs).
- **Observer load on the seed (harness cause, OBSERVED).** The playback capture pulls the whole control state from the seed. Snapshot size grows with completed operations from 46 kB to 1.5 MB. Rate: 0.4–0.6 per second during formation (0.5 MB/s at 400 s) and 1.8–2.3 per second in the last two minutes (2.7–3.5 MB/s). The scenario's own polls add `SELECT *` of three tables every 1.7 s. This load is on the seed only; the joiners are equally saturated without it. Its CPU share is not determinable.

**Completing work or self-sustaining?** Neither label fits.
- The formation work completes (section 2).
- The saturation is not sustained by retries: all repeats together are a few hundred messages against about 514,000 unawaited responses (4.3).
- The dominant load is steady periodic work that grows with every partition spread and continues at idle. Confidence about 85 % for "not retries, not work that ends"; about 60 % that raft-cadence traffic is the largest single part.

### 4.2 (a) Wall-clock bounds that expire because a node is busy

Counts are log lines including `repeats`, SEED / FAB / 868. One failed delivery is logged at up to four layers (router, message group, executor, SQL engine), so distinct failed requests are roughly a third of the lines. FAB and 868 name the seed as the slow peer in 184 of 218 and 228 of 261 lines.

| Wait (owner) | Bound ms | Count | What the waiter does next (from the log sequence) |
| --- | --- | --- | --- |
| `MESSAGE_TIMEOUT_MS (delivery ACK)` (message-router) | 50–1000, mostly 500 | 25 / 40 / 37 | Fails the delivery upward. Quarantine skipped 0 / 4 / 2 times (`slow, not dead`) |
| `remaining SERVICE_RESPONSE grant after ACK` (message-router) | SEED 4,600–4,970 for dispatch; joiners 1–974 | 40 / 59 / 80 | Caller treats the answer as lost. The request stays in flight on the peer |
| `MESSAGE_GROUP_RETRY_MAX_ATTEMPTS (direct delivery)` (message-group) | none; elapsed about 1,000 | 8 / 77 / 96 | `maxAttempts 1, deferRetry true`: hands the retry to its caller |
| `partition_execution_deadline` (query-executor) | 1,000–1,500 (one 5,000) | 22 / 55 / 56 | Write fails as `partition_write_outcome_unknown` (`answer_lost_after_delivery`) or `partition_write_cutover_paused`; the write's owner re-issues or drops it |
| `COORDINATOR_QUERY_TIMEOUT_MS` (parallel-query-coordinator) | 1,000 | 3 / 3 / 3 | `Parallel query execution failed` |
| `proposeTimeoutMs` (message-group) | 1,500 | 0 / 2 / 1 | Not traced |
| `REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS` (rebalance-coordinator) | 1,000 | 0 / 4 / 5 | Startup only, 12:15:00–02 (`authoritative_row_source_unavailable`) |
| `DYNAMIC_CONFIG_STARTUP_*` (dynamic-config) | 300 | 0 / 9 / 9 | Startup only |
| `cdc_routed_mutation_retry_budget` (cdc-integration) | 5,000 | 0 / 0 / 1 | Not traced |
| Raft election timeout (not a `Wait bound spent` line) | 1,000–3,000 | 45 campaigns, 44 won | Leadership changes; see 4.3 |
| Membership-publication cache read (868) | retry every 1,000, no growth | 195 deferrals, 12:16:28–12:19:34 | Repeats the same read (`failureCount 195`, `retryAfterMs 1000`) |
| Harness: formation 420,000; PG endpoint 120,000 | – | 1 / 1 | Ends the step |

What the failed writes were (OBSERVED): `INSERT logs` (the replicated system log table, led by the seed) 35 + 38 unknown outcomes and 12 + 6 + 5 cutover pauses; `UPDATE nodes` (heartbeat) 6 + 5 on the joiners. The 15 s ready lease never expired.

### 4.3 (b) Amplification

| Class | Spent | Extra work generated | Was the original still in flight? |
| --- | --- | --- | --- |
| CREATE_REPLICA dispatch | 35 response grants on SEED | 95 ADDs → 181 logged sends, 298 handler entries, 203 `Replica creation already in progress`: 3.1 deliveries per ADD | Yes. Section 2: sent 12:22:05.894, grant spent 12:22:11.186, original proceeding (`creating` 12:22:12.882), re-sent 12:22:13.295, answered "already in progress" 12:22:14.889. Idempotent, so no double effect; the cost is a handler pass and two messages on saturated nodes |
| Dispatch re-drive | – | `Retrying pending replica operations for ready node` 316 times on SEED (0.72 per second), independent of loop delay; accounts for the 117 handler entries with no logged send (INFERRED) | Yes |
| Skipped repair after a dispatch timeout | – | `retained operation row repair refused` 32 times on SEED | Yes |
| Writes with a 1–1.5 s deadline | 22 / 55 / 56 | Most: one delivery, answer not back in time, 42–44 distinct idempotency keys per joiner, 4–5 keys re-issued. Worst case: SEED key `cpw-ce06dd2e…` failed 7 times from 12:18:44.262 to 12:18:52.667 with 12–18 attempts inside each budget, about 100 deliveries for one `logs` row during the `logs-p1` cutover pause | Delivered and unanswered (`answer_lost_after_delivery`) in all 93 joiner cases, 77 of them after a single delivery: the seed may have applied a write the caller reported as failed |
| Election timeout | 45 campaigns | 44 leadership changes, each followed by leader activation and role and leader-row publication to three nodes. The joiners logged about 120 leader-lost observations in all; the rest recovered without a campaign | The old leader was alive every time |
| Membership-publication read | 195 | 195 repeats of one read at a fixed 1 s | Not determinable |
| `sys-postgres-wire` admission | 25 | 25 identical attempts at 5 s | n/a |

Layering also amplifies the log, not the traffic: one lost answer at 12:22:11.529–.532 on 868 produced four lines.

### 4.4 (c) Work admitted with no regard to saturation

- **Placement owner.** Keeps three copies in flight from −8.4 s to 425 s and refills in 0.48 s regardless of seed CPU (98–100 %), loop gaps, or missed bounds. Non-priority work starts at 41.4 s while `sql_transactions-p1` and `sql_write_operations-p1` are still 1/3. The three user-table ADDs are admitted at 12:22:15.587 on top of the last system ADD.
- **Per-group raft timers.** Every new replica adds a 20 ms tick and a 50 ms heartbeat stream; nothing bounds the total per node.
- **Unawaited responses.** About 2,000 per second at idle.
- **Fixed-cadence loops** that ran unchanged: dispatch re-drive, learner promotion poll (1 s), readiness planning rebuilds, `stuck_transaction_heal`, runtime-service rebalancer (5 s), CDC catch-up hydration (124 / 176 / 143 passes).
- **Log shipping.** Each node inserts its log rows into `logs-p1` on the seed under a 1 s deadline while the seed is saturated.
- **Observer.** Snapshot pulls grow with history and quadruple in rate in the last phase.

### 4.5 (d) What observes its own delay and slows down

| Owner | Engaged? |
| --- | --- |
| Copy capacity `K_SRC 3 / K_TGT 2` (placement owner) | Always at the cap. Static: it does not read delay. `SOURCE_AT_CAPACITY` / `TARGET_AT_CAPACITY` refusals 0 (the owner pre-filters) |
| `CONTROL_PLANE_PRESSURE_DEGRADED` (priority dispatch claim) | Twice, 12:15:21.785 and 12:15:22.193, 250 ms each, on the ledger promote |
| `query_admission_deferred` (query admission) | 4 / 14 / 24, retry after 0–1,492 ms |
| `Deferred replica operation dispatch while control-plane path recovers` | 54 on SEED, 250 ms in the lines sampled |
| ACK-timeout quarantine skip (`slow, not dead`) | 6 times; it prevented quarantine. No quarantine occurred |
| Log and read suppression (`suppressedSinceLastEmit`, `suppressedReads`) | Yes; bounds log volume only |
| Event-loop gap watchdog | Observes gaps ≥ 1 s; acts on nothing |
| Raft cadence | Slowed to about 13.5 per replica-second under load by timer slip, not by design (INFERRED) |

Nothing that admits new work reads loop delay, CPU or the rate of spent bounds.

### 4.6 (e) Starved or logically blocked

- The two named operations: neither. They were in progress and completed (section 2).
- The formation as a whole: slowed, not blocked. It would converge, and did.
- `e`: logically blocked (section 3).
- R12 reading (OBSERVED outcomes): throughput degraded and wall-clock bounds broke (44 elections, 111 write deadlines on the joiners, the 420 s acceptance). No failed operation, no expired lease, no projection disagreement, no lost acknowledged row is visible in this evidence. Writes reported as "outcome unknown" after delivery are the nearest thing to an obligation left unresolved.

## 5. Event-loop gaps ≥ 1 s

| Node | Time | Gap ms | Tagged ms, top site | Context |
| --- | --- | --- | --- | --- |
| SEED | 12:14:29.067 | 1368 | 0 | startup |
| SEED | 12:14:40.565 | 5026 | 1023 `raft_follower_commit_apply_slice` | bootstrap |
| SEED | 12:15:36.716, 12:16:03.809, 12:16:09.294, 12:16:29.565, 12:16:44.928 | 1047–1401 | 221–391 same site | priority spread, then `services`, `partitions`, `tables` |
| SEED | 12:18:55.098 | 1194 | 243 | `logs-p1` window |
| SEED | 12:20:03.765, 12:20:41.501, 12:22:09.781 | 1052–1192 | 49–107 | unexplained 999–1099 ms |
| FAB | 12:14:57.972 | 1325 | 0 | startup |
| FAB | 12:16:38.540 | 1392 | 1224 same site | `services-p1` ADD → FAB (12:16:28–40) |
| FAB | 12:19:06.798, 12:19:08.665, 12:19:11.501 | 3621, 1616, 2587 | 3298; then `storage_reservation_reconcile` open 1852 and 4688 ms | `logs-p1` ADD → FAB (12:18:56–12:19:13) |
| 868 | 12:14:59.334 | 1277 | 0 | startup |
| 868 | 12:16:26.595 | 1204 | 749 same site | `services-p1` ADD → 868 (12:16:15–28) |
| 868 | 12:18:45.786, 12:18:50.464 | 3768, 4427 | 3373, 3457 same site (max slice 557 ms) | `logs-p1` ADD → 868 (12:18:34–54) |

- The watchdog names `raft_follower_commit_apply_slice` for the joiner gaps (88–91 % of the gap). On the seed the gaps are 62–95 % unexplained.
- **Missed bounds inside or right after the `logs-p1` gaps (12:18:42–12:19:12):** spent bounds 25 / 29 / 33 in that bucket (the run's peak); failed distributed writes 12 / 10 / 9; `a` unmet at 218.1–221.0 s (`serve_ineligible`); `b` `partitions_observation_incomplete` at 212–218 s; ADD completions 4 in the bucket instead of 7.
- Cross pattern (OBSERVED): while 868 was blocked, FAB lost contact with the ledger leader (12:18:44.302, 12:18:48.811, 12:18:54.072); while FAB was blocked, 868 did (12:19:06.743, 12:19:09.467). Why a blocked follower makes the other follower miss the seed's heartbeats is not determinable without sub-second loop data.

## 6. First causal divergence

There is no event of the lab kind (a refusal or a stall). The run fell short on pace.

Projected finish of the last ADD at the measured steady rate (0.236 ADD/s, 60–200 s), against the roughly 411 s needed to leave room for the last promote and the quiet window:

| At s | 0 | 60 | 200 | 225 | 243 | 300 | 390 | actual |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Projected s | 390 | 404 | 404 | 403 | **413** | 415 | 416 | 424.8 |

- **0–60 s: about 13 s lost.** The ledger partition ran alone and one operation at a time from −8.4 s to 11.5 s (42.6 idle slot-seconds of 101.5 in the whole run).
- **203–243 s: the margin is gone.** The `logs-p1` catch-up (12:18:34.685–12:19:13.940) is the earliest event after which the run could not finish in time at its own pace. Owner: the follower apply path (`raft_follower_commit_apply_slice`), which applied the catch-up in slices of up to 607 ms and blocked each joiner for 3.4–4.4 s at a time.
- **360–425 s: 10 s more.** The last ADDs took 15–16 s.
- **Structural condition:** with `K_SRC 3` and 12.7 s of slot time per ADD the best case is 390 s of 420 s. Owners: the placement owner's copy capacity, and whatever sets the ADD's cost at 1 CPU (4.1; not established without a profile).

**Difference from the lab run.** The lab's first divergence was a discrete transport failure: delivery-ACK deadlines missed between unsaturated processes, then leadership churn to term 19–22, a connection duel, and two priority ADDs deferred 101 times until a 300 s budget expired. Here the same early ACK misses occur (FAB 12:15:02.504, 32.7 s after seed start; lab 36.6 s) but nothing escalates: no quarantine, no churn (at most two elections per partition), no stalled operation, no failed read.

## 7. Earlier findings checked

| Finding | Status | Evidence |
| --- | --- | --- |
| Seed CPU-bound at cpus 1.0 in cold formation | **Present** | SEED p50 96–100 % from 0 to 420 s. The profile shares (CDC currentness, `db.prepare`, compacted-storage sync) are not determinable: no profile; `cdc_update_row_fetch` tagged 0.35 s in the whole run |
| Per-group raft tick timers | **Present (INFERRED)** | `tickIntervalMs 20`, `heartbeatMs 50` on 47 replicas per node; unawaited responses at 20 per remote replica per second; CPU 85–94 % with no operations |
| Priority serialisation behind the ledger (`priority_operation_serial_wait`) | Signal absent (0); **behaviour present** | Only ledger operations ran until 11.5 s, one at a time; the other priority partitions then ran three at a time |
| ADD admission continuation gap (ADMITTED latch) | **Absent** | All 95 ADDs reached `create_admission_state ACTIVE`; longest `SENDING → CREATING` 9.99 s; `ADMITTED` appears in no log line |
| Placement owner: no resync, discarded `LEADER_UNKNOWN` | **No deficit left unreconsidered** | 46 of 46 partitions served; refill max 3.2 s; `LEADER_UNKNOWN` 0. The owner does not log waits, so a short discarded wait would be invisible. The `sys-postgres-wire` deficit was reconsidered every 5 s by a different owner and refused each time |
| Retained placement repair activity | Present as noise | `retained operation row repair refused` 32 times on SEED, each a skipped dispatch; every admission has `repair: false` |
| Growth-promote administration routing | **Absent as a blocker** | 46 promotes, 1.1–3.6 s, all to the seed as leader; five took one extra `SYNCING → SENDING` hop; 15 `Invalid replica operation persistence outcome` reconcile failures on SEED, each followed by completion |

Also present: readiness planning oscillation (4.1), and leadership leaving the seed (42 of 44 partitions within 1–31 s of their promote, median 8 s; the ledger held 432 s and `services-p1` 362 s; `nodes-p1` and `logs-p1` never moved).

## 8. What this run says about the lab network

**Explained by the network (pass here):** `a` (lapsed ready lease), `b` (spread by 72 s here), `d` (`ready_lease_expired` refusal of CREATE), `g` (cache lag during a link outage), observation integrity (37 control reads over 15 s; 0 here), leadership churn, the connection duel, `Named control-plane write wait expired` (31; 0 here), and the 300 s stall on `placement_bootstrap_authority_wait` (0 here).

**Product behaviour in both runs:**
- Delivery-ACK deadlines missed 33–37 s after seed start. On GCP the network cannot be the cause.
- Leadership leaves the seed by election timeout once joiners vote.
- The same pipeline: same order, three copies at a time. Lab ADDs to the second joiner took 12.5–14.7 s; before its stall the lab completed 17 ADDs in 78 s (0.22/s, against 0.236/s here). At that rate the lab could not have met `c` in 420 s without the stall either (INFERRED).
- `c` fails in both, for different reasons: the lab had 25 of 138 operations done and two stalled; GCP had no stalled operation.
- Orphaned responses at tens to hundreds per second on every node.

**Not shared:** the lab's stuck class (priority ADDs to the second joiner held in `SENDING`) does not occur here. Lab CPU was 17–64 % because 41 of 46 partitions never left the seed; it says nothing about CPU once all are spread.

**Not comparable:** `e` was not evaluated on the lab.

## 9. Next observation

**Leading hypothesis.** At 1.0 CPU the steady per-replicated-group cost (raft ticks, heartbeats and their unawaited responses, plus fixed-cadence planners and polls) takes most of the CPU and grows with every partition spread, so each ADD costs 12 s. On the lab, ADDs to the first joiner mostly took 1.5–7 s with the seed at 17–40 % CPU; that seed is also about twice as fast per call (0.069 ms against 0.145 ms), so the comparison is indicative only.

**Observation.** The same run with the existing seed CPU profile: `LAGRANGE_FORMATION_ATTRIBUTION=1`, `LAGRANGE_FORMATION_ATTRIBUTION_DEADLINE_MS=640000`, `LAGRANGE_FORMATION_PROFILE_DIR=<dir>` (`src/diagnostics/formation-attribution-window.js`). All three keys are in `FORWARDED_SEED_HOST_ENV_KEYS`, so no source or harness change is needed for the seed. Read two windows: 72–300 s and the idle tail after the last operation.

| Result in the idle tail | Meaning |
| --- | --- |
| Most samples in raft tick, heartbeat send/receive and transport response handling | Confirms |
| Most samples in admin snapshot and query serialisation | Refutes for the seed: observer load; repeat with playback capture reduced |
| Most samples in readiness planning or CDC | Refutes: a different periodic owner |
| 72–300 s dominated by operation steps (replica create, copy, row writes) with little periodic work | Refutes: the ADD itself is expensive |

Limits: the keys are seed-only, so a joiner profile needs a harness change; the attribution adds its own overhead to a saturated seed; the profile is written inside the container, which teardown removes, so it must be copied out first. `LAGRANGE_LOOP_GAP_PROFILE` is forwarded to all nodes but `LAGRANGE_LOOP_GAP_THRESHOLD_MS` is not.

Secondary, needs a source change: include the authoritative read's `error` in the `Rebalancing move skipped` line, to settle `e`.

## 10. Not established

- The CPU split by subsystem (no profile).
- That the unawaited responses are raft heartbeat answers (the warning carries only a message id).
- Why the authoritative SERVICES read for `sys-postgres-wire` was unusable.
- Whether `e` fails on every run of this commit or depends on timing (the ledger changed leader 4 s after the first refusal).
- The cause of 0.26–0.89 % TCP retransmits on a loss-free path.
- Any rate: this is one run.
