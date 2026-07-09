# RUNG-1: the failing axis is ROUTING (`isNodeReadyForRouting`), not topology

RUNG-1 is the mandatory DT-first discovery rung: reproduce the promoted-but-not-
voter-ready-routable state deterministically and disambiguate WHICH axis of
`isVoterReadyRoutableReplica` fails, without assuming (the s14 / CL-045 chain
repeatedly mis-attributed the sub-reason). This rung confirms the binding axis is
**ROUTING** (`isNodeReadyForRouting`), and corrects the quest's sealed causal model
in one load-bearing detail.

## Mechanism correction (verified against source)

The quest statement frames the "did not become voter-ready within 60000ms" timeout
as polling `isVoterReadyRoutableReplica`. It does not.

- The 60s window is `waitForVoterReadyActivation`
  (`src/node/replica-handler-voter-readiness-methods.js:144-189`); it polls the
  purely LOCAL `isReplicaVoterReady` (`:196-216`) = locally-tracked raft role is
  non-learner AND the local SERVICES row has an `address` AND a non-terminal status.
  It never calls `isVoterReadyRoutableReplica`, `isVoterReadyReplicaTopology`, or
  `isNodeReadyForRouting`. The window releases the instant the local partition
  service runs `becomeFollower()`.
- `becomeFollower()` is gated by the promotion guard's `would_exceed_target`
  (`src/partition/partition-service-learner-promotion-methods.js:531-563`), which
  counts raft-role voters via `countActiveVoters` -> `isActiveVoterServiceRowForPromotion`
  (`:267-274`, `:644-653`). Release requires the raft-voter COUNT to drop (a surplus
  voter drains) or a promotion credit; it does NOT read voter-ready-routable.
- The drain floor `would-drop-voter-ready-below-minimum`
  (`src/rebalancer/operation-workflow-remove-safety-evaluator.js:434-436,557-563`)
  IS the site that calls `isVoterReadyRoutableReplica` on the surplus voter.

Corrected causal chain (the fix direction is unchanged, the order is corrected):
make the surplus voter **routable** -> the drain floor releases -> the surplus
drains -> `countActiveVoters` drops 4->3 -> the promotion guard `would_exceed_target`
releases -> the deferred learner's local `becomeFollower()` runs -> its 60s window
succeeds. So `isVoterReadyRoutableReplica` is the correct fix target, but it unblocks
the deadlock via the DRAIN FLOOR first, then the guard by count, not by the 60s
window reading it directly.

## The predicate asymmetry that makes the deadlock possible

The guard voter count and the floor readiness predicate read the same row with
DIFFERENT status sets:

| predicate | status admitted | raft_role | node routing |
|---|---|---|---|
| GUARD `isActiveVoterServiceRowForPromotion` | any live (`!= failed/removing/removed`, so incl. `creating`,`syncing`,`active`) | voter role (`leader/follower/candidate`), not learner | not consulted |
| FLOOR `isVoterReadyReplicaTopology` | `{active, syncing}` only | not learner, has `address` | (routing checked separately) |
| FLOOR `isNodeReadyForRouting` | — | — | host node control-plane readiness dimension |

So the same promoted-voter row can be counted by the guard yet rejected by the
floor. Three axis conditions can produce that gap; RUNG-1 identifies which one is
live.

## Disambiguation — the real deferral signature (research-first, on-disk evidence)

Ground truth: `solve/changes/voter-ready-60s-promotion-timeout/instrumented-run-evidence-s14/`
run2 (the failing run: 4 voter-ready-60s timeouts, 59 `would_exceed` defers). The
`TEMP-VDIAG-S14 guard-defer` records show, at every defer:

- `activeVoterCount: 4`, `targetReplicaCount: 3`, `maxAllowedVotersAfterPromotion: 4`,
  `laggingStatusVoterCount: 0`;
- all four `voterRows` at `raftRole: 'follower'`, `status: 'active'`;
- the deferred learner separate, at `status: 'creating'`.

And the live A/B (`phase2-cl045-REFUTED-refined-diagnosis.md`) shows the drain floor
`would-drop-voter-ready-below-minimum` firing 318x CONCURRENTLY with `would_exceed`
345x — i.e. the surplus voter is simultaneously guard-counted AND floor-rejected.

Only one axis is consistent with BOTH deferrals co-occurring on a status-active/
syncing + follower row:

| axis | guard counts it? | floor rejects it? | consistent with real signature? |
|---|---|---|---|
| **raft_role-lag** (raft_role reads `learner`) | NO — guard excludes learners, count would be 3 | yes (topology raft_role gate) | **CONTRADICTED** — `would_exceed` requires the guard to count 4; a learner drops the count, so it could not fire. Real rows are all `follower`. |
| **status-lag** (`creating` + follower) | yes (`creating` is live) | yes (topology status gate) | **ELIMINATED** — real `laggingStatusVoterCount: 0`, every voter `active`/`syncing`; no live surplus voter sits at `creating`. |
| **ROUTING** (`active`/`syncing` + follower, host node not routing-ready) | yes | yes — via `isNodeReadyForRouting=false` | **UNIQUE MATCH** — guard counts it (`would_exceed`) AND floor rejects it (`would-drop-below-min`), with topology fully passing. |

Conclusion: **the binding failing axis is ROUTING (`isNodeReadyForRouting`).** The
surplus 4th raft-voter is topology-voter-ready (status `active`/`syncing`, raft_role
`follower`, addressed) but its HOST NODE is not control-plane routing-ready under the
critical-partition dimension (`CONTROL_PLANE_RECOVERY_ELIGIBLE`,
`resolveOperationReadinessDecisionDimension`), so `isVoterReadyRoutableReplica`
returns false and both correct-by-design gates persist.

## Deterministic reproduction

`test/rebalancer/promoted-voter-voter-ready-routable-60s-axis.test.js` (18/18 green)
exercises the REAL predicates on both sides of the deadlock:

- GUARD `isActiveVoterServiceRowForPromotion` (via
  `createPartitionServiceLearnerPromotionMethods`);
- FLOOR `isVoterReadyReplicaTopology` / `isNodeReadyForRouting` /
  `isVoterReadyRoutableReplica` (via `PriorityPublicationSafetyRows` with a stubbed
  control-plane readiness service).

It reproduces the ROUTING-axis deadlock (guard counts 4, floor sees 3 routable,
draining a routable source drops to 2 < min 3), and independently demonstrates that
the raft_role-lag axis is contradicted (guard count falls to 3, no `would_exceed`)
and that the status-lag axis is eliminated by the observed all-active voters. A
positive control shows that once the surplus voter's node is routing-ready, all four
are voter-ready-routable, the drain is safe, and both gates release. This is the
DT-first discovery artifact; the affinity-demo A/B remains validation-only.

## What is confirmed vs. still open

CONFIRMED (real data + real-predicate reproduction):
- The failing readiness axis is ROUTING, not topology (status or raft_role).
- The surplus voter is topology-voter-ready; the deadlock is its host node's
  control-plane routing readiness not clearing within the window.

OPEN (next rung — the fix rung, still in the readiness/liveness class c-class):
- WHICH input to the `CONTROL_PLANE_RECOVERY_ELIGIBLE` readiness dimension is false
  for the surplus voter's freshly-formed host node, and why it does not clear within
  60s: `isClusterMemberHealthy` stale-heartbeat (MODE-A `a79b3728` family / the
  `hasLiveTransportEvidence` consolidation `d29bcbee`), `ready_lease_expires_at` /
  lease sweep, `connection_state`, or the readiness-veto hysteresis path. Instrument
  the readiness dimension inputs for that node at the
  `operation-workflow-remove-safety-evaluator.js:434-436`
  `isVoterReadyRoutableReplica` call to pin the sub-signal, then repair it so the
  host node becomes routing-ready within the window WITHOUT weakening the promotion
  guard or the drain floor and WITHOUT raising the 60s / provisioning budgets
  (TEST-0021). The fix reads authoritative routing-readiness actuals, never targets
  (ARCH-0080/0084).

Vetted-dead / do-NOT-retread (unchanged): CL-045 concurrent-op serialization
relaxation; drain-floor / promotion-guard relaxation; 60s or provisioning/admission
budget raises; app-tier coupled removal (the EXHAUSTED sibling
`formation-ledger-over-target-surplus-drain-coupled-removal`).
