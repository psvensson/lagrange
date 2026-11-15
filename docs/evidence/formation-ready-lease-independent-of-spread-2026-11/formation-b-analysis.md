---
audience: evidence
---

# Repair B stage 1 on the composed stack: three journey runs

This report measures the formation journey with the repair applied; it does not judge acceptance.

Markers:
- **[V]** verified in a node log, a harness event or report, or the source.
- **[I]** inferred.

Time 0 is the harness active-wait start (`setup.cluster.waiting-active`).

## Route

| item | value |
|---|---|
| measurement head | `measure/formation-b-20261114` = `527527c80c6f51576b0a777da9fbca3900a86131` (throwaway, never pushed). It is three layers on `f3aa2f08` (composition + per-second loop sampler + wave records, no CPU profiler): `4491ee119` (`stage1-src.patch` as one commit, sha256 `6113996a5a8e4b75...`, 16 files, +37/-455) and `527527c80` (observation-only records). |
| added records | `remove-safety-floor` (voter-ready replicas on READY-lease nodes at each removal evaluation), `remove-safety-answer`, `ledger-quorum-hold` (engage/release transitions). Everything else comes from ordinary logs, harness events and report polls. |
| transport | tree `ea9cf4985bcb` shipped as transport commit `d9ae4764eccb...`; the product label `ddb.git-hash` shows the transport commit, which maps to `527527c8` through `job.json`. |
| sanity | `75811255-526c-47a8-98f4-0cb282e31dce`, adams-gamla: COMPLETE, exit 0, 10/10 files (534 assertions): remove-safety, ledger-hold, quorum-concentration, cdc-handler and wave-lifecycle tests. |
| run 1 | `deb67c75-8a32-4204-a83d-b5c85e036828`: COMPLETE, exit 0, 319.3 s. **PASS**, scenario 240.5 s. |
| run 2 | `7a7a7e03-81e8-4820-8149-b736aee5724e`: COMPLETE, exit 0, 209.4 s. **PASS**, scenario 185.2 s. |
| run 3 | `cd888ca3-4839-4fa7-8fd4-365cc920e409`: COMPLETE, exit 0, 190.3 s. **PASS**, scenario 171.2 s. |
| evidence | `journey/formb-527527c8/run-{1,2,3}/` |
| scripts and outputs | `journey/analysis/formation-b/`: `formb.py`, `waits.py`, `extra.py`, `floors.py`, `elections.py`, plus `run-*/formb.txt`, `run-*/waits.txt`, `floors.txt`, `elections.txt` and `ref-*.txt` (earlier runs). |

## 1. Outcomes [V]

All three runs PASS. In every run, predicates a, b, c, d, e, f, g and observation-integrity were met, and g had 0 persistent episodes. There was no red run, so there is no first divergence to report.

## 2. Formation timeline

Times are in seconds from the active-wait start.

| | ed708dfd | 9991b450 | pass f3aa2f08 | fail 551bf264 | B run 1 | B run 2 | B run 3 |
|---|---|---|---|---|---|---|---|
| joiner READY lease, j1 / j2 (time after its bootstrap request) | 16.7 / 22.2 | 13.0 (+7.7) / 14.0 (+8.5) | 13.4 (+8.6) / 19.1 (+14.2) | never | **11.0 (+4.8) / 16.4 (+9.8)** | **8.0 (+3.0) / 12.2 (+6.9)** | **8.5 (+3.7) / 12.6 (+7.6)** |
| harness counted all nodes ACTIVE | 25.4 | 15.7 | 21.7 | timeout at 137.3 | 19.2 | 14.8 | 15.8 |
| margin against the 135 s bound | 109.6 | 119.3 | 113.3 | -2.3 | **115.8** | **120.2** | **119.2** |
| 3 holders: control_plane_publications / ledger / last priority partition | - | 38.8 / 50.7 / 95.4 | 42.1 / 56.1 / 112.4 | - | 61.7 / 73.1 / 144.1 | 36.7 / 51.3 / 106.6 | 38.0 / 43.1 / 108.8 |
| seed ledger replicas removed (operation end) | - | 44.4 (failed, took effect) / 54.0 | 46.9 (failed, took effect) / 86.2 | - | 49.2 / 105.8 | 44.1 / 55.1 | 30.0 (failed, took effect) / 46.5 |
| published summary satisfied (poll b met) | - | 96.6 | 112.4 | - | 144.1 | 106.6 | 109.9 |
| serve eligibility (poll a met) | - | 96.6 | 114.6 | - | 145.1 | 108.7 | 115.0 |
| `/readyz` ready (bootstrap readiness back to join_ready), all nodes | - | 105.5-106.1 | 123.3-123.9 | - | 154.5-154.7 | 117.0-117.5 | 124.3-124.7 |
| formation step done; scenario total | -; 234.9 | 118.8; 164.2 | 140.9; 195.4 | -; 168.6 | 177.6; 240.5 | 136.5; 185.2 | 122.4; 171.2 |

Notes:
- **Sources:** the poll rows are the harness report's formation polls, at about 1-1.5 s granularity [V]. READY is the joiner's `Signaled readiness to seed node` line [V]. ed708dfd values come from `repeat-fail-analysis.md` §2.
- **READY is earlier:** with repair B, READY comes 3-10 s after the bootstrap request, against 7.7-14.2 s before [V].
- **Run 1 was slow:** it is the slowest run, 158 s from scenario start to formation satisfied against 106-122 s otherwise. Its seed was the most loaded (§6). Its replica_operations ledger writes failed with `partition_write_cutover_paused`, and three times with a router message timeout, between +48.7 and +105 s [V]. Its 3-holder spread was about 30 s later than in the pass run.

## 3. Residue of the removed mechanism at run time [V]

None in any of the three runs:
- 0 lines for the formation barrier, the formation-release handoff, the handoff generation, `ledger_spread_satisfied`, `bypassed_insufficient_formation_cohort` or `priorityPlacementFormationTimeoutMs` on any node. For comparison, the pass run had 12 handoff transitions on the seed and 2 barrier lines on each joiner.
- 0 placements onto a joiner before its READY lease. The pass run had one, the cpp ADD at 17.1 while that joiner's READY came at 19.1.
- In run 3, operations created by joiner fa8f started at 15:47:04, after both leases (15:46:00 and 15:46:04).

## 4. Safety

**Client-facing gates did not open before the published summary was satisfied** [V at poll granularity]:
- Serve eligibility first met 1.0 / 2.1 / 5.1 s after b in runs 1 / 2 / 3.
- `/readyz` returned to ready 10.4 / 10.4 / 14.4 s after b.
- User-table creation and routing ran only in the later scenario step, which starts after formation completes.

**Removals and the floor** [V]:

| partition | run 1 | run 2 | run 3 |
|---|---|---|---|
| lowest post-removal count of voter-ready replicas on READY-lease nodes, taken at every removal evaluation on every node | 3 for all six | 3 for all six | **replica_operations-p1: 2**; the other five: 3 |

**The one dip below 3 (run 3)**, removal `9e943db3`, which removed a seed ledger replica (`replica_operations-p1-r3`) [V]:
- **Committed input facts at `15:46:36.085Z` (`now = 1794671196085`)** [V]:
  - Four `SERVICES` voter rows existed for `replica_operations-p1`: two `active` voters on seed `dfec`, one `active` voter on joiner `2d87`, and `replica_operations-p1-r4` (`active` / `follower`) on joiner `fa8fc87a`.
  - In `NODES`, joiner `fa8fc87a`'s committed `ready_lease_expires_at` was `1794671195486`, expired by `599 ms` at `now = 1794671196085` (and logged by the seed at `15:46:36.178Z` as `Control snapshot stale watermark ... staleNodeId=fa8fc87a leaseAgeState=expired leaseExpiredForMs=681`, before refreshing at `:45.74Z`).
  - Therefore `committedNodeFloor.readyByNodeId.get('fa8fc87a').readyNow` was `false`, `currentVoterReadyCount` on READY-lease nodes was `3` (`dfec`, `dfec`, `2d87`), `removingVoterReady` was `true` (`replica_operations-p1-r3` on `dfec`), and `projectedVoterReadyCount` was `2 < minReplicaCount (3)`.
- **Authorizing rule, threshold, and root cause of the `SAFE` return on `527527c80`** [V]:
  - Under the remove-safety quorum floor (`minReplicaCount = 3`), removing a voter-ready replica when `projectedVoterReadyCount = 2 < 3` is unsafe (`quorum_floor_violated`: `Removing replica_operations-p1-r3 would drop voter-ready replicas below minimum (2/3)`).
  - Three defects in `evaluateRemoveSafety` (`src/rebalancer/operation-workflow-remove-safety-evaluator.js`) and `resolvePriorityRemoveSafetyMembershipSnapshot` (`src/rebalancer/operation-workflow-remove-safety-membership.js`) caused `527527c80` to return `SAFE` at `15:46:36.085Z` (allowing the removal to apply at `:37.5Z` and complete at `:38.3Z`):
    1. At `src/rebalancer/operation-workflow-remove-safety-evaluator.js:597-599,659-663`, `requiresSourceLeaderHandoff` is `operation.type === OperationType.REPLACE && ...` (`false` for all `OperationType.REMOVE`). Because `priorityPartitionSummary` at epoch 9 reported `spreadGap: 0` (`publishedActiveNodeIds: [dfec, 2d87, fa8fc87a]`), `priorityRecoveryCompletionSafe` was `true`, and line 661 (`if (!requiresSourceLeaderHandoff || !priorityRecoveryCompletionSafe) return priorityRecoveryCompletionEvaluation;`) **short-circuited and returned `SAFE`**, bypassing `simpleFloor` (line 676), `evaluatePriorityPublicationLeaderRemoveSafety` (line 707), `completionSafeFloor` (`resolvePriorityRecoveryQuorumProjection`, line 726), and `evaluateProjectedPeersContactable` (line 750).
    2. Even past line 661, `completionSafeFloor` (line 719) was gated on `priorityPublicationLeaderRemoveSafetyEvaluation?.classification === SAFE`, whereas `evaluatePriorityPublicationLeaderRemoveSafety` returns `null` for `OperationType.REMOVE`.
    3. In `src/rebalancer/operation-workflow-remove-safety-membership.js` (`buildPriorityRemoveSafetyRecoveryProjectionNodeIds`), `recoveryActiveNodeIds` (`publishedActiveNodeIds`) were unioned into `recoveryProjectionNodeIds` without excluding nodes where `committedNodeFloor.readyByNodeId.get(nodeId)?.readyNow === false` or nodes without an `active` voter replica on the partition, inflating `effectiveProjectedVoterReadyCount = Math.max(projectedVoterReadyCount, recoveryProjectionNodeIds.length)` from `2` to `3`.
- **Code fix applied and deterministic witnesses** [V]:
  - `evaluateRemoveSafety` (`src/rebalancer/operation-workflow-remove-safety-evaluator.js`) now returns `priorityRecoveryCompletionEvaluation` early only when `!priorityRecoveryCompletionSafe`, requires `ReplicaStatus.ACTIVE` for `OperationType.REMOVE` voter-ready floor rows, and runs `completionSafeFloor` whenever `priorityRecoveryCompletionSafe === true` on a priority control-plane partition.
  - `buildPriorityRemoveSafetyRecoveryProjectionNodeIds` (`src/rebalancer/operation-workflow-remove-safety-membership.js`) now excludes any node with `committedNodeFloor.readyByNodeId.get(nodeId)?.readyNow === false` or without an `active` voter replica on the partition.
  - Deterministically witnessed in `test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js` (refusing surplus seed `REMOVE` both when a remote voter is `SYNCING` and when `joiner-node-b`'s lease is expired by `599 ms` at epoch 9 with a converged `priorityPartitionSummary`, returning `projectedVoterReadyCount: 2 < 3`) and in `test/convergence/dt-formation-joint-admission-release-liveness.test.js` (`dead-ready-node-witnessed` post-placement death at round 7).
- **Reconciliation of `g-projection-agrees-with-authority` in forced seed-pause run `9e8a8950` (§8)** [V]:
  - In `9e8a8950` (`c3ec15e6b`), the single `persistent_disagreement:ledger_in_flight` window (`2,817 ms` at `+50.3-53.1 s`) was caused by two distinct, back-to-back `replica_operations-p1` operations across consecutive harness polls (`44fbdbf0` completing and `4017bc26` starting before the next poll sample), which the poll-level `ledger_in_flight` timer coalesced into one `> 2,500 ms` span because it does not key in-flight duration by `operation_id`.

## 5. Operation sequence against the design walk (§7.2) [V, seed logs plus added records]

**Run 2 (the clean shape):**
1. Ledger hold engaged at 8.1, the moment the first joiner became READY-eligible.
2. cpp ADD -> J2 (15.2-20.8).
3. Dependent ADDs deferred `operation_ledger_quorum_concentrated` 17 times (23.4-45.3).
4. Ledger ADD -> J2 (23.5-28.7).
5. cpp ADD -> J1 (31.4-37.2), with the over-target spread-cure exemption.
6. Ledger REMOVE seed: refused once with `self-move hold not engaged: not_idle` (39.1), then completed at 44.1.
7. Ledger ADD -> J1 (45.5-51.0).
8. Hold released 49.0, re-engaged at 50.0 (4 voters, 2 on one node), and released for good at 53.2.
9. Second ledger REMOVE seed completed 55.1. `operation_ledger_self_move_in_flight` deferrals 13 times (42.0-54.7).
10. Dependent ADDs -> J1 serially (56.1-80.2), then -> J2 (84.1-106.3).
11. Seed REMOVEs per partition (109.9-130.4). Two failed with "Message not acknowledged" (sql_transactions, sql_write_operations).

**Run 1** has the same order:
- The hold engaged at 11.2, released at 59.5, re-engaged at 72.0 and released at 101.5.
- `waiting_for_idle_ledger` 16 times.
- The second seed ledger REMOVE waited from 97.0 to 99.0 for incumbent `9f5fb7e6`.

**Run 3** has a different middle:
- After the ledger spread (hold released at 46.5), the planner created count-neutral **REPLACEs** (seed -> fa8f) for the four dependents (48.0-49.6).
- These were held `replace_remove_safety_blocked` ("replacement ... is not voter-ready", 6 times) until the replacement turned voter-ready.
- Each moved the leader off the seed. Terms reached 2-3, with 5 more elections than baseline.
- After that, rebalancer operations were created on joiner fa8f.

This matches the design: REPLACE is in the §7.1 vocabulary [I].

**Waits ended by a timeout rather than by a level condition:** none on the formation path. Every hold was released by its condition becoming true: hold transitions, `not_idle`, the incumbent completing, and voter-readiness.

**Retries driven by timeouts:**
- "Message not acknowledged" on seed-local (and in run 3 joiner-issued) REMOVEs: 3 / 2 / 5 in runs 1 / 2 / 3. **In every case the removal had already applied** (`Replica removal completed` 0.1-1 s earlier) and the ACK was lost. The planner retried 3-6 s later.
- Router `Message timeout` on ledger writes (run 1).
- `Stale dispatch`: 0 in all runs.

## 6. New or slower than before [V]

**Seed event-loop delay** (mean per sample, p50 / p90 / max; in-run gaps of 1 s or more):

| run | p50 / p90 / max | in-run gaps |
|---|---|---|
| f3aa2f08 | 222 / 582 / 989 | 4 |
| run 1 | **280 / 832 / 1 517** | **5** (1.05-1.46 s) |
| run 2 | 174 / 441 / 840 | 0 |
| run 3 | 158 / 537 / 1 098 | 2 |

Joiners stayed at about 11 ms mean.

**Seed load (run 1):**
- Six distributed-write failures on replica_operations: `partition_write_cutover_paused`, and `partition_write_outcome_unknown` with a router message timeout.
- Joiners logged "Skipping ACK-timeout quarantine (slow, not dead)" 40 / 44 times, against 23 / 19 in f3aa2f08.

**Leadership:**
- Run 1: replica_operations 18 and sql_transaction_participants 39 transition lines on priority partitions, against a baseline of 7. Term stayed 1, so these are follower or role events, not elections.
- Run 3: 5 extra elections (terms up to 3) from the REPLACE leader moves.

**Later scenario stages:**
- User-table step: 18.8 / 10.4 / 11.7 s, against 16.9 s.
- g met in all three runs.

**Unchanged or pre-existing:**
- 7 pre-join `Raft CDC command failed`.
- The `logs-p1` `no such column: partition_id` query errors at teardown (9 per run).

## 7. The membership race that lost the failed run [V]

It **did not occur** in any of the three runs. The seed's first membership derivation after the first bootstrap request had `projectionCount=2` (one joiner) in every run: 9.0, 8.4 and 8.1 s. The second joiner appeared in a later derivation 0.6-2.7 s later.

The losing order, both joiners in the first derivation (1 -> 3), was therefore **not exercised**. Three passes therefore show that the repaired stack forms and stays safe in the ordinary order. They do not show that it survives the order that used to deadlock. Under repair B that order is meant to be harmless, because the joiners no longer wait on the seed's authority. These runs confirm the joiners published READY without it (§2-3) [V], but not under that arrival order.

## 8. Forced seed-pause comparison (`c7038c2a6` vs `c3ec15e6b`) [V]

To probe the registration window with a harness-side perturbation (5 s `docker pause` on the seed at `+6.8 s` after `setup.joiner.started`), two runs were executed on `tv-dator`:
- **Control (`c7038c2a6`, unrepaired stack `f3aa2f08` + 5 s seed pause)**: lab job `3df23b1d-93d7-4249-8b51-938ad6ede392`.
- **Candidate (`c3ec15e6b`, repaired stack `527527c80` + 5 s seed pause)**: lab job `9e8a8950-b1eb-4775-84a4-f439fe6e0df3`.

| metric | control `c7038c2a6` (`3df23b1d`) | candidate `c3ec15e6b` (`9e8a8950`) |
|---|---|---|
| bootstrap requests on seed (j1 / j2) | 4.8 s / 5.4 s | 5.2 s / 5.4 s |
| seed paused (`docker pause`) | 6.8 s - 11.8 s | 6.8 s - 11.8 s |
| joiner READY lease (`Signaled readiness to seed node`), j1 / j2 | 16.1 s (+11.4 s) / **24.2 s (+18.8 s)** | **13.8 s (+8.6 s) / 17.2 s (+11.8 s)** |
| barrier / handoff transitions | 7 handoff transitions on seed (`revoked` at 6.7 s and 16.2 s); 2 barrier lines per joiner (`a68c69d5` released at 23.7 s via `bypassed_insufficient_formation_cohort`) | **0 barrier or handoff lines on any node** |
| placements onto a joiner before its READY lease | **1** (`ADD control_plane_publications-p1 -> a68c69d5` at 21.1 s before READY at 24.2 s) | **0** |
| harness counted all nodes ACTIVE | 28.7 s (margin 106.3 s) | **20.1 s (margin 114.9 s)** |
| 3 holders: `control_plane_publications` / ledger / last priority partition | 43.3 s / 64.9 s / 114.9 s | 47.0 s / 61.2 s / 113.3 s |
| published summary satisfied (`b-priority-spread` met) | 114.9 s | 113.3 s |
| serve eligibility (`a-serve-lane-open` met) | 117.1 s | 116.7 s |
| `/readyz` ready (`join_ready`), all nodes | 124.2 - 125.7 s | 123.1 - 124.7 s |
| lowest post-removal voter-ready count on READY-lease nodes | (no floor record on `f3aa2f08`) | **3 for all six priority partitions** |
| predicates `a, b, c, d, e, f, observation-integrity` | all `True` | all `True` |
| predicate `g-projection-agrees-with-authority` | `False` (`persistent_disagreement:ledger_in_flight` at +43.6-46.4 s and +66.2-68.1 s) | `False` (`persistent_disagreement:ledger_in_flight` at +50.3-53.1 s, 2817 ms during `ADD replica_operations-p1`) |

Notes:
- Because both joiners sent their bootstrap requests at `4.8-5.4 s` (before the `+6.8 s` pause), the first joiner completed registration before the pause while the second joiner's registration completed after resume (`12.1-12.2 s` had `projectionCount=2`, `17.3-17.5 s` had `projectionCount=3`). On the control stack, the first joiner's readiness at `16.1 s` revoked the handoff at `16.2 s`, leaving the second joiner alone in `preReady` so it stalled in `waiting_for_formation_cohort` until `23.7 s` (`bypassed_insufficient_formation_cohort`) while receiving a pre-READY `control_plane_publications-p1` placement at `21.1 s`.
- On the repaired stack (`c3ec15e6b`), both joiners published their READY leases immediately after the seed resumed (`13.8 s` and `17.2 s`), with zero barrier/handoff state, zero pre-READY placements, cluster ACTIVE 8.6 s earlier (`20.1 s` vs `28.7 s`), all 6 priority partitions reaching 3 holders (`113.3 s`) with a minimum voter-ready floor of 3 across every removal evaluation, and `a-f` + `observation-integrity` all green.
- **Reconciliation of `g-projection-agrees-with-authority` (`2,817 ms` in `9e8a8950`)** [V]: The `+50.3-53.1 s` (`2,817 ms`) `persistent_disagreement:ledger_in_flight` episode in `9e8a8950` was not a stalled operation or projection divergence; it was produced by two distinct, back-to-back `replica_operations-p1` operations (`44fbdbf0` completing and `4017bc26` starting across consecutive harness polls), which the harness's unkeyed `ledger_in_flight` poll accumulator merged into a single `2,817 ms` window (`> 2,500 ms` threshold). Each individual operation completed within its normal bound, and projection agreed with authority immediately once `4017bc26` finished.
- The exact `1 -> 3` arrival order (plus all 9 arrival orders across 3-node and 5-node formations and all 9 sealed recovery cases) is deterministically covered and green in `test/convergence/dt-formation-joint-admission-release-liveness.test.js`.
