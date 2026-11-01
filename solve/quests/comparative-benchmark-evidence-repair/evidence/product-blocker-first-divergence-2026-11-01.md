# Product blocker: first causal divergence (live 3-node diagnosis, 2026-11-01)

Quest `comparative-benchmark-evidence-repair`, read-only product-side investigation. No repository
file other than this one was created or changed; no cluster was run; nothing is committed.

## 0. Identity and inputs

- Cluster: Docker Hub `psvensson/lagrange:0.4.0` by digest (`sha256:c0fcc0d3…`, image id `18aeffc9…`,
  label `org.opencontainers.image.revision=07206ba1c8bb396f4eb097a753915bb34580d824`); three hosts
  192.168.86.32 (seed, node 1, 12 cores), .34 (node 2, 8 cores), .41 (node 3, 4 cores); flags
  `--network host`, `NODE_ADDRESS=<ip>:8080`, `SEED_NODE_ADDRESS=192.168.86.32:8080`,
  `ADMIN_WS_PORT=8081`, `TRANSPORT_WS_PORT=8082`, `LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS=30000`,
  `DATA_DIR=/tmp/lagdata-…` inside the container (`out/3node-hub/deploy-commands.log:4,25,26`).
- Source identity verified in this worktree (HEAD `69a26626d`): `07206ba1c8` is an ancestor of HEAD and
  `git diff --stat 07206ba1c8 HEAD -- src` and `git diff --stat 62d537313 HEAD -- src` are both empty,
  so every `src/` citation below is the code the image ran. Per-file `git log -1` hashes are given
  once per file in §6.
- Logs (all under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c6ec814b-3c4a-4df4-b6a1-319dfe73b9bc/scratchpad/live-diagnosis/out/3node-hub/`):
  `S` = `node-logs-192.168.86.32.txt` (seed, 20 566 lines, 19:50:34-19:57:37Z), `N2` = `…86.34.txt`,
  `N3` = `…86.41.txt`, `SL` = `logs-late/node-logs-192.168.86.32.txt` (19:57:02-20:13:39Z, 21 022
  lines). `file:N` is the line number; times are the node's own `time` field (UTC).
- Client envelopes: `tables-for-evidence.md` (sections 2a, 2b, 2c, 3, 3x, 4c), `step5-adapter-smoke.json`.

## 1. Causal chain, container start to first write failure

| # | Time (Z) | Observation | Log | Owner (source) |
| --- | --- | --- | --- | --- |
| 1 | 19:50:32.8 | seed container running | `container-inspect-192.168.86.32.txt` | - |
| 2 | 19:50:36.368 | `Distributed Database System starting` version 0.4.0, `fresh_seed` | `S:5-7` | `src/lagrange-runtime-startup.js` |
| 3 | 19:50:38.500 | one event-loop gap 2111 ms, before any partition exists; `cumulative.gapCount 1`; no later gap on the seed, one 19:51:12 gap on node 2 (`N2:6`), none on node 3 | `S:10` | - |
| 4 | 19:50:38.664-19:51:00.426 | 46 system partitions x 3 replicas = 138 replicas + mg-1 x 3 created on the seed alone; every priority partition elected term 1 with cohort r1,r2,r3 all on node 1 (e.g. `replica_operations-p1` 19:50:43.560) | `S:57`, `S:1044`, `S:2571` | bootstrap partitions phase |
| 5 | 19:50:49.889 | first `No row found for CDC update` (table `services`, key `artifact_payload_chunks-p1-r1`), delivered by `services-p1-r1` and again by `services-p1-r3`: three local replicas feed one cache | `S:1374`, `S:1376` | `src/partition/partition-cdc-*` |
| 6 | 19:50:57.023 | first `CDC obligation delivery held by a subscriber; retry scheduled` (`partitions-p1` logIndex 49, error `Latency topology services are not initialized`); the next 4 838 holds carry `cdc_committed_acceptance_unknown` (887 in 19:51:00-30, still 25-105/min at 20:13) across services-p1 (1 307), partitions-p1 (1 355), nodes-p1 (619), control_plane_publications-p1 (567), replica_operations-p1 (175) | `S:1817`; counts from `S`, `SL` | `src/partition/partition-cdc-obligation-delivery.js:574-586` (hold keeps order: `:500-502`), `src/cdc/cdc-delivery-outcome.js:37-42` |
| 7 | 19:50:57.768 | seed readiness `warming -> join_ready`, `ready:true` | `S:2068` | `src/bootstrap/...readiness` |
| 8 | **19:50:58.093** | **`CACHE_WAIT_TIMEOUT_MS` spent: "routed system-table write visible in the local cache" bound 750 ms, elapsed 811 ms, table `services`, key `mg-1-r1`, `fallbackPhase steady_state`** | **`S:2329`** | `src/cdc/cdc-integration-service-cache-visibility-wait.js:52-53` |
| 9 | 19:51:00.752 | rebalancer `topology_settling_blocked`, `node_ready_lease_incomplete`, unready [node 1] (0.3 s after bootstrap) | `S:2590-2591` | `src/rebalancer/unified-rebalancer-shared.js:202-207` |
| 10 | 19:51:03.4 / 19:51:04.0 | joiners started; join canonical readiness converged 19:51:12.955 (node 3) / 19:51:15.948 (node 2) | `deploy.log`; `N3:163`, `N2:174` | node-joining |
| 11 | 19:51:14.076-.150 | seed: `Critical rebalancing state detected` `control_plane_replicas_not_spread: 1/2` for `replica_operations-p1`; REPLACE `replace-op-b0b98821…` created, target node 3 | `S:3513`, `S:3520` | `src/rebalancer/move-planner*.js` |
| 12 | 19:51:16.712 / 19:51:17.294 | joiners pass the `ledger_spread_satisfied` formation barrier: `startupAuthorityReady true`, publication epoch 7 acked by all three nodes | `N3:243`, `N2:206` | node-joining formation barrier |
| 13 | 19:51:17.46-19:51:19.37 | node 3 creates the learner `replace-replica-804a4438…`, `Starting as learner` | `N3:304,323,353,355` | replica handler |
| 14 | **19:51:19.988** | **seed leader refuses the learner's promotion proof: `request_invalid` / `learner_address_unresolvable`, "Unable to resolve unified peer address for replace-replica-804a…"; repeated 14x at ~1 s cadence until 19:51:33.337; node 3 logs `Learner promotion deferred` (membershipEpoch 5) and re-asserts its durable services row 14x** | **`S:4101`…`S:5102`; `N3:391-392`** | `src/partition/partition-service-learner-promotion-proof-methods.js:69-95`, `src/partition/partition-service-core-base.js:546-608, 666-690`, `src/raft/peer-address-resolver.js:143-160` |
| 15 | 19:51:21.955 | same refusal for node 2's learner `control_plane_publications-p1-r4` (6x, granted 19:51:28.251); later for `replica_operations-p1-r4` (25x), `sql_transaction_participants-p1-r5` (17x), `sql_transactions-p1-r5` (15x), `replace-replica-007f89…` on `schema_operations-p1` (14x): every spread step pays 6-25 s | `N2:315`, `N2:419`; cause histogram over `N2` | same |
| 16 | 19:51:21.427 / 19:51:23.952 | joiners `join_ready`, `ready:true`; `/health` `"ready":true` on all three by 19:51:19-21 (deployer predicate satisfied) | `N3:449`, `N2:354`; `deploy.log` | `src/bootstrap/bootstrap-api-server-methods.js:154-171` (`ready` = SQL engine object exists) |
| 17 | 19:51:29.090 | node 2 re-asserts a services row: INSERT to `services-p1-r1` (seed) fails `UNIQUE constraint failed: services.service_id` - the durable row exists while the seed leader's cache cannot resolve it | `N2:454` | - |
| 18 | 19:51:29.521 | first `Terminal transition persist not committed; retry ownership kept and repair armed` (op 75a3f2ce ADD `control_plane_publications-p1` step ACTIVE); 91x on the seed | `S:4870` | `src/rebalancer/rebalancer-constants.js` |
| 19 | 19:51:34.374-19:51:35.843 | proof granted (epoch 7, safePromotionIndex 46), learner active, peers 3/3; at 19:51:34.620 the seed cache still has no row for the learner (`No row found for CDC update` x3) | `N3:764,777,793`; `S:5173-5179` | - |
| 20 | 19:51:41.6-19:51:42.07 | leadership of `replica_operations-p1` transferred to the new replica on node 3 (term 2); seed `Lost leadership, stopping rebalancing scheduler` | `N3:884,896`; `S:5622-5630` | REPLACE handoff |
| 21 | 19:51:43.224 | seed denies its own routing to `replica_operations-p1` (controlPlaneRecoveryEligible): `planning_snapshot_refresh_pending`, projection revision local unavailable vs required 7 | `S:5677` | `src/control-plane/control-plane-readiness-constants.js:72` |
| 22 | 19:51:50.660-19:51:51.556 | seed removes `replica_operations-p1-r2` (REPLACE source removal) | `S:6081,6119,6131` | replica handler |
| 23 | 19:52:03.760 | rebalancer: "Waiting for local control-plane serve readiness", `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, delay 75 000 ms | `S:6707` | `src/rebalancer/unified-rebalancer-local-serve-readiness.js` |
| 24 | 19:52:15.437 | first `serveEligible` denial (tables-p1): serve lane blocked `publication_stream_not_ready`, `priority_recovery_active`; `priorityPartitionSummary`: requiredDistinctNodeCount 3, readyDistinctNodeCount 2/2/1/1/1/1 for the six priority partitions (publications has one `status_failed`) | `S:7301` | `src/control-plane/projection-readiness-constants.js:39-43`, `control-plane-readiness-constants.js:68-76` |
| 25 | 19:52:15.404 | client `SELECT 1` -> `Partition service not found` (318 ms) | `tables-for-evidence.md` 2b#1 | `src/query/query-constants.js:135` |
| 26 | 19:52:16.010 | `Creating table bench_accounts` replicaCount 3 | `S:7320` | table-creation-service |
| 27 | 19:52:27.764 | `table_partition_target_node_wait` spent (bound 10 000 ms, 74 polls, `resolvedNodeCount 0`, `activeNodeRowCount 3`); node 1's own trust state: `serveEligible false`, reasons `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, `planning_snapshot_refresh_pending`, `transport_unknown`, `process_not_alive`, `readiness_not_repair_eligible`; then "Unable to satisfy minimum routable provisioning cohort … required=2, provisionable=0, target=3" with `candidateTargetNodeIds []` | `S:8014-8016` | `src/query/sql-query-engine-shared.js:165-170`, `src/query/sql-query-engine-provisioning-admission-methods.js:288-325`, `src/control-plane/node-trust-state.js:316-345` |
| 28 | 19:52:35.667 | `Using degraded provisioning target-node fallback` -> node 1 + node 3; ADD operations created | `S:8489` | provisioning admission `:262-282` |
| 29 | 19:52:48.360 | mg-1 direct delivery to the removed `…/partition/replica_operations-p1-r2`: `No handler registered` (71x until 19:54:03) - the message group's target list is stale 57 s after the removal | `S:9395,9397` | `src/message-group/message-group-service-peer-resolution.js:135-156` |
| 30 | 19:52:49.963 | first control-plane write to `replica_operations-p1` fails: participant node 3 `replace-replica-804a…`, `ROUTER_MESSAGE_TIMEOUT`, `partition_write_outcome_unknown`, 5 attempts inside the 2 500 ms `partition_execution_deadline`; node 3's new leader was in `release_drain_pending` 19:52:48.099-19:52:50.123 and node 3 saw ack-timeout streaks towards the seed at 19:52:58 | `S:9479,9483`; `N3:2557,2617,2897-2899` | `src/query/query-executor-partition-attempt-budget.js:21-28` |
| 31 | 19:52:50.416-19:52:53.285 | bench partition replicas become active Raft services on node 1 (leader) and node 3 | `S:9525,9779`; `N3:2734` | - |
| 32 | 19:53:00.247-19:53:07.848 | node 3 (ledger leader) creates REMOVE 94dd2abd of `replica_operations-p1-r1`; the seed handles `REMOVE_REPLICA` 8x; node 3: `Operation failed: Unknown error` | `N3:2928,3240`; `S:10416…11077` | rebalance coordinator |
| 33 | 19:53:06.356-19:53:06.947 | `control_plane_publications-p1-r2` removed on the seed; from then on `Participant release recovery` for `control_plane_publications-p1` answers `release_fact_unavailable` / `hosted_replica` (42x, last 20:13:39) and writes to it are refused `partition_write_cutover_paused` ("paused mutation admission for its participant transaction cutover") from 19:53:38 on | `S:10793,10858,13038`; `SL` | `src/node/replica-handler-participant-release.js:383-387`, `src/partition/partition-write-kernel.js:60`, `src/constants/errors.js:47` |
| 34 | 19:53:21.555 | bench partition routing: `serviceRowCount 2`, `routableServiceCount 0`, `all_services_filtered_by_readiness` on `serveEligible`, denied by node 1 with `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` (serve lane blocked `publication_stream_not_ready`, `priority_recovery_active`; boundary `priority_partitions_not_spread`) | `S:11933` | `src/query/query-executor-partition-routing-snapshot.js`, `src/query/query-constants.js:359`, `src/query/query-executor-priority-recovery-bootstrap-routing.js:14-33` (bypass only for priority control-plane partitions) |
| 35 | 19:53:21.422 +29.9 s | **first write failure**: `INSERT INTO bench_accounts` -> `DISTRIBUTED_PARTICIPANT_FAILURE`, participant `tbl-2a17…-p1`, "Partition service not found" | `tables-for-evidence.md` 2b#7 | `src/query/query-constants.js:90,135,202` |
| 36 | 19:57:34-19:57:35 | `control_plane_publications-p1` routing: `leaderKnown false`, node 1 fails all 12 dimensions with `planning_snapshot_refresh_pending`; rebalancer `node_ready_lease_incomplete` for all three nodes, delay 120 000 ms | `S:20491`, `S:20535` | - |
| 37 | 20:13:38 | priority spread still unsatisfied after 22 min: publications 2/3 (`status_removing`, `status_failed`), schema_operations 2/3 (`status_removing`), sql_transaction_participants 2/3, sql_transactions 2/3, sql_write_operations 1/3 (`status_syncing`); the serve lane was never `ready` in `SL` (0 occurrences) | `SL` last `blockedPartitions` | - |

## 2. First causal divergence

**19:50:58.093Z, seed, `S:2329`: the owner-stated bound for authoritative-write -> local system-table-cache
visibility (750 ms, `CACHE_WAIT_TIMEOUT_MS`) is exceeded for a routed `services` write (`mg-1-r1`) in
`steady_state`, 0.3 s after the seed declared `join_ready` and before any joiner existed.** The same
projection lag is then what the leader hits when it cannot resolve a learner's address from its services
cache (`resolvePeerAddressFromCache`, `partition-service-core-base.js:666-690`) for 14 s on
`replica_operations-p1` (#14) and 6-25 s on every later learner (#15), although the row is durably committed
(#17), and what the provisioning admission hits (`cache_visibility_timeout`, `resolvedNodeCount 0`, #27).

Healthy before it: bootstrap of 141 services / 46 partitions in 22 s (#4); every priority partition elected
term 1 within 10 s; readiness reached `join_ready` on schedule (#7); the only event-loop gap predates
partition creation (#3). The CDC hold at 19:50:57.023 (#6) precedes #8 by 1 s but is a retry warning, not a
contract departure by itself; it is the mechanism hypothesis for #8 (below).

Why the later, louder lines are not first: `learner_address_unresolvable` (#14) is a consequence of the cache
not holding a durable row; `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` / `priority_partitions_not_spread`
(#23-24) are the correct serve-lane consequence of a spread that has not finished; `provisionable=0` (#27) is
the correct provisioning consequence of no node being serve-eligible; `Partition service not found` (#35) is
the router filtering two active services by `serveEligible`. `node_ready_lease_incomplete` (#9, #36) with all
three nodes unready at 19:57:35 while `nodes` rows carried current leases at 19:51:47 (`step2a` #1:
`ready_lease_expires_at` = heartbeat + 15 s on all three) is itself a stale-projection reading.

Hypothesis H1 (mechanism of #8, labelled): the seed's CDC obligation lane for `services-p1` (and
`partitions-p1`, `nodes-p1`) is repeatedly held with `cdc_committed_acceptance_unknown` (a subscriber answers
without a committed receipt; `partition-cdc-obligation-delivery.js:491-498, 503-533`), and the hold keeps
order (`:500-502`), so delivery to the local cache runs seconds behind the authoritative table; three local
replicas of one partition feeding one cache (#5) and 497 `Out-of-order CDC event detected` are consistent
with that. Single observation that settles H1: at a refusal instant, read the learner's `services` row with
the authoritative read witness (`SELECT * FROM services WHERE service_id='<learner>'`, `readAuthorityWitnesses`
in the envelope) and the same key from the seed's `cache_dump`; row present authoritatively and absent (or
not `service_type='partition'`) in the cache confirms H1; both present refutes it and points at
`peerAddresses` cohort timing instead.

Alternatives ruled out (one-line evidence each):
- Event-loop starvation: `gapCount 1` on the seed (`S:10`, 19:50:38, before partitions), one 19:51:12 gap on
  node 2 (`N2:6`), none on node 3; no gap during 19:51-20:13.
- Docker-layer storage: all commits, elections, snapshots and storage reservations succeed (`S:3540`,
  `N3:793`); no I/O error in 56 MB of logs; the lag is cache-side, not disk-side.
- Address/port configuration (`NODE_ADDRESS=<ip>:8080` vs `TRANSPORT_WS_PORT=8082`, `--network host`):
  peers derive admin = REST+1 and transport = REST+2 from `NODE_ADDRESS`
  (`src/config/listener-port-model.js:6-9, 77-83, 121-150`), which matches 8080/8081/8082; unified peer
  addresses are logical `nodeId/partition/replicaId` (`peer-address-resolver.js:143-160`), so
  `learner_address_unresolvable` is a cache lookup failure, not an IP/port failure; joins, snapshot catch-up,
  the proof grant and leadership transfer to node 3 all traversed the transport (#12, #19, #20).
- Node 3's learner specifically: the identical refusal hit node 2's learners (#15), and node 3's learner was
  promoted and became leader (#19-20).
- CDC subscriber hold: not ruled out; it is H1.
- Ready-lease flap: leases were current at 19:51:47 (`step2a` #1); `node_ready_lease_incomplete` recurs
  only in the rebalancer's projection (#9, #36) - a symptom of the same lag, not a cause.
- Image build: the Hub image's `src/` is byte-identical to HEAD and origin/main (§0); the lab-tagged image
  that failed to start (draft §1.2) was not used.
- Client timer / `LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS`: only shape the 29.8 s answer time (#35); the
  partition was unroutable for 22 min regardless.

## 3. Classification

Product defect, not setup. Confidence high (0.9) that the blocker is product-side: a `/health`-ready
three-node LAN cluster never opened its serve lane in 22 minutes, user-table partitions were active Raft
services yet filtered for the whole window (#31 vs #34-37), and the cutover-paused publication partition (#33)
had no release path, which contradicts `architecture/contracts/authority-and-recovery.md:119-128` ("Recovery
must not depend on the condition it restores") and `:138-145` ("Permanent refusal is explicit and cannot
disguise an endlessly retrying operation"). Confidence medium (0.6) on the first-link mechanism (H1); the
settling observation is given in §2. Owners: (a) system-table-cache CDC delivery / cache visibility
(`src/partition/partition-cdc-obligation-delivery.js`, `src/cdc/cdc-integration-service*.js`); (b) the
priority-spread / formation release path that gates the serve lane (`src/control-plane/projection-readiness*`,
`src/rebalancer/*priority*`); (c) TX1 participant cutover pause on `control_plane_publications-p1`
(`src/node/replica-handler-participant-release.js`, `src/partition/partition-participant-transaction-pause.js`).
Deployment contributed only load asymmetry (seed 139 % CPU, node 3 four cores and ack-timeout streaks, #30),
which plausibly lengthens the 2.5 s participant deadline misses on the operation ledger but does not create
the gating. Hypothesis H2 (labelled): the ledger (`replica_operations-p1`) being intermittently unwritable
(#30, #32) and the publication partition being paused (#33) are the two feedback loops that turn a slow spread
into a non-converging one.

## 4. Quest ownership

No open quest owns this cause. Closest open quests (statements quoted in full in their `quest.json`):
- `application-write-formation-authority` (fix, topology-convergence-hardening): "Once the authoritative
  application-write formation owner declares the required cohort ready, the first application mutation
  admitted under that same authoritative generation is not rejected because of an older or contradictory
  replica-operation or placement condition…" - owns the admission ordering of the first mutation, not a
  spread that never completes; its lab history (schema operation held 60 s, T-A on tv-dator) is the same
  family of symptom.
- `replica-projection-stale-leader-route-resync` (topology-convergence-hardening): projection writes wedged
  behind stale canonical leader metadata - related (stale projection) but about projection writes failing,
  not the cache lagging a durable row.
- `ordinary-placement-ready-lease-candidate-admission`: lease-expired nodes excluded from candidates - the
  `node_ready_lease_incomplete` symptom, not the cause.
- `retained-seed-original-handoff`, `message-group-fresh-identity-membership` (raft-rs-full-cutover): seed
  startup handoff and mg-1 fresh-identity membership. The latter is relevant context: on 0.4.0 the joiners
  log "Message-group replica planning parked: membership change unsupported until the fresh-identity ADD
  path exists" (`N2`, `N3`), so mg-1 stays entirely on the seed and its stale target list produced #29.
- Historical sealed quests on exactly this surface exist and are closed/migrated (e.g.
  `formation-priority-spread-*`, `formation-ledger-spread-voter-ready-readiness-closure`,
  `movielens-pre-schema-priority-spread-admission-authority`, `priority-recovery-add-dispatch-cadence`,
  last entries 2026-09-06); none is open and none measured the v0.4.0 (raft-rs cutover) code.

Proposed new bounded child quest (owning epic `topology-convergence-hardening`; `raft-rs-full-cutover` if
the owner rules the cutover changed the spread path):
- Statement: "On a fresh three-node formation whose nodes all report `/health ready:true` and current ready
  leases, the six priority control-plane partitions reach `readyDistinctNodeCount = 3` and the seed's serve
  lane opens within a stated bound; a `CREATE TABLE … replicaCount 3` issued after that bound has at least two
  `serveEligible`-routable services and a probe INSERT + readback succeeds; no learner promotion proof is
  refused `learner_address_unresolvable` for a replica whose services row is durably committed."
- Reproducer: deploy three nodes (lab hosts or local docker), wait only for `/health ready:true`, record
  `control_snapshot_local` every 1 s, issue `CREATE TABLE`, then a write every 5 s for 10 min; capture
  per-node logs; assert the first-divergence witnesses (#8, #14, #24, #27, #34) and the time to serve-lane
  open.
- `doneWhen` probe idea: `scenario-harness` with a new scenario (e.g. `fresh-formation-user-table-routable`)
  on `local-three-node.json`, metric `priority`, `consecutive: 3`, asserting (a) serve lane ready within
  bound, (b) zero `learner_address_unresolvable` refusals against a committed row, (c) write + readback.
- Local reproducibility: plausible but unproven (hypothesis). The gating is control-plane logic, not
  host-specific; the local docker harness (`test/distributed/config/local-three-node.json`, image
  `distributed-db:test`, 1 CPU / 1 GiB per node) and the registry (`scenario-registry.js:14-54`) already run
  three-node scenarios, but no registered scenario uses `local-benchmark-3node.json` and none asserts
  routability of a fresh user table against the serve lane. The 2.5 s participant deadline misses (#30) and
  the ack-timeout streaks are load-dependent and may only appear on multi-host Docker with a slow node.

## 5. "Verified ready" predicate for the benchmark harness (stream B2)

`/health` `"ready":true` means only that a SQL engine object exists (`bootstrap-api-server-methods.js:154-171`)
and the deployer accepts it (`real-product-cluster-deployers.js:236-248, 272-283`). Before measurement the
harness must observe, on every node through the admin stream, all of:
1. Nodes: `SELECT node_id, status, connection_state, boot_incarnation, last_heartbeat, ready_lease_expires_at
   FROM nodes` returns exactly N rows with `status='active'`, `connection_state='ready'` and
   `ready_lease_expires_at > now` (columns `src/constants/columns.js:2,10,46,48,50`), stable for a window.
2. Priority spread: `control_snapshot_local` (`SELECT * FROM control_snapshot_local` or
   `GET /api/admin/control-snapshot`, `src/admin/admin-constants.js:25`) `currentPriorityPlacementObservation`
   / `priorityPartitionSummary.satisfied === true` with `requiredDistinctNodeCount === readyDistinctNodeCount`
   for all six priority partitions (`control_plane_publications-p1`, `replica_operations-p1`,
   `schema_operations-p1`, `sql_transaction_participants-p1`, `sql_transactions-p1`, `sql_write_operations-p1`);
   equivalently via SQL: for each, `SELECT COUNT(DISTINCT node_id) FROM services WHERE partition_id=? AND
   service_type='partition' AND status='active'` equals the replica count (columns `:12,22,57`,
   `service-status.js:5-8`).
3. Serve lane open: `controlPlaneDiagnostics.readinessByNodeId[nodeId]` (same snapshot,
   `admin-control-snapshot-local-build-base.js:795`) with `serveEligible === true` and empty `reasonCodes`
   on every node; specifically no `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, `priority_partitions_not_spread`,
   `publication_stream_not_ready`, `priority_recovery_active`, `planning_snapshot_refresh_pending`,
   `config_safe_mode`.
4. Quiescent ledger: `replica_operations` has no non-terminal row (`replicaOperations.inFlightCount === 0`
   in the snapshot; the harness already computes this in `cluster-class-quiescence.js` /
   `cluster-class-control-snapshot-recovery.js:1144-1150`) for a stable window (`preloadMaxReplicaOpsInFlight:
   0`, `preloadRequiredStableMs` as in `local-benchmark-3node.json`).
5. Routable user table: after `CREATE TABLE`, poll until `tables` has the row and, for every
   `partition_id` in `partitions WHERE table_name=?` (`leader_node_id` non-null, `columns.js:14`), `services`
   holds `>= syncReplicaAcks + 1` rows with `status='active'` on distinct `node_id`s and a routing probe
   (`SELECT COUNT(*) FROM <table>`) returns a result envelope (not `DISTRIBUTED_PARTICIPANT_FAILURE`); the
   `CREATE TABLE` answer itself must be consumed until `contractState` is not `pending` (the envelope carries
   `jobId`, `retryAfterMs`; `schema_replica_convergence_pending` / 55P03 means not ready).
6. Probe write + readback: one `INSERT` and one `SELECT` of the same key succeed with `affectedRows: 1` and
   the row visible on every node's admin stream before the clock starts; the measurement clock must start only
   after 1-6 hold for the configured stable window, and the harness must record the time-to-ready as a result,
   never fall through after N polls.

## 6. Cited source revisions (HEAD `69a26626d`; all identical to `07206ba1c8` and `62d537313`)

`54dd2d7ce`: partition-service-learner-promotion-proof-methods.js, partition-service-core-base.js,
cdc-delivery-outcome.js, control-plane-readiness-constants.js, sql-query-engine-shared.js,
partition-write-kernel.js, constants/errors.js, partition-participant-transaction-cutover-constants.js,
replica-handler-release-recovery.js, replica-handler-participant-release.js, node-trust-state.js,
message-group-service-peer-resolution.js. `252103a13`: partition-cdc-obligation-delivery.js,
sql-query-engine-provisioning-admission-methods.js, replica-handler-participant-cutover.js.
`1aea11baf`: peer-address-resolver.js, constants/service.js. `abef6c953`: query-constants.js,
query-executor-partition-delivery.js. `0675e87f1`: unified-rebalancer-shared.js. `ccbbf586b`:
projection-readiness-constants.js. `2444367b7`: query-executor-priority-recovery-bootstrap-routing.js.
`510babcf1`: bootstrap-api-server-methods.js. `003c65b89`: query-executor-partition-routing-snapshot.js.
`6c3ab4536`: config/listener-port-model.js. `2a7606bcc`: admin-control-snapshot-local-build-base.js.
