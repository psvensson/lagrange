# Repeat-run failure on 551bf264: first divergence

This is a read-only analysis of four runs of `fresh-formation-user-table-routability`. It changes no code.

**Markers**
- **[V-log]** means verified in a node log or harness event.
- **[V-code]** means verified in the source of `551bf2643` (worktree `lagrange-cdc-slot-removal-20261114`).
- **[I]** means inferred.

**Runs**
- **fail**: `repeat-551bf264/run-1`, job 0bc41a40, candidate 551bf264, no diagnostics. Seed `621932d0`, joiners `a6577360` and `10f1932b`.
- **pass**: `measure-slot-f3aa2f08`, the same source plus diagnostics. Seed `70808e06`, joiners `84ee7b06` and `96203c04`.
- **9991**: `measure-9991b450`, with the slot still present. Seed `df007a99`, joiners `77047968` and `cffe6937`.
- **ed708**: `tv-diagnostic-retained-ed708dfd`. Seed `c8e98a4c`, joiners `a03861d2` and `de5a0bc4`.

**Scripts and outputs** are in `journey/analysis/repeat-fail/`:
- `stages.py`, `timeline.py`, `census.py`, `epochs.py`, `epochfirst.py`, `refusals.py`, `rate.py`
- `census-fail-pass.txt`, `census-earlier.txt`
- Decompressed failed-run logs are in `logs/fail/`.

## Summary

The joiners did not run slowly. They were deadlocked.

1. Each joiner stops at the **operation-ledger formation barrier**. It waits for a startup authority that is either READY or carries a release-authorized formation-release handoff for that node.
2. In every run, the seed's first handoff generation (epoch 1) is revoked about 1 s after it is captured, with reason `startup_authority_incompatible`.
3. In the three good runs, the seed captures a **new** generation at epoch 3. This happens in a window of about 1.1–1.5 s, after the membership publication has added **one** joiner and before the second joiner makes the authority "priority spread pending".
4. In the failed run, the seed's first membership derivation after the join came about 1 s later than in the good runs. It already contained **both** joiners (projection went 1 → 3 at once). The authority went `recovery_pending` before any epoch > 1 existed with the authority READY.
5. No generation could be captured after that. The barrier waited until its 120 s timeout, and the harness's 135 s deadline expired 4 s later.

This is a timing race in pre-existing formation machinery. The logs show no link to range shipping or slot removal, but I cannot exclude that the candidate changes the seed's latencies.

## 1. The failing check

- **Where it is raised:** `Cluster._waitForAllActive` in `test/distributed/harness/cluster-class-layer.js:888-899` raises `'Not all nodes reached ' + ACTIVE_STATE + ' state within ' + timeout + 'ms'`. It is called from `StartupGate.waitForClusterActive` (`cluster-startup-gate-layer.js:108`). [V-code; stack trace in the report]
- **The bound:** `_resolveActiveWaitTimeoutMs` (`cluster-class-control-snapshot-recovery.js:1363`) computes `timeouts.convergence` + 25 % per node beyond 1, which is 90 000 + 2 × 22 500 = **135 000 ms**. [V-code: `local-three-node.json` convergence 90000; `ACTIVE_WAIT_MIN_CLUSTER_SIZE=1`; `…SCALE_PERCENT_PER_EXTRA_NODE=25`]
  - The clock starts on entry to the wait, which is stage `setup.cluster.waiting-active`.
  - In the failed run that was +28.664 s after scenario start (12:30:56.722Z). Both joiner containers had just started; the seed had been join-ready since +28.4 s. [V-log events.ndjson]
  - Polling interval is 1 s. Attempts were 87 and elapsed time was 137 267 ms. The startup deadline-extension hooks did not extend it. [V-log]
- **What is polled:** `_probeClusterActiveState` (`cluster-class-publication-evidence.js:308`).
  - **Per node:** active = the bootstrap-readiness probe returns 2xx **and** `getReachabilityDiagnostics().adminReady === true` (admin API on port 8081).
  - **Whole cluster:** `allActive` = every node active **and** snapshot coverage complete (or partial-coverage converged) **and** `admitsPublicationConvergence(gate)`.
  - `snapshotCoverage=3/3@seed` means the seed's control snapshot listed all 3 nodes. That part was satisfied throughout. [V-code, V-log]
- **What kept the joiners inactive:** every sample from attempt 20 to 87 says `admin_not_ready=Admin API query failed … connect ECONNREFUSED 172.18.0.3:8081` (and `.4:8081`). Neither joiner ever started its admin API. [V-log events.ndjson]
- **Joiner stages, in order, with the log line that marks each** (from the passing joiners) [V-log]:
  1. `Distributed Database System starting`
  2. lifecycle `starting→connecting` (phases `contacting_seed`, `connecting_websocket`)
  3. `connecting→discovering` (`creating_message_group`, `waiting_leadership`)
  4. `PG wire startup gate passed`
  5. `discovering→joining`
  6. `joining→ready` (lifecycle), followed by phase `querying_state` (`Skipping blocking join backfill…`)
  7. phase `joining:readiness-convergence`, ending with `CDC subscriptions confirmed active before readiness advertisement`
  8. the local-query-transport and metadata-publication gates (no line on success)
  9. **`Join priority-placement formation barrier`**, which must release as `ledger_spread_satisfied` or `bypassed_insufficient_formation_cohort`
  10. `Signaled readiness to seed node` (the READY lease heartbeat)
  11. `Control plane background writers activated for joining node`
  12. `Admin WebSocket API started` / `Admin runtime started`
  13. The harness then sees `adminReady` and counts the node as active.

  The ready-signal sequence is in `node-joining-ready-signal-readiness.js` (around line 380-500). The barrier is in `node-joining-operation-ledger-formation-readiness.js`. [V-code]

## 2. Stage timeline for the four runs

All times are seconds from the start of the active wait. "b-req" is the first bootstrap request seen on the seed.

| stage | fail 551bf264 | pass f3aa2f08 | 9991b450 | ed708dfd |
|---|---|---|---|---|
| seed join_ready | −2.3 | −2.8 | −2.4 | −3.1 |
| joiner process start (j1 / j2) | 5.4 / 5.5 | 4.7 / 4.8 | 5.2 / 5.5 | 5.7 / 6.2 |
| lifecycle ready (j1 / j2) | 6.0 / 6.3 | 5.3 / 5.6 | 5.9 / 6.2 | 6.5 / 7.2 |
| querying_state done (j1 / j2) | 7.5 / 11.8 | 6.7 / 11.7 | 7.5 / 11.2 | 8.1 / 12.9 |
| CDC gate passed (j1 / j2) | 8.5 / 12.4 | 7.8 / 12.3 | 8.3 / 11.6 | 8.7 / 13.8 |
| seed: handoff gen-1 captured (epoch 1) | 6.3 | 5.4 | 6.1 | 6.8 |
| seed: gen-1 revoked `startup_authority_incompatible` | 7.1 | 6.6 | 6.8 | 7.9 |
| seed: first membership derivation after join (projection count) | **9.4 (1→3)** | 7.6 (1→2) | 7.8 (1→2) | 8.8 (1→2) |
| seed: gen-2 captured at epoch 3, authority READY | **never** | 8.1 | 8.1 | 9.4 |
| seed: bootstrap readiness → degraded (priority spread pending) | 9.7 | 9.6 | 9.3 | 10.5 |
| barrier first state (j1 / j2) | 8.7 cohort / 13.1 **authority** | 8.0 cohort / 15.2 cohort | 8.4 cohort / 13.1 satisfied | 8.9 cohort / 17.3 authority |
| barrier released (j1 / j2) | **never** (timeout 130.2 / 133.5) | 12.6 satisfied / 18.8 bypassed | 12.8 / 13.1 satisfied | 16.4 / 21.5 satisfied |
| Signaled readiness (j1 / j2) | never | 13.4 / 19.1 | 13.0 / 14.0 | 16.7 / 22.2 |
| Admin runtime started, i.e. ACTIVE-capable (j1 / j2) | never | 14.2 / 20.1 | 13.8 / 14.7 | 17.5 / 22.9 |
| harness active gate passed | timed out at 137.3 | 21.7 | 15.7 | 25.4 |

Notes on the table:
- All rows are [V-log]. Sources: `timeline.py`; handoff, derivation and degraded rows from seed log lines; gate rows from events.ndjson; ed708's from the report's `activeGate.elapsedMs=25434`.
- **Margin:** the bound is met by a wide margin when formation works: 110–119 s spare (15.7–25.4 s of 135 s). The failed run was not slow; it never released.

## 3. First divergence, quoted

Everything up to the CDC gate matches the good runs within about 1 s [V-log, table].

**The first divergence is on the seed, before the joiners stall.**

```
seed 621932d0 (fail)
12:31:02.190 Received bootstrap request                      (+0.00, a6577360)
12:31:02.980 Formation release handoff … state=active  epoch 1 cohort [a6577360] observedAuthorityReady=true
12:31:03.801 Formation release handoff … state=revoked reason=startup_authority_incompatible observedAuthorityReady=null
12:31:06.158 MEMBERSHIP_SWIM_DIVERGENCE onlyInProjection=[10f1932b,a6577360] projectionCount=3 shadowCount=1
12:31:06.391 Bootstrap readiness state transitioned join_ready→degraded reasons=[PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]
12:31:09.705 convergence decision trace decision=skip reason=reconcile-in-flight
12:31:11.791 convergence decision trace decision=drive outcome=reconcile-committed publicationEpoch=1 expectedNodeCount=2
12:31:15.127 convergence decision trace decision=drive publicationEpoch=2 expectedNodeCount=3
(no further "Formation release handoff authority transition" for the rest of the run)
```

```
seed 70808e06 (pass)
12:12:42.704 Received bootstrap request
12:12:43.357 handoff active epoch 1 cohort [84ee7b06]
12:12:44.500 handoff revoked startup_authority_incompatible
12:12:45.505 MEMBERSHIP_SWIM_DIVERGENCE onlyInProjection=[84ee7b06] projectionCount=2
12:12:45.769 convergence decision trace drive reconcile-committed epoch 1
12:12:46.017 handoff active epoch 3 (captured) observedAuthorityReady=true cohort [84ee7b06]
12:12:46.657 MEMBERSHIP_SWIM_DIVERGENCE onlyInProjection=[96203c04] projectionCount=2
12:12:46.951 handoff active epoch 4 observedAuthorityReady=false [priority_partitions_not_spread]  ← retained
12:12:47.508 Bootstrap readiness → degraded
12:12:51.447 handoff complete; 12:12:51.454 successor generation for [96203c04] (completed_generation admission)
```

9991 and ed708 have the same shape as the pass run [V-log]:
- 9991: revoke 27.075, projection 2 at 28.102, epoch-3 capture 28.394, degraded 29.532.
- ed708: revoke 07.744, projection 2 at 08.621, epoch-3 capture 09.263, degraded 10.369.

**What the joiner waited for.** Joiner `a6577360` at 12:31:07.354 [V-log]:

```
Join priority-placement formation barrier state=waiting_for_startup_authority candidateNodeCount=3 preReadyCandidateNodeCount=2
startupAuthorityState=recovery_pending startupAuthorityReady=false startupAuthorityRecoveryReasonCodes=[priority_partitions_not_spread]
formationReleaseHandoffState=null … timeoutRemainingMs=118340
```

The pass joiner `84ee7b06` at 12:12:50.543 released `ledger_spread_satisfied` with the authority in the same not-spread state. What differed is `formationReleaseHandoffState=active, ReleaseAuthorized=true, RequiredCohort=[84ee7b06]`. [V-log]

**Mechanism** [V-code `formation-release-handoff-closure-owner.js`]:
- `captureAdmitted()` needs one of two things:
  - `authority.ready===true` with priority spread satisfied, or
  - the `COMPLETED_GENERATION` successor admission.
- `revoke()` closes the successor admission. So after the revoke, a new generation can only be captured while the authority is READY and spread-satisfied.
- `captureGeneration()` also refuses a cohort equal to the revoked generation's cohort at an epoch ≤ the revoked one (`terminalGeneration` check).
- **Consequence:** recapture needs (a) a publication epoch > 1 and (b) the authority still READY. Condition (b) holds only while the membership projection contains at most one joiner.
  - In the failed run the projection jumped to 3 at 06.158, 0.23 s before `degraded`, so (b) ended before (a) could happen. [V-log for the ordering; I for the exact capture refusal, because the closure owner logs only transitions, not refused captures]

**Why the derivation came late** [I]:
- The owner-membership driver ticks every 5 s (`OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS=5000`, [V-code]). The fail ticks were at about 59.43, 04.43, 09.43, 14.43.
- The 04.43 tick reached its membership derivation (the `MEMBERSHIP_SWIM_DIVERGENCE` line is emitted inside `deriveClusterMembershipCandidate`, [V-code]) only at 06.158, about 1.7 s later. That tick then stayed in flight until 11.791 (the 09.705 tick was skipped as `reconcile-in-flight`).
- Measured from b-req, the first derivation came at:
  - fail **+3.97 s**
  - pass +2.80 s
  - 9991 +2.54 s
  - ed708 +2.96 s
- The second joiner became eligible at about the same time in every run:
  - fail ≤ +3.97
  - pass +3.95
  - 9991 +3.59
  - ed708 +4.45
- So the race is the seed's first derivation versus the second joiner becoming eligible. It is lost by about 1 s.
- The seed's pre-derivation latency was 1.7 s in fail and 1.83 s in ed708 (slot era), against 0.17–0.37 s in pass and 9991. ed708 still won because its tick came earlier (+1.13 s after b-req, against +2.24 s in fail).

**What the seed was doing during 04.4–11.8** [V-log]:
- 5–20 log lines per second.
- 0 CDC row fetches from +4 to +8 s.
- No event-loop gap.
- One `Retrying CDC propagation delivery failures` for `control_plane_publications` UPSERT at 04.375. The pass run has the same line at the same relative time (+2.4 s).
- Joiner `a6577360` logged `Skipping ACK-timeout quarantine … (slow, not dead)` toward the seed's `control_plane_publications-p1-r1/r2` at 06.837, 07.334 and 07.860.
- The ordinary log does not name what the reconcile awaited. The pattern (quiet seed, slow ACKs from one partition) fits waiting on a request rather than CPU starvation. [I]

## 4. Stuck, not slow

- **Joiners stuck from +10.6 s and +13.1 s until the barrier timeout.**
  - Every 5 s `still waiting` line has the same evidence: `recovery_pending`, no handoff, membership epoch 2 → 3 by 12:31:22.
  - Both then logged: `wait_bound_spent priorityPlacementFormationTimeoutMs boundMs=120000` at 12:33:06.962 and 12:33:10.247, `Joining phase failed … Timed out waiting for operation-ledger formation spread before publishing the node ready lease`, and a retry (attempt 1/4, retryAfterMs 250). The barrier re-entered and was still waiting at 12:33:41.
  - The harness had given up at 12:33:14. Its own progress tracker reports `lastMeaningfulProgressAttempt=9 (12.3 s)` and `attemptsSinceProgress=78`. [V-log]
- **The seed side was also stuck.** The other way out, the priority partitions actually spreading, was circular:
  - The planner logged `Waiting for transitional cluster membership to settle … blockerReason=node_ready_lease_incomplete unreadyNodeIds=[a6577360,10f1932b]` 68 times, up to 12:33:16. [V-log]
  - The joiners withhold the READY lease until the authority is ready, and the authority waits for spread that the planner will not schedule until the leases exist.
  - Some placement did happen before the planner blocked:
    - `control_plane_publications` reached 3 nodes.
    - The `schema_operations` and `sql_transactions` ADDs to `a6577360` completed (12:31:29, 12:31:33).
    - The `replica_operations` REPLACE parked on `replace_remove_safety_blocked` from 12:31:55.
    - Two ADDs (`sql_transaction_participants`, `sql_write_operations`) were refused: `Operation blocked by safety policy … Stale dispatch for published membership epoch 2; current epoch is 3` (12:31:18.257, 12:31:25.562). They were never re-created. [V-log]
- **The wakes that should have fired, and why they could not:**
  - **The handoff recapture:** admission was closed by the revoke and the authority never READY again. [V-code + V-log]
  - **The barrier timeout:** it fired, but at 120 s plus join time, which is 130–133 s into a 135 s harness window, and it only restarts the same wait. [V-log]

## 5. Attribution: is it the candidate?

**Verdict: pre-existing and merely exposed (a timing race). The candidate's influence on the race timing is "cannot tell" from the ordinary logs.**

**What supports "pre-existing":**
- The revoke of gen-1 at 0.6–1.6 s after capture, with `startup_authority_incompatible` and `observedAuthorityReady=null`, occurs in **all four runs**, including ed708 and 9991, which were built before the slot was removed. [V-log]
- Formation in every good run depends on an epoch-3 recapture inside a 1.1–1.5 s window. [V-log]
- ed708 (slot present, no range shipping) had the same slow pre-derivation step (1.83 s) and the same in-flight reconcile shape. [V-log]
- The deciding steps are seed-local control-plane planning (membership derivation, publication epoch, authority state). The joiners' CDC receipt plays no part in them. [V-code for where the derivation runs; I for "no CDC dependency"]

**What I checked for a CDC connection, failed run against pass:**
- **Startup CDC failures:** 7 `Raft CDC command failed` and 7 `Out-of-order CDC event`, all at 12:30:54.13–.14 on `partitions` … `config`. This is pre-join and identical to pass (7/7). Earlier slot runs had 1. This is the slot-removal signature, but it is 8 s before the join and harmless in pass. [V-log]
- **Propagation retries:** 1 `Retrying CDC propagation delivery failures` (cpp UPSERT, retry delay 50 ms) in fail; pass had 2, one of them the same event at the same relative time. [V-log]
- **Joiner catch-up hydration:** completed at 12:31:07.928 and 07.949, against 12:12:48.890 in pass, at the same relative time. Lines containing "hydrated": 7 on `a6577360` against 1 on `84ee7b06`. I did not break these down. [V-log]
- **Joiner catch-up read failures:** 63–67 lines, all at teardown, after the seed stopped at 12:33:21 (`Connection to node 621932d0 closed`). They are not a cause. [V-log]
- **CDC subscription gate:** passed at the same relative time as in the good runs. [V-log]
- **Not observable in the failed run,** because it has no diagnostics:
  - wave concurrency, wave durations, typed backpressure and lane windows
  - commit-to-receipt latency for `nodes`, `node_endpoints`, `services`, `replica_operations`, `control_plane_publications`
  - slow-start window size
- **What remains open:** the 1.7 s from driver tick to derivation, and the 7.4 s reconcile, are on the seed. If that time was spent waiting on a `control_plane_publications` write or read that rides the CDC durable-delivery path, concurrent waves could lengthen it. The ordinary logs cannot show this. ed708 shows a comparable delay without the candidate. [I]

## 6. Seed load and host

| marker (seed / joiners) | fail | pass | 9991 | ed708 |
|---|---|---|---|---|
| Event loop gap ≥ 1 s (seed) | 1 (startup −20.9 s, 2418 ms, ELU 0.82) | 5 (startup 2050 ms; then 1107/1038/1007/1094 at +10.8/42.8/75.9/81.8) | 1 (startup 2013 ms) | 2 (startup 2515; +105.6 s 1381 ms) |
| `Message not acknowledged` (seed) | **0** | 8 | 6 | 2 |
| `Operation failed` (seed) | 0 (2 "blocked by safety policy") | 4 | 4 | 2 |
| "slow, not dead" (j1 / j2) | 10 / 14 | 23 / 19 | 1 / 1 | 16 / 2 |
| Raft election lines (seed) | 138 | 138 | 138 | 138 |
| joiner elections | 4 / 1 | 6 / 6 | 6 / 6 | 6 / 6 |

All rows are [V-log] (`census*.txt`, `grep -c`).

- **Leadership moves:** none unexpected. All 138 seed lines are the startup self-elections. Joiner leadership transitions follow replica placement (cpp, schema_operations, sql_transactions, replica_operations onto `a6577360`). [V-log]
- **Seed log rate** during the join window was 5–46 lines/s in fail against 26–113/s in pass. Pass carries diagnostic logging, so this is not a load comparison. The failed seed shows no sign of greater load (fewer gaps, no ACK losses). [V-log; I that it was not CPU-bound at the divergence]
- **Host:** the failed run's host was not visibly slower. [V-log full.log / events]
  - Image build was layer-cached apart from `src/` and finished normally.
  - One `COOLING:cpu` thermal pause of about 5 s happened before the docker stage (72 °C, then 52 °C).
  - Seed bootstrap-to-join_ready took 28.4 s (pass 30.3 s, 9991 29.0 s).
  - Container start to "Distributed Database System starting" took 5.1 s (seed) and 5.4 s (joiners), against 4.7 s in pass.
  - There is no clock gap common to all three nodes.

## 7. Other red in the failed run only

All [V-log] unless marked:
- Both joiners: `Node joining failed` and `Resuming join session after retryable control-plane failure` (barrier timeout). Also `Joining phase failed` with error `Timed out waiting for operation-ledger formation spread…`.
- Seed: 2 `Operation blocked by safety policy` with stale dispatch for epoch 2 versus 3. The pass run had none; its publication went 1 → 3 → 4 → 5 in one drive. The failed run needed two drives (epoch 2 at about 11.8 s, epoch 3 by about 15.1 s). [V-log; I that the two-step publication caused the staleness]
- `replica_operations` REPLACE parked on `replace_remove_safety_blocked` from 12:31:55 with `Deferred retryable replica operation dispatch failure` every second. The pass run's REPLACE completed.
- Joiners: `Cache/authoritative divergence detected during reconciliation` (a657 ×2), `Partition write outcome still unknown when its delivery budget was spent` and `Distributed write failed due to participant failures` (a657 ×1). These follow the stall.
- Seed: 46 `Repaired readiness cache from authoritative …` (pass 17). This is the harness's forced-repair cadence over a longer wait.
- Absent from the failed run but present in pass: the 4 self-targeted "Message not acknowledged" failures and the 9 `partition_id` query errors on `logs-p1`. They need the later scenario phase, which the failed run never reached.

## 8. History

- **`solve/quests/fresh-formation-user-table-routability/log.ndjson` (97 entries):** no occurrence of "Not all nodes reached ACTIVE" and no revoke or recapture discussion. [V-log grep]
- **Handoff closure lineage** (`formation-release-handoff-closure` through `-v4`, `-post-reopen-capture`, `-consumer-parity`):
  - **v3, 2026-08-28:** found the generation flapping `active→revoked startup_authority_incompatible` on every cohort growth, caused by an exact `canonicalNodeIds` equality. Fixed by cohort-growth retention. A transient-BLOCKED revoke was then fixed by capture-vs-retention.
  - **v3 finding 53:** a separate outer `Not all nodes reached ACTIVE state within 60000ms` with closure passing (five-node GCP).
  - **v4 finding 22:** success when captured at the post-cure READY instant, failure when captured at generation 1's completion. It names "a race between joiner-1 READY and the first cure step".
  - **post-reopen-capture, 2026-08-30:** added the `COMPLETED_GENERATION` successor admission. It deliberately closes on revoke and on non-retainable authority.
  - **Nobody recorded the case seen here:** a revoked generation followed by an authority that is never READY again, which leaves no capture path.
- **Other quests** that mention "Not all nodes reached ACTIVE" (`rolling-restart-core-stability`, `rolling-restart-run4-join-runtime-activation`, `snapshot-lane-deadline-bounded-oracle-blind`) are different mechanisms: publication missing an active node, a node exit, and an oracle-blind label. [V-log grep]

## What one more measurement would settle

Re-run the candidate **and** the 9991 composition several times each with three observation-only additions on the seed:

1. **The closure owner's refused capture attempts:** for each `observe()` with no generation, log `captureAdmitted`, the authority's `ready`/`prioritySpreadSatisfied`, `publicationEpoch`, the cohort signature, and which check refused (`terminalGeneration` same cohort at epoch ≤ terminal, no cohort, not admitted).
2. **The owner-membership reconcile's start time and per-step durations:** planning-snapshot read, derivation, publication write, durable or CDC wait.
3. **Per-joiner eligibility time** in the membership projection.

These settle three questions:
- Whether the refused capture in the failed run was the `terminalGeneration` check or `not admitted`.
- Whether the seed's 1.7 s pre-derivation latency (and the 7.4 s reconcile) is spent in a CDC-delivered wait that wave concurrency lengthens. Compare the candidate against 9991.
- How often the derivation-versus-second-joiner race is lost on each composition. If 9991 loses it at a similar rate, the failure is pre-existing. If only the candidate loses it, the reconcile step that grew shows the link.
