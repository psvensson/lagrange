# user-table-leader-placement-spread — design decisions

Scope: one runtime cure (src/rebalancer) + its deterministic tests + the
doneWhen scenario substrate (scenario, shared topology helpers, registry,
deterministic scenario test). Verified-before-build: every load-bearing
claim below was checked against the code by an independent subagent.

## D1 — Leaseholder-local decision, no cross-node coordinator

Each partition's `UnifiedRebalancer` is constructed with
`entityId = partitionId` and only plans while
`resolveRebalancerLeadership()` is true
(`src/partition/partition-service-rebalancer-methods.js:225-239`,
`partition-service-core-base.js:462-484`) — the cure decision always runs
on the partition's current raft leader (CockroachDB "leaseholder decides"
precedent from the recorded prior-art trail). The only cross-node action
is the dispatched step-down request; no new coordination state exists.

## D2 — No fourth move type; the cure has its own output channel

Verified: `resolveCoordinatorOperationType` throws on an unknown move
type and the throw escapes `rebalance()` (aborting the pass);
`applyPressureGating` would treat a non-REMOVE as storage-increasing; an
unknown persisted operation type becomes a permanently undispatched
ledger row. The cure therefore never enters `addMoves`/`removeMoves` and
never creates a coordinator operation: it is evaluated on the quiescent
path and dispatches the existing STEP_DOWN_REPLICA message directly.

## D3 — Hook point: `advanceCheckCadence`, needsRebalance === false

`rebalance()` is only invoked when `evaluateState()` returns true
(critical/suboptimal), so a settled-but-leader-concentrated partition
never reaches it — a cure inside `rebalance()` would be dormant exactly
when needed (the half-wired-mechanism trap). The cure runs in
`checkRebalance`'s quiescent branch (`advanceCheckCadence`, else path),
which (a) inherits the stabilization + start-delay planning gates that
already guarded the pass, and (b) makes the ordering structural: leader
handoffs are only considered when replica-shape work found nothing to do,
so `resolveLeaderRetentionNodeId` and the non-leader-first sorts
(CL-038/CL-043 anti-churn levers) are inert by construction.

## D3a — The priority-spread deferral must not starve the cure (live-run
correction)

Three consecutive live runs (20260810T185440Z, T190943Z, T192300Z)
showed the cross-partition priority-spread deferral gate closed for the
ENTIRE multi-minute post-boot window, each time for a different rotating
system-partition wobble (formation syncing tail; a stale spread census
that reported 2/3 distinct nodes for 8 minutes after the third voter's
promotion proof was granted; a status_failed publications replica) — and
`checkRebalance` returns at `blocker.apply()` before the quiescent
branch, so the cure never evaluated. The deferral protects the shared
move/creation actuators; a leader handoff consumes none of them (no
coordinator operation, no create-lane budget, no storage churn — the
CockroachDB precedent governs lease transfers separately from replica
movement). Correction: when the blocking gate is exactly
CONTROL_PLANE_PRIORITY_SPREAD (all partition-local gates precede it in
the decision order, so they provably passed) and transport backpressure
is clear, the cure still evaluates
(`evaluateLeaderPlacementCureBehindPrioritySpreadGate`). The two
upstream residuals witnessed (stale spread census freshness; uncured
failed priority replica) are recorded in the quest log as routed
follow-up candidates — out of this quest's sealed scope.

## D4 — Trigger predicate is the sealed gap, not fair-share fine-tuning

Fire only when
`distinctLeaderHosts < min(settledPartitionCount, eligibleVoterHostCount)`
for the table (the sealed doneWhen predicate; the CockroachDB "act only
on clear imbalance, never fine-tune" precedent). Additional per-node
conditions: my node holds >= 2 of the table's leaders (surplus host), and
my partition is not the first (sorted) co-located partition on my node
(the anchor stays, so a surplus host is never fully evacuated in one
round).

## D5 — Convergence by construction (the oscillation cures)

- Target selection is restricted to hosts with ZERO leaders of this
  table. While the gap predicate holds, such a host always exists
  (pigeonhole: if every eligible host held a leader there would be no
  gap), and every successful handoff strictly increases
  distinctLeaderHosts. The actuator is one-directional — nothing ever
  pulls leadership back toward concentration — so no limit cycle exists.
- Census stability across passes: the decision requires the settled
  partition/leader fingerprint to be identical to the previous
  evaluation pass before dispatching (CDC-lagged sibling rows; the
  recorded "you cannot build a deadband on a lying sensor" refutation).
  The own partition's leader identity is overridden with the proven-local
  signal (`isLeader`/`nodeId`), per spread-fence-proven-local-leadership-read.
- Retry suppression reuses `PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE`
  (5s retry / 60s stale) — no new timers; the evaluation cadence is the
  existing periodic check with its stabilization window.
- The cross-process cooldown refutation (eval-path-b) does not apply:
  the suppression state is only an optimization; correctness never
  depends on it because the trigger predicate itself goes false once
  spread is reached, on every node's view.

## D6 — Dispatch reuses the node-side machinery byte-unchanged

Verified: `handleStepDownReplica` validates field presence only (no
operation-ledger lookup; operationId is logging/echo), and
`requestTrackedPartitionLeaderHandoff` with
`REPLACE_TARGET_LEADER_ELECTION` is partition-class-agnostic: a
voter-ready FOLLOWER campaigns via `requestElectionNow`; already-LEADER /
mid-election races return COMPLETED without touching raft. The sender
side does NOT reuse `dispatchRemoveSafetyHandoffRequest` (it hard-requires
an operation row and fires three priority-recovery evidence recorders);
the cure builds the minimal request (TYPE, OPERATION_ID synthetic
`user-table-leader-spread:<partitionId>`, PARTITION_ID, REPLICA_ID,
REASON) and delivers via the rebalancer's own `messageRouter`. The
"never elect a stale-log replica" floor is triple-layered: the target
must be a voter-ready (`isVoterRaftRole`) ACTIVE replica, raft's election
restriction rejects behind-log candidates, and learner promotion is
progress-proof-gated upstream.

## D7 — Fence: ordinary user tables only

`classifySystemPartition(...).systemTable === false` (verified: fencing
on `!isControlPlanePriorityPartition()` alone would admit non-priority
system tables). Priority control-plane partitions keep their dedicated
publication-leader machinery untouched; the five-partition
`REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS` fence is not
modified.

## D8 — Scenario substrate

The doneWhen scenario `user-table-leader-placement-spread` reuses the Q1
public-path baseline's table/split/seed machinery, extracted into
`test/distributed/scenarios/user-table-topology-helpers.js` (shared by
both scenarios so the duplication ratchet stays green). Gates in order:
managed split (sentinel trickle), replica-spread support (every settled
child on >= 2 distinct hosts — a leader-spread timeout can never mask a
replica-placement failure), platform-driven leader spread (>= 2 distinct
leader hosts, stable fingerprint x2), then an anti-flap stability hold
(any fingerprint change during the hold is red — the hysteresis guard
observed end-to-end). The scenario fabricates no topology and exposes no
admin transfer; red-on-revert is the pre-cure state witnessed live in
run public-path-multinode-baseline-20260810T180137Z.
