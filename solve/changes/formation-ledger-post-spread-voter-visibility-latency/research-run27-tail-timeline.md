# Run-27 tail timeline — post-spread quorum-concentration hold (voter-visibility latency)

Quest: `formation-ledger-post-spread-voter-visibility-latency`
Evidence: `solve/changes/formation-ledger-spread-window-follow-up-latency/run27-node-logs/node-{0..4}.log.gz` (NDJSON, gzipped), `run27-demo.log`.
Every claim cites node file + ISO timestamp (all 2026-07-05, times UTC). "Not observed" is used where a log line is absent (absence-proves-nothing).

## Node map (from first log line of each file)

| file | nodeId | pid | probed by client? |
| --- | --- | --- | --- |
| node-0.log.gz | 1024dc6c-55e2-4e57-8ba4-6bb6e6571c0d | 2269812 | YES (seed; runs sql-query-engine for the CREATE) |
| node-1.log.gz | d267454f-3e10-49d9-90b2-5d58339a89b8 | 2269955 | no |
| node-2.log.gz | aa4a50e7-65e8-4cf6-9759-6bdc97ad1c4e | 2269956 | YES |
| node-3.log.gz | f1bb7a68-ffb2-403d-97c2-ccdf7b55e260 | 2269957 | no |
| node-4.log.gz | 6b8aeeb7-93d7-4321-9cf8-b4f5a9e8c37d | 2269963 | YES |

Client failure (run27-demo.log, no timestamps in file): `operation_ledger_quorum_concentrated` for `tbl-04bfe5f4-27ea-4e83-841d-c696cff3bd3c-p1`, required=2 provisionable=0, target=3, rejected 1024dc6c, 6b8aeeb7, aa4a50e7. Node-0 log pins it at 13:22:19.606 ("Query execution failed"). NOTE: the "three probed nodes" are candidate TARGET nodes in node-0's own admission probe (`rejectedTargets` in node-0 13:22:19.606 "Insufficient admissible provisioning targets..."); all rejection decisions were computed on node-0. In fact ALL FIVE candidates were rejected (node-0 13:22:19.605 `admissionProbe.rejectedTargetNodePlans`); the error message surfaces only the first `required+1`.

Constants: `LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS = 5000` ms (`src/partition/partition-service-constants.js:26`); `LEARNER_PROMOTION_DELAY_MS = 30000` (line 25).

## HEADLINE CORRECTION (changes the quest's premise)

The predecessor framing was "two serialized ledger REPLACEs spread the ledger off the seed; both physically done by 13:22:08-10; hold release projected ~13:22:20-25". Run-27 evidence shows:

1. **op-2 was an ADD, not a REPLACE** (node-3 13:22:06.861 "Creating operation" op=9ab6ae15 type=ADD target=aa4a50e7). It never removed a seed replica. After op-2 completed (13:22:08.127) the physical layout was **r2+r3 still on node-0**, r4 on node-3, r5 on node-2 — 4 replicas against target 3, with the seed still holding 2.
2. **The hold could therefore NEVER release** — by the predicate arithmetic (`src/rebalancer/operation-ledger-quorum-concentration.js:129-132`), a node holding 2 voters out of 2, 3, or even 4 total is always "concentrated" (voters outside the hottest node never reach majority). The 13:22:19.605 rejection was NOT a late release; it was a correct evaluation of an unfinished spread.
3. Only TWO operations were ever created for `replica_operations-p1` in the whole run (grep "Creating operation" across all five logs): op-1 REPLACE `69cd7863` (node-0 13:21:46.059, target f1bb7a68) and op-2 ADD `9ab6ae15` (node-3 13:22:06.861, target aa4a50e7). **No REMOVE/REPLACE that would take a voter off node-0 was ever dispatched.** The cure move (REPLACE r3 → node-4) was planned once, at 13:22:17.487, and skipped 1ms later with reason=`budget_exceeded`.

## 1. Per-leg timeline of the two ledger moves

### Leg 1 — op-1 `69cd7863-ab3e-4a05-b3b6-47bc2885f48a`, REPLACE r1(node-0) → r4(node-3)

| time | node file | line |
| --- | --- | --- |
| 13:21:46.059 | node-0 | `rebalance-coordinator` "Creating operation" op=69cd7863 type=REPLACE target=f1bb7a68; 46.098 "Storage reservation created" |
| 13:21:56.954 | node-3 | `rebalance-coordinator` "Sending replica operation" CREATE_REPLICA op=69cd7863 (10.9s after op creation — dispatch gap predates the tail; node-3 `replica-handler` "Handling CREATE_REPLICA request" same ms) |
| 13:21:57.155 | node-3 | `partition` r4 "Starting as learner (non-voting) - will promote after catch-up" |
| 13:21:57.170 | node-0 | `partition` services-table "Fetched inserted row for CDC" (r4 services row insert; row identity inferred from timing — content not logged) |
| 13:21:57.174 | node-3 | `replica-handler` "Waiting for replica voter-ready activation" r4 |
| 13:21:58.291 | node-0 | services CDC "Fetching updated row for CDC key=replica_operations-p1-r4" → "**No row found for CDC update**" — the update event was DROPPED |
| 13:22:02.165 | node-0 | same again: update for key r4 → "**No row found for CDC update**" (second dropped update) |
| 13:22:02.191 | node-3 | `replica-handler` "Replica reached voter-ready activation state" r4 — **promotion executed: 5.036s after learner start ≈ the 5000ms priority-recovery floor** (floor 5.000s + ~36ms execution). No explicit raft membership-change/promotion commit line exists anywhere in the logs (not observed); voter-ready = in-memory role no longer LEARNER (`src/node/replica-handler-voter-readiness-methods.js`, `isReplicaVoterReady`). |
| 13:22:02.194 | node-0 | services CDC "Fetched inserted row for CDC" — 3ms after voter-ready; plausibly r4's durable row upsert (identity unconfirmed, row content not logged) |
| 13:22:02.772 | node-0 | `rebalancer` entityId=replica_operations-p1 "Lost leadership, stopping rebalancing scheduler" (r1, the ledger LEADER, is the REPLACE source) |
| 13:22:02.891 | node-3 | `rebalance-coordinator` "Sending replica operation" (the REMOVE step, op=69cd7863) |
| 13:22:02.892-905 | node-0 | `replica-handler` "Handling REMOVE_REPLICA request" r1 → 02.905 "Replica removal completed". **Ordering answer: PROMOTION (02.191) came BEFORE REMOVAL (02.905).** The 2-voter dip at 13:22:03.528 was not remove-before-promote; it was the promotion being invisible to the services actuals (below). |
| 13:22:03.026 | node-3 | `partition` r4 "Became leader (liferaft)" + `rebalancer` "Became leader, starting rebalancing scheduler" — the freshly promoted replacement took ledger leadership at raft level |
| 13:22:03.513/.527 | node-3 | "Priority recovery drain settled operation" / "Operation completed" op=69cd7863 type=REPLACE |

**services-row raft_role update after promotion: NOT OBSERVED.** Node-0 hosts the services-table CDC; after the two dropped updates (58.291, 02.165) no `Fetching updated row ... key=replica_operations-p1-r4` appears again in the window. Per the CL-035 comment (`src/node/replica-handler-create-methods.js:461-478`), learner→voter promotion updates only the in-memory role plus a DEFERRED durable raft_role write; a local-cache raft_role seed is applied on the HOSTING node only (replica_operations is a priority control-plane table, `src/bootstrap/system-partition-classification.js:17-23`). **CDC propagation of r4's voter role to other nodes' caches: not observed anywhere, on any node, through teardown.**

### Leg 2 — op-2 `9ab6ae15-164b-45e2-a4e0-36c100b0a4e7`, ADD → r5(node-2). This was the leg whose dip was live at 13:22:03.5? No — the 13:22:03.528 dip evaluation predates op-2 entirely; it reflects leg-1's aftermath (r2,r3 on node-0 as the only VISIBLE voters).

| time | node file | line |
| --- | --- | --- |
| 13:22:06.850 | node-3 | `rebalancer` "Starting rebalancing" / "Executing rebalancing move" type=add |
| 13:22:06.855 | node-3 | `rebalance-coordinator` WARN "Operation-ledger quorum concentrated..." — deferredMoveType=REPLACE deferredPartitionId=control_plane_publications-p1; concentratedPartitions=[{replica_operations-p1, totalVoters=2, maxVotersOnOneNode=2, hottest=1024dc6c, feasibleTarget=d267454f, overTarget=false, spreadActionable=true}] — **node-3's own evaluation still counted r4 as a non-voter 3.8s after r4 became raft leader ON NODE-3 ITSELF** |
| 13:22:06.861 | node-3 | "Creating operation" op=9ab6ae15 type=ADD target=aa4a50e7 (the spread cure is exempt from its own hold) |
| 13:22:07.115 | node-3 | "Sending replica operation" CREATE_REPLICA op=9ab6ae15 |
| 13:22:07.116-118 | node-2 | `replica-handler` "Handling CREATE_REPLICA request"; r5 create stage=starting; **"Replica create status write deferred after retryable control-plane failure"** (the status write itself deferred) |
| 13:22:07.178 | node-3 | `replica-dispatch-service` "Deferred replica operation dispatch while control-plane path recovers" op=9ab6ae15 |
| 13:22:07.704 | node-2 | "Waiting for replica voter-ready activation" AND "Replica reached voter-ready activation state" r5 in the SAME millisecond — r5 never logged a learner phase (no "Starting as learner" line on node-2 in the entire log), so no 5s floor applied to leg 2 |
| 13:22:07.695/.850 | node-0 | services CDC "Fetched inserted row for CDC" ×2 (r5 row insert(s); identity inferred from timing). No UPDATE for r5's row observed afterwards. |
| 13:22:07.861 | node-2 | r5 stage=active peers=3/3, "Replica creation completed" |
| 13:22:08.127 | node-3 | "Operation completed" op=9ab6ae15 type=ADD |
| 13:22:09.625→10.220 | node-2 | "Committed terminal transition not authoritatively visible; repair scheduled" → "Terminal transition repair confirmed authoritative visibility" (op-row visibility repair, 0.6s) |

### Concentration evaluations observed (msg "Operation-ledger quorum concentrated on one node; ...")

- 13:22:03.528 node-0: totalVoters=2, maxVotersOnOneNode=2, hottest=1024dc6c, feasibleTarget=d267454f, overTarget=false, spreadActionable=true; deferredMoveType=ADD, deferredPartitionId=tbl-04bfe5f4-...-p1 (the client's table).
- 13:22:06.855 node-3: identical numbers (deferred a control_plane_publications REPLACE).
- After 13:22:06.855: **no further "quorum concentrated" evaluation line on any node** (not observed ≠ not evaluated: node-0's admission probe re-evaluated every 50ms silently, see §3; its final result is embedded in the 13:22:19.605 diagnostics).

Raft-level truth vs these evaluations: at 13:22:03.528 the raft voter set was r2, r3 (node-0) + r4 (leader, node-3) = 3 voters, 2 on node-0. The evaluation's totalVoters=2 was stale (r4 invisible), but the "concentrated" verdict was correct even against fresh data (outside voters 1 < majority 2).

## 2. Hold state after 13:22:08 — engaged or released, on which nodes

**Engaged continuously until teardown; never released.**

- 13:21:59.941 node-0 `sql-query-engine` WARN "Provisioning target-node convergence timed out" (inner wait: requestedMaxWaitMs=1000, adaptive maxWaitMs=10000, waitedMs=10179): all 5 targets `deferred`, blockingReasons=["operation_ledger_self_move_in_flight"], maximumProvisionableReplicaCount=0.
- 13:21:59.941 node-0 WARN "Whole-cluster transient provisioning hold; waiting it out under the provisioning budget instead of failing the create" (maxWaitMs=30000) — the transient wait engaged.
- 13:22:19.605 node-0 WARN "Provisioning target-node convergence timed out" (outer wait: waitedMs=19663): final probe rejected all 5 targets, blockingReasons now ["operation_ledger_quorum_concentrated"], maximumProvisionableReplicaCount=0.
- 13:22:19.606 node-0 ERROR "Insufficient admissible provisioning targets for initial table partition" → "Query execution failed" (the client error).
- 13:22:19.609 node-3 "Lost leadership, stopping rebalancing scheduler"; teardown shutdowns at 13:22:24.307-25.487 (node-0 "Shutting down partition service").

### 2a. Stale-cache or genuinely concentrated?

**Both — but the decisive fact is that the verdict was correct regardless of freshness.** Predicate (`src/rebalancer/operation-ledger-quorum-concentration.js`): voters = local systemTableCache SERVICES rows with status ∈ {ACTIVE, REMOVING} AND raft_role ∈ {leader, follower, candidate} (lines 24-29, 48-55; actuals-only, no live raft read, lines 170-179); concentrated iff `totalVoters - maxVotersOnOneNode < floor(totalVoters/2)+1` (129-132).

Arithmetic after op-2 (r2+r3 physically on node-0):

| cache sees as voters | total | maxOnOneNode | outside | majority | verdict |
| --- | --- | --- | --- | --- | --- |
| r2,r3 only (observed state: r4/r5 raft_role never updated) | 2 | 2 | 0 | 2 | CONCENTRATED |
| + r4 | 3 | 2 | 1 | 2 | CONCENTRATED |
| + r4 + r5 (perfect freshness) | 4 | 2 | 2 | 3 | **STILL CONCENTRATED** |

So post-spread "visibility latency" was NOT what kept the client blocked at 13:22:19.6 — the spread itself was incomplete (no node-0 voter removed). Staleness was real and additionally harmful, though (see §4): with r4/r5 invisible as voters, `overTarget` computed false (totalVoters=2 ≤ target 3, line 145-146), hiding the surplus-drain cure; and in any counterfactual where a node-0 replica HAD been removed, the invisible promotions would have kept the verdict concentrated anyway (1 visible voter, outside=0 < majority=1).

## 3. The provisioning transient-wait: budget and re-probe cadence

Code: `src/query/sql-query-engine-initial-partition-provisioning.js:673-729` (`waitOutWholeClusterTransientProvisioningHold` — engages only when maximumProvisionableReplicaCount=0 and EVERY rejection is transient), calling `waitForProvisionTargetNodeIds` (`src/query/sql-query-engine-provision-target-methods.js:89-`) with failOnTimeout=false.

- **Budget**: `tablePartitionProvisioningTimeoutMs` = `TABLE_CREATE_PROVISION_TIMEOUT_MS` = 30000ms (`src/query/query-constants.js:427`). Crucially the wait runs under the CREATE's shared `timeoutBudget` — it is "honest budget attribution, not a raised timeout" (code comment, initial-partition-provisioning.js:680-687). The inner convergence phase consumed 10179ms (node-0 13:21:59.941, waitedMs=10179 → wait started ~13:21:49.76), the outer wait 19663ms (node-0 13:22:19.605) — total 29842ms ≈ the 30s budget. **The "expiry at 13:22:19.6" is the CREATE's 30s budget from ~13:21:49.8, not a fresh 30s from 13:21:59.9.**
- **Re-probe cadence**: `tablePartitionProvisioningPollIntervalMs` = `TABLE_CREATE_PROVISION_POLL_INTERVAL_MS` = 50ms (`src/query/query-constants.js:428`); each poll calls `probeProvisioningTargetAdmission` (provision-target-methods.js:144-152), which runs the ledger-interlock/concentration admission check against node-0's caches. Individual re-probes are not logged (not observed in logs — no sql-query-engine lines at all on node-0 between 13:21:59.941 and 13:22:19.605); only the terminal probe's result is captured in the 13:22:19.605 diagnostics. ~390 probes would have run over the outer wait.
- **What the re-probes saw** (from the two logged endpoints): at engage (13:21:59.941) the blocking reason was `operation_ledger_self_move_in_flight` (op-1 running); by expiry (13:22:19.605) it had transitioned to `operation_ledger_quorum_concentrated` (op-1/op-2 done, hold engaged). The transition instant is not logged; bounded between 13:22:03.5 (first concentration deferral) and 13:22:19.605.

## 4. Total tail accounting — which leg is binding?

Reference points:

- 13:21:49.76 — CREATE's provisioning budget starts (derived).
- 13:22:02.905 — leg-1 physically done (r1 removed; promotion 02.191 preceded).
- 13:22:03.528 — hold first observed engaged for the client's partition (node-0).
- 13:22:08.127 — op-2 (ADD) complete = "physical spread complete" in the predecessor's (incorrect) framing. Actual layout: node-0 still holds 2 voters.
- 13:22:19.605 — budget expiry, client failure. Post-op-2 tail = **11.48s**.

Leg attribution of the 11.48s tail:

| leg | contribution | evidence |
| --- | --- | --- |
| Promotion floor (5000ms) | 0s in the tail (5.04s inside op-1: 13:21:57.155→13:22:02.191 node-3; r5 had NO learner phase, 0s) | §1 |
| Promotion execution beyond floor | ~36ms (r4) | §1 |
| services-row raft_role write | **never landed** — 2 dropped CDC updates (node-0 13:21:58.291, 13:22:02.165 "No row found for CDC update" key=...r4), no post-promotion update observed for r4 or r5 through teardown | §1 |
| CDC propagation to other caches | n/a (nothing to propagate); node-3's own eval blind to its own leader replica at 13:22:06.855 | §1 |
| Evaluation cadence | not binding — node-0 re-evaluated every 50ms (§3); coordinator evals logged 13:22:03.528, 13:22:06.855 | §3 |
| Probe cadence | not binding — 50ms | §3 |
| **Spread completion (the missing 3rd move)** | **BINDING: entire 11.48s.** op-2 was count-increasing; the hold mathematically required removing a node-0 voter (§2a). The cure REPLACE r3→6b8aeeb7 was first planned 13:22:17.487 (node-3) — a 9.36s planner gap after op-2 (passes at 12.061/13.301 planned only a control_plane_publications move; 13:22:17.370 "Deferring spread-driven count-increasing ADD while already at/over target replica count (no count-neutral REPLACE pairing)", targetReplicaCount=3, deferredAddCount=1, replaceSerializationCap=true) — and then skipped at 13:22:17.488 reason=`budget_exceeded` (admissionDecisionType=null → blocked by the move budget before admission; skip sites: `src/rebalancer/unified-rebalancer-rebalance-loop.js:191,231`, `src/rebalancer/rebalance-coordinator-concurrent-budget-gate.js:85`). Every move execution on node-3 from 13:22:12.064 onward was budget_exceeded (12.064, 13.304, 17.488, 17.490). Why the global budget was exhausted is not determinable from these logs (in-flight count/reserved slots not logged) — open follow-up. | §1, §2a |
| **Voter visibility (raft_role staleness)** | **BINDING IN SERIES for any counterfactual release**: even if the r3 REPLACE had run and completed instantly, with r4/r5 still invisible as voters the predicate would read totalVoters=1..2 all on/off node-0 and could still evaluate concentrated (1 visible voter → outside=0 < majority=1). Release required BOTH a node-0 voter removal AND the deferred raft_role writes landing. Observed lag: ≥16.4s (r4 promoted 13:22:02.191; nothing landed by teardown ~13:22:19.6) — unbounded in this run. | §1, §2a |

**Answer to "which leg is BINDING": two legs, in series — (1) the spread never completed (op-2 ADD instead of a count-neutral move off the seed; the cure REPLACE arrived 9.4s late and was budget_exceeded), and (2) the learner→voter raft_role durable write never reached the services actuals (dropped CDC updates, deferred durable write per CL-035), so even a completed spread could not have been SEEN.** The 5s promotion floor, CDC fan-out, evaluation cadence, and probe cadence were all non-binding in run-27. The quest's premise ("hold releases ~11s late: 5s learner floor + cache propagation") does not match run-27: the hold never released, correctly, because the seed still held 2 of the ledger's voters.

### Secondary observations (durable, for follow-ups)

- op-1's dispatch gap: created 13:21:46.059 (node-0), CREATE_REPLICA sent 13:21:56.954 (node-3) — 10.9s before the first step fired, pre-tail but on the same critical path (relates to the dispatch-arming lineage).
- The client's error surfaces only 3 of 5 rejected targets (required+1 truncation) — all five nodes were rejected identically by node-0's probe.
- node-2 hlc "Excessive clock drift detected" ×3 at 13:22:07.825-828 during r5 creation.
- The eventual over-target state (4 replicas vs target 3) plus invisible voters (overTarget computed from totalVoters, not row count) left the planner oscillating: spread-ADD deferred (at/over target, 13:22:17.370) while the drain path (overTarget=false) never armed.
