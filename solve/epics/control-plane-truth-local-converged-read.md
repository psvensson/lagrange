---
id: control-plane-truth-local-converged-read
roadmapRow: RM-0.2-movielens-live-lane
status: sharpening
graduatesTo: movielens-nodes-priority-recovery-escape
---

# Epic: Control-plane truth as a local, converged read

Decision memo for the MovieLens phantom-predicate wedge. Scope is bounded to
resolving *which* cut to land for the critical-path quest
`movielens-nodes-priority-recovery-escape`; it does not itself implement.

## The validated diagnosis

Three independent traces agree (live run `2026-08-04T08-01-38-927Z`, the
deterministic repro below, and the research triangulation): **physical placement
is correct, but the authoritative control-plane *read* of that placement is
stale because it is leader-funneled and the funnel is congested.**

- The `sql_write_operations-p1` raft group is at 3/3 spread with an elected
  leader. Placement is physically right.
- Control-plane rows (membership, replica role, partition leader-ownership) are
  written/read through a single write-leader node. Non-leaders defer
  (~2971 "not the control_plane_publications write-leader" defers), and a new
  replica's role-row fails to persist through the congested funnel ("Cache
  update not observed for services:sql_write_operations-p1-r5 within 1000ms").
- Downstream consumers then act on phantom state, all three reading the *same*
  stale funnel:
  1. deficit detector → `replica_count_below_minimum: 2 < 3` vs physical 3/3,
  2. planning gate → `operation_creation_not_required` (zero ADDs minted),
  3. spread fence → `missingActiveLeader: true` ×239.

This is a self-sustaining wedge: the deficit and the leader-phantom are reads
of the same stale snapshot, so the gate sees no *fresh* deficit and mints no
cure move — the stale read is never corrected by an action.

## Deterministic repro (receipt)

`test/control-plane/movielens-phantom-predicate-repro.test.js` (6 tests,
21 assertions, green) reproduces each phantom against a physically-healthy
3/3-spread group:

- **Spread fence:** `canonicalLeaderReplica` is `false` when the funneled
  `partitions.leader_node_id` is stale — even though `leaderServiceVisible`
  and `leaderKnown` are `true` (raft *did* elect a leader). The phantom exists
  *only* because the observation reads the funneled row, not the role.
- **Deficit detector:** a role-row persist failure (`raft_role: null`) drops
  the ready count and the detector emits exactly
  `replica_count_below_minimum: 2 < 3`, with the CL-021 `raft_role_missing`
  witness attribution.
- **Coupling:** both hold simultaneously on one stale snapshot →
  `operation_creation_not_required` → zero ADDs.

dt-prove receipt:
`solve/changes/dt-prove/movielens-phantom-predicate-repro.test.js-2026-08-04T08-55-40-642Z.json`
(verdict `revert-noop` — expected: the repro *characterizes* current buggy
behavior; it does not exercise a fix, so reverting the pinned src changes no
behavior. This is a characterization test, not a red-on-revert guard.)

## Prior art (two wheels, both peer-reviewed / production-proven)

Full citations in:
- `docs/research/control-plane-convergence-production-mechanisms.md`
- `docs/research/control-plane-convergence-literature-map.md`

**Wheel A — Consensus truth, read locally with a lease + index proof**
(ReadIndex / lease-read: Raft paper §8; etcd linearizable read; CockroachDB
"leaseholder bypasses Raft"; Consul `consistent` mode). Writes go through
consensus once; reads served by the leader/leaseholder *without* a new log
append after a cheap leadership proof. Freshness is *proven*, not assumed.

**Wheel B — Metadata as a replicated event log, pulled into local materialized
views, stale fenced** (KRaft KIP-500 "brokers simply consume metadata events
from the event log … store metadata locally"; k8s informers + resourceVersion;
TiKV/PD heartbeats-up / operators-down). The control-plane truth is a
totally-ordered log; every consumer keeps a local replay keyed by an
offset/revision; staleness is made first-class and *fenced* (KRaft Fenced
state; k8s resourceVersion precondition; Consul `X-Consul-LastContact`).

**Two discipline rules both wheels force:**
1. **Make staleness observable and fenced, not silent.** Attach a
   version/epoch to every role/membership/leadership row; the deficit detector
   and fence *refuse to act* (or re-sync) past a staleness bound. Our
   "2<3 against a healthy 3/3" is a consumer acting on *un-fenced* staleness.
2. **Report leadership/membership up from the edge, don't infer it at the
   funnel.** PD's region-leader heartbeats: the physically-healthy group
   *self-reports*, so a phantom deficit is impossible.

## Candidate cuts

### Cut 1 — Edge self-reporting of leadership + membership (Wheel B, PD-style)
Make the partition raft group *assert* its own leader/role truth up to the
control plane (region-leader heartbeat analog), rather than the role-row
surviving the congested single-writer funnel. The deficit detector and spread
fence read the group's self-reported, quorum-backed truth.

- *Fixes at the root:* eliminates the funnel for the leadership/role fact.
- *Strong precedent:* TiKV/PD (RegionState heartbeats), Megastore coordinator.
- *Cost:* larger change — a new self-report channel + consumer read-path
  switch. Best long-term shape; highest risk to land under release pressure.

### Cut 2 — Reader fencing / freshness tokens (Wheel A, minimal surface)
Keep the funneled write, but attach an epoch to every role/leadership row and
have the consumers carry a last-seen epoch. The spread fence serves
"active leader present" from the partition's own raft leader under a lease /
ReadIndex-analog instead of the funneled row; the deficit detector refuses to
declare a deficit (or triggers a re-sync) when its view is older than a bound.
Eliminates the *phantom action* (the Monotonic-Reads violation, Terry et al.
1994) without replacing the write path.

- *Fixes the measured failure:* consumers stop acting on phantom-stale reads.
- *Minimal, precedented:* Consul `max_stale` / `X-Consul-LastContact`; k8s
  resourceVersion; Raft lease-read.
- *Honest limit:* does not de-congest the funnel — but per the literature,
  ReadIndex still touches the leader per read, so for *our* congested-leader
  failure mode the lease-read / edge-source half is the operative part.

### Cut 3 — Full KRaft metadata-log cutover (Wheel B, maximal)
Make control-plane rows entries in a replicated log each node pulls and
materializes locally; consumers read their own converged image. KIP-500 is
literally a post-mortem of this bug class.

- *Structural elimination* of the funnel.
- *Cost:* largest; a phased cutover under a live release gate. This is the
  `membership-lifecycle-placement-hard-cutover` graduate, not the 0.2 fix.

## Recommendation

**Land Cut 2 first (minimal, precedented, directly kills the measured
phantoms), staged toward Cut 1.** Concretely:

1. Spread fence: answer "active leader present" from the partition raft
   leader's own proven leadership (lease/ReadIndex-analog), not the funneled
   `partitions.leader_node_id`. Our repro pins that `leaderServiceVisible`/
   `leaderKnown` are already true when `canonicalLeaderReplica` is phantom-false
   — the truth is present locally; the fence reads the wrong field.
2. Deficit detector + planning gate: fence the reader — carry a last-seen
   role-row epoch; refuse to declare `replica_count_below_minimum` /
   `operation_creation_not_required` past a staleness bound (re-sync instead).
3. Stage Cut 1 (edge self-report) as the durable fix behind it; reserve Cut 3
   for the membership hard-cutover epic.

Rationale: the literature is unambiguous that *fencing the reader* is
non-negotiable regardless of write path (FLP — staleness can never be perfectly
detected, only fenced). Cut 2 is the smallest change that converts the system
from "act on un-fenced stale truth" to "fence the reader," it is the shape
every production system independently chose for exactly this failure, and it
does not foreclose Cut 1/3. Per the operational-ground-truth "one invariant at
a time" rule, Cut 2 isolates the phantom-action invariant without also
re-platforming the write path under release pressure.

## What this does NOT claim

- It does not claim ReadIndex alone de-congests the funnel (it does not —
  the lease-read / edge-source half is operative for our congested-leader mode).
- It does not resolve the progress-or-evict deadlock (that is the Raft
  single-server/joint-reconfiguration result, a separate cut).
- It does not pick the first patch; it selects the best-precedented mechanism
  per the research fan-out.

## Handoff

The implementation Quest is `movielens-nodes-priority-recovery-escape`. The
first rung: make the spread fence read proven-local leadership (Cut 2 step 1),
validated by flipping the repro's phantom tests from "reproduces the phantom"
to "does not act on the stale read."
