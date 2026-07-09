# Next-gate diagnosis (s14) — control-plane settle stall = topology-guard vs quorum-voter count disagreement

After the s14 progress-gated re-wait cleared the [2/4] provisioning gate (commit
`99ff7780`, A/B KEEP `38754984`), the demo reaches [4/4] but STALLS at
control-plane settling (`converged:false, stalled:true, ~318s`). This pins the
binding root of that stall.

## The snapshot-coverage fence is a RED HERRING (confirmed, do not fix to green)

The prominent trace (`fenceSnapshotCoverageState:unavailable` → `promotion_denied`
→ `published_active_coverage_incomplete`) is diagnostic-only and does NOT gate the
settle loop, rebalancer, DDL, or voter promotion. Proven three ways: it never
clears on any node yet node-2 executed 3000+ rebalancing moves; a stable 13-min
owner kept coverage `unavailable`; prior consumer census
(`pin-run1-coverage-fence-callsite.md`) shows no settle/rebalancer path routes on
it. It is a known structural caller-omission (CL-021 deferred it as
diagnostic-only; CL-022 fixed the load-bearing admin-serve sibling). Cleaning it
is optional hygiene and will green nothing.

## Binding root — a self-referential ledger deadlock from two disagreeing counts

`replica_operations-p1` (the operation ledger) is stuck at **2 quorum voters**
(concentration eval: `totalVoters:2`, mostly `maxVotersOnOneNode:1` = 2 voters on
2 nodes) for the whole run. A 2-voter group is inherently "concentrated" (can't
put a majority outside the hottest node), so the quorum-concentration interlock
defers every dependent control-plane spread op → `control_plane_publications-p1`
et al. stay at 2/3 replicas / 2-of-5 spread → control plane never settles → 120s
no-op stall. Write-leader churn (2329 reconcile deferrals, leadership flapping)
is a downstream symptom of the same under-spread.

**Why the ledger never reaches a 3rd voter — the count disagreement:** the
planner GENERATES the spread ADD (`moveType:add`, fresh `moveTargetNodeId`), but
admission BLOCKS it `810×` with `admissionReason:"target_replica_count_already_satisfied"`.
Two predicates answer "is this partition at its 3-replica target?" differently:

| site | predicate | counts | reads |
|---|---|---|---|
| quorum-concentration interlock (`operation-ledger-quorum-concentration.js:48` `isQuorumVoterRow`) | status ∈ voter-statuses ∧ raft_role ∈ {leader,follower,candidate} | **2 voters** | CONCENTRATED → defer deps |
| topology guard (`rebalance-coordinator-topology-guard-methods.js:102` `isTopologyGuardBlockingServiceRow`, decision `:199-207`) | status NOT in {REMOVED} — counts pending/creating/syncing/**learner** | **≥3 distinct nodes** | TARGET SATISFIED → block the spread ADD |

The ledger carries the 2 voters (r2/r4 `follower/active`) PLUS non-voter rows
(`pending` 321, `creating` 172, `syncing` 19, `learner` 12) on other nodes. The
topology guard counts those non-voter nodes → `observedDistinctNodeIds ≥ 3` →
"target satisfied" → refuses the ADD that would create a genuine 3rd VOTER, while
the interlock (voters only = 2) holds the whole control plane. Neither side can
make progress: the guard won't admit the spread because a non-voter already
"occupies" the 3rd node; the non-voter never becomes a voter; the interlock never
releases. **Self-referential deadlock.**

This is the deficit/under-spread TWIN of the voter-surplus read disagreement Part
1 fixed on the over-creation side (`in-flight-aware-replica-count.js`
authoritative voter count). Same class, opposite sign.

## Combine-logic opportunity (user steer) — and its tension

The clean consolidation: the topology guard's `TARGET_REPLICA_COUNT_ALREADY_SATISFIED`
check should count distinct nodes of **quorum-voter** rows (reuse the authoritative
`isQuorumVoterRow` predicate the interlock uses), not distinct nodes of any
non-REMOVED row. Then 2 voter-nodes < 3 → NOT satisfied → the spread ADD is
admitted → the ledger reaches a real 3rd voter → de-concentrates → interlock
releases → settle completes.

**Tension (why this is the hard core, not a one-liner):** counting only voters
risks the over-creation Part 1 exists to prevent — if the 3rd-node non-voter is a
learner LEGITIMATELY catching up toward becoming the 3rd voter, ignoring it would
admit a redundant 4th replica. So the guard must distinguish a *catching-up*
promotable learner (correctly blocks a redundant ADD) from a *stuck* non-voter
that will never promote (wrongly blocks the spread). That distinction is the
voter-ready/learner-promotion boundary — the same seam the voter-surplus work
circles. A naive "count only voters" is a count heuristic (refuted 3× in this
quest's history); the real fix needs the promotable-vs-stuck signal.

## Status / routing

Root belongs to the OPEN quest `formation-ledger-self-move-blocks-cluster-ops`
(multi-session, heavily refuted — check any candidate lever against its
vetted-dead set before building). A system-wide census of divergent
replica/voter-count predicates is running (user steer: "where else are decisions
made differently about the same things") — the consolidation should be designed
from that map, not site-by-site. Do NOT build a naive count fix; the
promotable-vs-stuck signal is mandatory.
