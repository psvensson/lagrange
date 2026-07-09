# RUNG-2: the quest's target symptom does NOT reproduce on current HEAD

RUNG-2 set out to confirm RUNG-1's ROUTING-axis conclusion directly and pin which
routing sub-signal (`isClusterMemberHealthy` / lease / connection / veto) fails for
the surplus voter's host node, resolving the false- vs true-negative fork. Instead,
the instrumented live reproduction produced a more consequential result: **the
mechanism this quest is sealed against — a promoted voter failing
`isVoterReadyRoutableReplica` within the 60s window, wedging the drain floor — does
not reproduce on current HEAD.**

## Instrumentation

`TEMP-VDIAG-RUNG2` (reverted after; on the real predicate
`isVoterReadyRoutableReplica`, `src/rebalancer/priority-publication-safety-topology.js`):
for any critical-partition voter whose `isVoterReadyRoutableReplica` returns false,
log `{failingAxis (TOPOLOGY|ROUTING), topologyOk, routingOk, participation
eligible/failedDimensions/reasonCodes, readiness dimensions/reasons,
isClusterMemberHealthy, connection_state, ready_lease_expires_at,
last_heartbeat_at}`. It fires wherever the predicate is evaluated (not only the
drain floor), so it captures the wedge regardless of which caller reaches it.

## Runs

Movielens access-affinity demo (the same demo whose `[2/4]` ratings-load abort this
quest lineage targets), on HEAD with the instrumentation:

| environment | runs | outcome |
|---|---|---|
| `--local` (loopback transport) | 5 | 1 converged, 4 abort on admin-timeout |
| docker (`distributed-db:test`, realistic transport) | 7 | all abort (rc=1) |

Aggregate signal counts (direct log strings, independent of the instrumentation),
across all 12 runs:

| signal | total across runs |
|---|---|
| `did not become voter-ready within 60000ms` (the sealed target symptom) | **0** |
| `would drop voter-ready ... below minimum` (drain floor, the quest's 2nd dominant deferral) | **0** |
| `TEMP-VDIAG-RUNG2 routing-axis-block` (my instrumentation) | **0** |
| `would_exceed_target_replica_count` (surplus forms) | 13 (one docker run) |
| `operation_ledger_quorum_concentrated` (the actual abort cause) | 20-219 per docker run |

## What this means

1. **The 60s voter-ready timeout is gone on HEAD (0/N runs).** The prior chain
   observed 13 (s13) and 4 (s14 run2) of these; on HEAD, spanning converged and
   failed runs in two transport environments, zero. This is the exact symptom the
   quest exists to fix.

2. **The drain-floor `would-drop-voter-ready-below-minimum` deferral is gone
   (0/N).** RUNG-1's ROUTING disambiguation was derived by elimination from the
   phase2-cl045 report's `345 would_exceed + 318 would_drop` co-firing. On HEAD the
   `would_drop` half does not fire at all — so the elimination's premise (a
   non-routable surplus voter, forcing voter-ready-routable count to 3 of 4) is not
   materialising. When the over-target surplus does form, its voters are
   voter-ready-routable (the routing axis is NOT wedging).

3. **The over-target 4-voter surplus still forms intermittently** (one docker run:
   13 `would_exceed` on `replica_operations-p1`, activeVoterCount 4 / target 3,
   deferring a 5th learner r6) but resolves within the window without a 60s timeout
   — the shipped s14 fixes (Part-1 authoritative raft_role over-creation cap
   `bf535665`; orphan-census `1ff668b8`) appear to have closed the durable-surplus /
   voter-ready-routability wedge.

4. **The demo's current binding blocker is `operation_ledger_quorum_concentrated`**
   (20-219x per docker run), a voter concentration / co-location signal, reached
   under heavy REPLACE churn — NOT a voter-ready-routability failure. This is the
   over-target-drain / concentration domain (the EXHAUSTED sibling
   `formation-ledger-over-target-surplus-drain-coupled-removal`'s territory), not the
   readiness/routability class this quest declared.

## Honest caveats

- The 60s-timeout mode was ~1/3 of runs on the s13/s14 commits; at that rate,
  missing it across 7 docker runs has probability ~(2/3)^7 ~ 6%, so this is strong
  but not absolute. The load-bearing evidence is the trend (13 -> 4 -> 0 across the
  shipped fixes) plus 0 across 12 runs (converged AND failed, both transport
  environments) at the same formation/ratings-load stage where the timeouts
  previously occurred.
- The predicates (`isVoterReadyRoutableReplica`, `isNodeReadyForRouting`) emit no
  log lines of their own; my instrumentation was the only observer of the routing
  axis, and it never fired. The `voter-ready-60s` and `would_drop` counts, however,
  are direct real-log strings and stand independent of the instrumentation.

## Recommendation

The quest's sealed symptom is not reproducing on HEAD, so there is no live routing
sub-signal to repair and the false/true-negative fork is moot. Two honest options
(user decision — goalpost):

1. **Park/EXHAUST this quest as symptom-not-reproducing** and open a fresh quest on
   the actual HEAD blocker: `operation_ledger_quorum_concentrated` under REPLACE
   churn (the over-target surplus that forms via `would_exceed` and drives
   concentration without draining — the planner-plans-no-drain root). RUNG-1's
   predicate analysis and reproduction remain valid as reference for that partition
   class.
2. **If the timeout is believed still latent**, run a larger batched reproduction
   (10-20 docker runs, and/or reconstruct the higher-contention s13/s14 config) to
   try to catch the ~rare mode before parking.

Recommended: option 1 — the direct evidence says the routability wedge is closed and
the concentration blocker is what actually fails the demo now.
