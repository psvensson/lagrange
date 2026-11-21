# Formation run 2 on f580579a5 — causal analysis (read-only)

Run: `fresh-formation-user-table-routability`, three hosts, one node per host, source f580579a5, diagnostic. FAIL after 508.5 s.
Evidence: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/physical-baseline-f580579a5-run2-evidence/` (node logs read from `.playback/report/.full-logs/…/*.log.gz`, which are complete; the retained `<nodeId>.log` copies are 5–7 % shorter).
Comparison: run 3ed87e16 on 60fe32768, `/tmp/lagrange-physical-peerbytes-nov21/test-output/`.

Conventions. SEED = eb759651 on tv-dator (seed in both runs), ADAM = 1f973527 on adam-laptop, GAMLA = 7bd6c72d on adams-gamla. Node-log times are that node's own clock. Poll and snapshot times are the harness (desktop) clock. Where I place a harness time beside a node time I am assuming the clocks agree to about a second (seed first log line 11:23:44.5 vs harness container start 11:23:43.1); no duration below is computed across machines. OBSERVED = quoted from evidence; INFERRED = my reading.

## Summary

- **Same failure as the previous run, different course.** Both runs miss peer delivery deadlines from about 40 s after seed start, lose ledger leadership from the seed to a joiner, and then stall two priority ADD operations for 5–6.5 minutes.
- **First divergence (all three nodes, 11:24:25–11:24:34):** the transport (`message-router`) misses its 500–1000 ms delivery-ACK bound between SEED and the joiners. No event-loop gap ≥ 1 s, no CPU saturation and no log silence accompanies it.
- **Progress stopped 11:25:26 and resumed 11:30:18–25 (seed clock).** The stall ended when the 300 s operation budget expired, not when the awaited ledger row became available (INFERRED from the timing).
- **d failed** because CREATE TABLE at 11:31:26 was refused with `ready_lease_expired` on all three nodes, and the harness does not re-issue a `deferred` answer.
- **g failed** because ADAM's services cache lagged the authority for 80 s during a SEED↔ADAM connection outage. In the previous run g was largely unobservable, not proven healthy.
- **Read-lifetime repair:** seed SQL authority read failures fell from 58 to 7; control-snapshot-lane failures did not move (30 → 30).
- **Correction to the brief:** `LAGRANGE_SERVICES_QUERY_TRACE` does not exist at f580579a5; the trace code was deleted between the two commits, so it could not have been set.

## 1. Timeline

### Node start, join, readiness

| Node | Process start (own clock) | Node state `ready` | Active in harness snapshot | Readiness for the rest of the run |
| --- | --- | --- | --- | --- |
| SEED | 11:23:48.712 | 11:23:49.588 | 11:23:58.1 | `join_ready` 11:24:07.391, then `degraded: PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` from 11:24:09.797 to SIGTERM (483 s) |
| ADAM | 11:24:06.440 | 11:24:07.814 | by 11:24:11.6 | `degraded: PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` from 11:24:07.647 to SIGTERM (485 s) |
| GAMLA | 11:24:05.894 | 11:24:19.066 (11.7 s in `LEADER_METADATA_INCOMPLETE`) | joining 11:24:20.0, active 11:24:23.1 | `degraded: PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` from 11:24:18.673 to SIGTERM (474 s) |

Harness: `cluster.ready nodeCount 3` at 11:24:23.846. Formation step 11:24:24.380 → 11:31:24.381 (420.001 s). User-table step 11:31:24.381 → 11:31:30.433. Teardown from 11:32:12.755.

### Priority partition spread

Authority counts come from the 34 scenario polls (ready distinct nodes of 3). Scenario seconds are measured from 11:24:24.38.

| Partition | 1/3 until | 2/3 | 3/3 from | Seed coordinator log (seed clock) |
| --- | --- | --- | --- | --- |
| replica_operations-p1 (ledger) | poll 2, 20.8 s | — | poll 3, 23.9 s (11:24:48) | ADD→ADAM 11:24:09–13; ADD→GAMLA 11:24:25–38; promote completed 11:24:48 |
| control_plane_publications-p1 | poll 6, 41.5 s | polls 7–9 | poll 11, 113.8 s (11:26:18) | ADD→ADAM 11:24:14–18; ADD→GAMLA 11:24:48–11:25:04; promote 11:25:07 |
| schema_operations-p1 | poll 7, 50.7 s | polls 8–9 | poll 11, 113.8 s | ADD→ADAM 11:24:14–18; ADD→GAMLA 11:24:48–11:25:05; promote 11:25:09 |
| sql_transactions-p1 | poll 28, 375.4 s | — | poll 29, 379.5 s (11:30:44) | ADD→ADAM 11:24:19–23; ADD→GAMLA created 11:25:05, **in SENDING until 11:30:33**, completed 11:30:38; promote 11:30:44 |
| sql_transaction_participants-p1 | poll 29, 379.5 s | — | poll 30, 387.5 s (11:30:52) | ADD→ADAM 11:24:18–25; ADD→GAMLA created 11:25:05, **in SENDING until 11:30:25**, completed 11:30:40; promote 11:30:49 |
| sql_write_operations-p1 | every poll including 420.0 s | — | never | ADD→ADAM 11:24:49–57; ADD→GAMLA 11:30:40–11:31:16; no promote before SIGTERM. Snapshot 11:31:36.6 shows SEED plus two learners |

- The ledger finished growing at 11:24:48 (seed clock), 59 s after seed start.
- The other partitions started at 11:24:14 (two) and 11:24:18–19 (two), while the ledger still had 2 of 3; sql_write_operations started at 11:24:49.
- Progress stopped at 11:25:26 (last dispatch: `pl-artifact_payloads-p1-199-0` SEND). The next step change is 11:28:11 (that operation to CREATING), and nothing completed until 11:30:32.

### Observation gaps

| Source | Gap |
| --- | --- |
| Playback `snapshots.ndjson` (74 snapshots) | **11:25:35.2 → 11:30:38.4, 303.2 s with no snapshot**; also 17.2 s, 16.5 s (before it) and 33.3 s (11:31:03 → 11:31:36) |
| Scenario polls, authority | polls 10 (97.8 s) and 20 (257.8 s) had no authority reads at all; polls 21–22 lacked `replica_operations` |
| Scenario polls, SEED control snapshot | absent in polls 9–27 (81.8–369.8 s) and 32–33 |
| Scenario polls, GAMLA control snapshot | absent in polls 11, 12, 14–20 (113.8–257.8 s) |
| `samples.ndjson` | 10–41 s holes on all nodes between 11:25:04 and 11:28:46; 20 of 210 samples lack process diagnostics |

The playback capture uses the seed's `snapshot` lane, the same lane as the scenario's control snapshot: `Failed to capture topology snapshot: Admin API query timed out for node eb759651… on lane snapshot after 15000ms` (11:25:52.456).

## 2. Observation coverage

| | Previous (60fe32768) | This run (f580579a5) |
| --- | --- | --- |
| Polls | 31 | 34 |
| Failed reads | 88 | 37 |
| SEED control snapshot, lane `snapshot` (polls) | 22 | 21 |
| GAMLA control snapshot, lane `snapshot` (polls) | 8 | 9 |
| ADAM control snapshot | 0 | 0 |
| SEED `SELECT * FROM partitions`, lane `default` | 19 | 1 |
| SEED `SELECT * FROM services` | 19 | 2 |
| SEED `SELECT * FROM replica_operations` | 20 | 4 |

Every failure in both runs has the same reason: `Admin API query timed out for node … on lane … after 15000ms` (one clipped to 4557 ms at the bound).

- **What changed (OBSERVED).** Seed SQL authority reads improved from 58 failures to 7. Snapshot-lane failures are unchanged at 30, with the same per-host split.
- **Read lifetime is visibly longer (OBSERVED).** Still-pending reads are now closed when their invocation ends: `"error":"Recovery read delivery closed"` appears 266× on SEED, 159× on ADAM and 108× on GAMLA, with elapsed p50 about 1.0 s and maxima of 46.6 s (SEED) and 54.2 s (ADAM). In the previous run the dominant read wait was `getReadRetryAttemptLimit` at p50 5.0 s.
- **Attribution is not settled (INFERRED).** The ledger leader was ADAM here and GAMLA before, so one run cannot separate the repair from the different leader placement. `services-p1` and `partitions-p1` stayed on the seed (term 1) in both runs and their reads improved from 19 to 1–2, which favours the repair.
- **The "three reads, all absorbed late" shape cannot be checked.** `git grep LAGRANGE_SERVICES_QUERY_TRACE` hits `src/diagnostics/services-query-delivery-trace.js` at 60fe32768 and nothing at f580579a5; that file and `services-query-socket-writes.js` were deleted. The missing observation is the per-query record of each read's grant, its target replica, and the arrival time of its response relative to the query's end.
- **Nearest surviving proxy (OBSERVED).** `No pending service response request` (`unmatchedClassification: orphaned`), counting suppressed repeats:

| Node | Previous | This run |
| --- | --- | --- |
| SEED | 45,966 (62/s) | 17,522 (33/s) |
| ADAM | 59,992 (81/s) | 29,090 (56/s) |
| GAMLA | 68,953 (95/s) | 28,820 (56/s) |

Late responses roughly halved per second but still arrive at tens per second. The counter is not restricted to SERVICES reads.

- **Missing on the node side.** No node logs the receipt or completion of a control-snapshot request, so why the seed's `snapshot` lane exceeds 15 s is not determinable from this evidence.

## 3. First divergence and error classes

### First divergence per node (own clocks)

| Node | Time | Subsystem | Quoted |
| --- | --- | --- | --- |
| ADAM | 11:24:25.339 | `message-router` | `"wait":"MESSAGE_TIMEOUT_MS (delivery ACK)","boundMs":999,"elapsedMs":1000 … "targetNodeId":SEED`; its nodes-row write is `answer_lost_after_delivery`; `lastInboundAgoMs: 1033` |
| SEED | 11:24:30.873 | `message-router` | `"wait":"MESSAGE_TIMEOUT_MS (delivery ACK)","boundMs":500,"elapsedMs":502 … "targetNodeId":ADAM` |
| GAMLA | 11:24:33.787 | `message-router` | `"wait":"MESSAGE_TIMEOUT_MS (delivery ACK)","boundMs":499,"elapsedMs":502 … "targetNodeId":SEED` |

Owner of the first divergence: the transport delivery owner (`src/transport/message-router-*`). The previous run starts the same way (first `message-router` wait-bound at 06:46:31 on the joiners, 06:46:34 on the seed, 24–27 s after seed start).

Earlier lines are startup noise present in both runs: one seed loop gap during bootstrap (2133 ms here, 2323 ms before), six `Out-of-order CDC event` and `Raft CDC command failed` pairs, and joiner `dynamic-config` 300 ms waits.

### What followed

1. **The seed delivers writes for partitions it leads to ADAM's learner replica (OBSERVED, 11:24:31–47).** `"partitionId":"replica_operations-p1","forRead":false … "lastParticipantNodeId":ADAM`, target `ADAM/partition/replace-replica-2ed2ac8c…`, `"deliveries":42 … "state":"answer_lost_after_delivery"`. SEED was the ledger's raft leader (term 1) until 11:24:59.975. The previous run shows the same at 06:46:49.
2. **Ledger leadership leaves the seed.** ADAM loses leader contact three times (11:24:46.768, 11:24:53.906, 11:24:58.657), campaigns at 11:24:59.840 and is `quorum_elected` in term 2 at 11:24:59.906. Raft timing is `heartbeatMs 50, electionMinMs 1000`.
3. **Leadership churn on ADAM (OBSERVED).**

| Partition | Max term, this run | Max term, previous run |
| --- | --- | --- |
| replica_operations-p1 | 19 (ADAM campaigned 18×) | 2 (GAMLA once, at 06:47:45, then stable) |
| control_plane_publications-p1 | 22 (ADAM 21×) | 2 |
| schema_operations-p1 | 12 (ADAM 9×, GAMLA 7×) | 6 |
| sql_transaction_participants-p1 | 2 | 7 |

   ADAM repeatedly steps down within a term (`role_transition follower, raft_follower_event`) and re-campaigns 5–20 s later. The ledger had a stable leader (ADAM, term 18) only from 11:28:51 to 11:31:58.
4. **SEED↔ADAM connection duel, 11:25:57.679 → 11:27:35.** ADAM logs `Quarantining target connection after ACK timeout … ackTimeoutStreak 61`, then reconnects 10 times; each attempt closes within 60–900 ms while SEED logs `existingConnectionForNode: true`. SEED quarantines at 11:27:04.463 (`ackTimeoutStreak 45`) and reconnects 16 times with the same result. The link re-keys at 11:27:34.974. The previous run had the same class at smaller scale (three quarantines).
5. **The stall.** From 11:25:44 to 11:30:05 the seed defers the two GAMLA-targeted priority ADDs 101 times: `"errorMessage":"Placement CREATE bootstrap row is unavailable","transportReasonCode":"placement_bootstrap_authority_wait"`. Both operations show `create_admission_state: null` in the 11:25:35 snapshot. Ledger row writes fail meanwhile: `Failed to persist operation` 12×, ten with `"error":"Named control-plane write wait expired"` (bound 15,000 ms, elapsed 15–30 s), four of them at 11:29:00–11:30:06 when the ledger leader was stable and the link was up.
6. **Resumption at the budget.** The operations were created at 11:25:05; `REBALANCE_OPERATION_BUDGET_MS` is 300000 (`src/control-plane/timeout-budget.js:18`); the last bootstrap-wait deferral is 11:30:05.714 and the first step change 11:30:25.768. INFERRED: the wait ended through its deadline branch. A `FAILED` terminal transition for one of them was attempted and refused four times (11:30:18–35) while it proceeded.

### Counts per node (whole run)

| Class | SEED | ADAM | GAMLA |
| --- | --- | --- | --- |
| `Wait bound spent` (all waits) | 1336 | 829 | 738 |
| — message-group direct delivery, `ROUTER_MESSAGE_TIMEOUT` | 412 → ADAM, 71 → GAMLA | 288 → SEED | 295 → ADAM, 105 → SEED |
| — query-executor `partition_execution_deadline` (bounds 1000–30000 ms) | about 260, mostly → ADAM | about 275, → SEED | about 135 |
| — message-router delivery ACK / response grant | 72 | 42 | 52 |
| — rebalance-coordinator `REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS` (1000 ms) | 66 | 3 | 4 |
| `Failed to send message` | 268 (all → ADAM) | 162 (→ SEED) | 108 |
| `Skipping ACK-timeout quarantine … (slow, not dead)` | 43 | 326 | 388 |
| `Partition write outcome still unknown` | 158 | 19 | 43 |
| `Distributed write failed due to participant failures` | 160 | 19 | 45 |
| `Heartbeat failing repeatedly` | 16 (from 11:31:19, `not_applied_source_unchanged`) | 32 (from 11:25:54, `authority_unavailable` 27) | 12 |
| `Deferred retryable replica operation dispatch failure` | 121 (117 are the bootstrap wait) | 207 (handoff to SEED: `ROUTER_CONNECTION_CLOSED` 104, `ROUTER_MESSAGE_TIMEOUT` 90) | 40 |
| `Named control-plane write wait expired` (lines) | 31 | 0 | 0 |
| `retained operation row repair refused` | 8 | 0 | 0 |

Per 30 s on the seed, `Wait bound spent` runs 18, 53, 69, 108, 96, 148, 57, 74, 122, 93, 101, 89, 67, 80, 54, 92 from 11:24:30. It never returns to zero. `Failed to send message` and "outcome unknown" follow the same curve; dispatch deferrals peak at 11:27:00–11:28:30 (36, 41, 26).

`Failed to send message` is mostly not a send failure: 266 of the seed's 268 carry `Recovery read delivery closed`, the new disposal of a pending read.

**Not present:** placement admission BUSY, capacity or not-leader refusals (0; all 20 leader decisions are `outcome: in_flight`); foreign-qualified named-write refusals (0); `priority_operation_serial_wait` (0); `learner_address_unresolvable` (0); outbound-queue backpressure (0). "Paused mutation admission" appears as a write error 6× on SEED and 19× on GAMLA.

### Which peer is slow

| Reporter → peer | Skips | `lastInboundAgoMs` p50 / max |
| --- | --- | --- |
| ADAM → SEED | 326 | 0.58 s / 21.4 s |
| GAMLA → SEED | 145 | 4.0 s / 14.1 s |
| GAMLA → ADAM | 243 | 0.14 s / 10.3 s |
| SEED → ADAM | 43 (11:26:35–11:27:03 only) | 14.1 s / 25.2 s |

- **No single node is the common slow peer.** The seed is named most (471 of 757 here; 1023 of 1127 in the previous run), then ADAM once it held the ledger and during the connection duel.
- **The 4-core adams-gamla is named by nobody**, although it has the slowest CPU.

### Starvation, CPU, disk

| Check | Result |
| --- | --- |
| Event-loop gap ≥ 1 s (watchdog threshold 1000 ms, interval 250 ms) | One, on the seed during bootstrap (11:23:55.744, 2133 ms). None on any node afterwards. The previous run is the same (three, all at startup or 1.0–1.4 s). |
| Log silence | Longest gap between consecutive lines after startup: SEED 2.4 s, ADAM under 1.5 s, GAMLA 4.4 s. All processes ran throughout the windows where a peer saw them silent for 5–25 s. |
| Container CPU (limit 1.0 CPU) | About 100 % only in the first 40–60 s per node. Afterwards SEED 17–40 %, ADAM 29–64 % (one 100 % sample at 11:30), GAMLA 24–60 %. Samples are sparse between 11:25 and 11:29. |
| Tagged synchronous work per minute | SEED 1.6–3.8 s of 60 s, excluding `storage_reservation_reconcile`, which reports 6–33 s per call but cannot be synchronous (no loop gap accompanies it). |
| Memory | Working set ≤ 600 MB of 1 GB, heap ≤ 180 MB. |
| Disk | No fsync, lock or slow-storage line in any log. No disk measurement exists in the evidence. |
| Sub-second loop delay, network RTT, socket buffering | **Not measured.** `rxBytes`/`txBytes` are 0 in every sample and no RTT is logged. |

INFERRED: the multi-second inbound silences are not whole-process stalls. Whether they are sub-second loop delay compounding, transport queueing, or the network path cannot be decided from this evidence.

## 4. Comparison with the previous run

| Predicate | Previous | This run |
| --- | --- | --- |
| a serve lane | fail | fail |
| b priority spread | fail | fail |
| c ledger quiet | fail | fail |
| d user table routable | pass at 515.5 s | **fail** |
| e write/readback | pass | not evaluated |
| f learner address | pass | pass |
| g projection agrees | pass | **fail** |
| observation integrity | fail (88) | fail (37) |

"Time-to-serve-lane 8 s" is the first poll in this run (8006 ms), as 5026 ms was in the previous one. `a` then goes unmet from poll 7 (50.7 s) when GAMLA's ready lease lapses (seed, 11:25:16.171: `leaseAgeState expired, leaseExpiredForMs 8254`).

### Why d failed (OBSERVED chain, seed clock)

1. 11:31:03.730 — nodes-p1 leader admits GAMLA's replica (`pl-nodes-p1-301-0`, `outcome in_flight`).
2. From 11:31:09.042, every 5 s — the seed's own heartbeat UPDATE of its nodes row is delivered to `ADAM/partition/replace-replica-a8b0388e…` (ADAM's nodes-p1 learner) and times out at 1000 ms. nodes-p1 never left the seed (term 1 all run).
3. 11:31:19.045 — `Heartbeat failing repeatedly … not_applied_source_unchanged`. 11:31:20.027 — the seed's own lease is `expired, leaseExpiredForMs 6966`.
4. 11:31:26.574 — `Creating table ffr_probe`. 11:31:27.068 — `Provisioning unavailable: quorum not reachable … (have 0, quorum 2)`, `reasons ["ready_lease_expired"]` for all three nodes. Four more server-side attempts through 11:32:10 fail the same way.
5. The harness records `contractState "deferred", nextAction "retry"` and stops: it re-issues CREATE only when `contractState === 'pending'` (scenario lines 337–339, 375–378).

In the previous run CREATE (06:54:06) preceded the second nodes-p1 ADD (06:55:30); its first answer was `pending / retry` and the second succeeded. The same misdelivery of nodes writes appears there afterwards (06:55:56). INFERRED: d flipped on the order of two events, plus a harness rule that treats `deferred`+`retry` as final.

### Why g failed (OBSERVED)

- Persistent disagreement on observer ADAM for `control_plane_publications-p1` and `schema_operations-p1`, polls 11–16 (11:26:18 → 11:27:38), `longestSpanMs 80008` against a 1000 ms bound.
- Authority (services-p1 on SEED, applied index 211→213) has GAMLA's replica as `follower`; ADAM's cache row still says `learner`, with `lastSourceLogIndex` 174→177.
- The window lies inside the SEED→ADAM silence and connection duel (11:25:27–11:27:35) and clears at the next poll after the link re-keys.
- In the previous run 19 of 31 polls had no authority reads, so disagreement could not be evaluated there. g passing was largely an absence of observation.

### Regression, variance, or the same failure

Source delta: 78 commits touch `src/`, 99 files, +4020/−2104; largest are `query-executor-partition-delivery.js` (1234 lines), the new retained-repair files, `control-plane-write-identity.js` (329) and the new `control-plane-named-write-wait.js`.

| Reading | Confidence | Evidence |
| --- | --- | --- |
| Same underlying failure, different course | about 65 % | First divergence, misdelivery to a learner, leadership leaving the seed, multi-minute stall of two priority ADDs and snapshot-lane failures (22/8/0 vs 21/9/0) are all in both runs. Spread at the bound was better here (5 of 6 by 388 s). |
| Regression from the integrated changes | about 20 % | `Named control-plane write wait expired` exists only at f580579a5; commit 160bf0e6c serialises one named-write delivery across callers, and four expiries occurred with a stable leader and a live link. Reads retained up to 54 s add load on peers that already miss deadlines. Neither is shown to cause d or g. |
| Host or run variance | about 15 % | Per-call cost of identical synchronous code: tv-dator 0.069 vs 0.063 ms; adam-laptop 0.106 vs 0.100 ms (unchanged, so the x2.06 reading is not visible in-container); adams-gamla 0.172 vs 0.129 ms (33 % slower). Which joiner wins the ledger election differs. |

What a second and third run must show:

- **Regression:** named-write expiries again while the ledger leader is stable and connections are up; CREATE refused with `ready_lease_expired` regardless of nodes-p1 timing; g failing with links connected.
- **Variance:** outcomes track the ledger winner and link behaviour; a run with the ledger on GAMLA and no connection duel passes d and g.
- **Same failure:** every run misses ACK bounds within about 45 s of seed start, moves the ledger off the seed within about 100 s, stalls two second-joiner ADDs for minutes, and misses spread at 420 s; d and g flip with ordering.

## 5. Earlier findings checked against this run

| Finding | Status | Evidence |
| --- | --- | --- |
| Seed event-loop starvation (p50 ~222 ms) | Absent at ≥ 1 s; **not determinable** below that | One startup gap; seed CPU 17–40 % after startup; no loop-delay series |
| Serialisation behind the ledger (`priority_operation_serial_wait`) | Absent as a signal | 0 occurrences; four other priority ADDs ran while the ledger had 2 of 3. Dependence on the ledger is present in another form (bootstrap wait, persist failures) |
| CDC lag making projection disagree | **Present** | g: 80 s on ADAM; `cdc_committed_acceptance_unknown` 173× on the seed. Coincides with the link outage rather than steady lag |
| ADD admission continuation gap (ADMITTED latch) | Absent in what was observed | Every observed `ADMITTED` reached `ACTIVE` within about 20 s; the stalled operations had `create_admission_state: null`. No snapshots 11:25:35–11:30:38 |
| Failed control-snapshot reads | **Present, unchanged** | 30 polls, same per-host split as before |

## 6. Next observation

One diagnostic run on the same commit and hosts with `LAGRANGE_LOOP_GAP_THRESHOLD_MS=100` on all three nodes (switch exists at `src/diagnostics/event-loop-gap-watchdog.js:40`), plus a 1 Hz host-to-host RTT and TCP-retransmit log on the three hosts for the run window.

Leading hypothesis: the first divergence is transport delivery deadlines missed between live, unsaturated processes, and everything after it follows from the ledger leaving the seed.

| Result during an inbound silence | Meaning | Owner |
| --- | --- | --- |
| No loop gap ≥ 100 ms on the silent peer, RTT in milliseconds | Confirms: queueing or ordering inside the transport | `message-router` outbound delivery |
| Loop gaps of 100–1000 ms aligned with the silences | Refutes: sub-second starvation on that node | The sync site the watchdog names |
| RTT spikes or retransmits aligned with the silences | Refutes: network path | Infrastructure (lab Wi-Fi) |

Secondary, same run: a seed-side log line at control-snapshot request receipt and completion would settle why the `snapshot` lane exceeds 15 s.
