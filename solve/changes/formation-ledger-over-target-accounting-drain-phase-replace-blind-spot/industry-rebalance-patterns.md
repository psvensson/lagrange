# Industry patterns for replica rebalancing without transient over-replication or deadlock

Research synthesis for the Lagrange bug: the planner's committed-voter-count read
**undercounts a durable learner** (added, not yet visible as an ACTIVE voter), sees a
spurious deficit (e.g. 2 of 3), issues an **extra count-increasing ADD** to "fill" it,
the learner then promotes → **4 voters for a target of 3** (over-target, concentrated),
and the planner then **defers the over-target ADD forever** without issuing the
compensating REMOVE / count-neutral REPLACE — so it never de-concentrates and the
control plane stalls.

The question this research answers: how do mature raft/consensus systems model a
replica **move** so their accounting never sees a spurious deficit and never orphans the
compensating removal.

---

## 1. etcd/raft and the Raft dissertation (Ongaro §4)

**Single-server (one-at-a-time) reconfiguration.** Raft's production reconfiguration
restricts changes to **one server added or removed at a time**. The safety argument is
purely about quorum overlap: because you only change the voter set by one, *any* majority
of the old configuration and *any* majority of the new configuration necessarily share at
least one server, so the two configs can never elect disjoint leaders / commit divergent
entries. More complex changes are implemented as a **series of single-server changes**.
This is the mechanism that prevents an unsafe over/under-replicated split-brain — not a
count of replicas, but the guarantee that each step's old and new majorities overlap.
(etcd raft README: "The key invariant that membership changes happen one node at a time
is preserved.")
- https://github.com/etcd-io/raft/blob/main/README.md
- Ongaro dissertation, *Consensus: Bridging Theory and Practice*, ch. 4:
  https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf
  (sources: https://github.com/ongardie/dissertation)

**One uncommitted change at a time = an intrinsic intent lock.** etcd/raft **disallows any
new membership change while an uncommitted change is still in the leader's log**: "any
proposed membership change is simply disallowed while any uncommitted change appears in
the leader's log." This is significant for the Lagrange bug: the reconfiguration protocol
itself will not let a *second* count-changing operation start until the first has
committed. The planner cannot issue a "fill" for a group whose reconfiguration is still
in flight — the in-flight change is a lock, not something the planner re-derives from a
transiently-stale count. (There is a well-known safety subtlety here — the single-server
errata — which is precisely *"wait for the config entry to commit before starting the
next change"*: https://groups.google.com/g/raft-dev/c/t4xj6dJTP6E ,
https://gist.github.com/ongardie/a11f32b70581e20d6bcd)

**Learners / non-voting members for catch-up (Ongaro §4.2.1, "catching up new servers").**
A brand-new server joins with an empty log. If you added it directly as a voter it would
*immediately count toward the quorum* while being unable to help commit anything, shrinking
availability (a 3→4 change where the 4th is empty needs 3 of 4, but the new one can't
vote usefully). The fix: add the new server as a **non-voting learner** first, let it
**catch up** (stream log / snapshot) to near the leader's commit index, and **only then**
run the reconfiguration that promotes it to a voter. The learner replicates data but
**does not count toward quorum** until promotion. This is the canonical "add capacity
without perturbing the voting math" primitive that every system below builds on.

---

## 2. CockroachDB: atomic replication changes (joint consensus) for rebalancing

CRDB is the clearest documented case of *exactly* the Lagrange failure mode and the fix.

**The problem they hit with add-then-remove (issue #12768, "Rebalances must be atomic").**
Moving a replica by add-then-remove creates a transient window in a config it never
wanted: to move one replica of a 3-replica range you briefly go to **4 replicas with a
3/4 quorum and two replicas in one DC**; if that DC fails before the 4th is removed the
range is unavailable. Reversing the order (remove first) is worse — a transient **2/2**
where losing *either* survivor kills the range. The intermediate config is the bug.
- https://github.com/cockroachdb/cockroach/issues/12768

**The fix: express the move as a single atomic old→new transition via joint consensus.**
CRDB adopted Raft **joint consensus** ("atomic replication changes" / "Joint Quorums").
A rebalance from `{a,b,c}` to `{a,b,d}` is *one* reconfiguration that passes through a
**joint config requiring a majority of BOTH the old and the new voter sets** for commits
and elections, then atomically resolves to the new config. There is never a *stable*
4-voter or 2-voter configuration — the ADD of `d` and the REMOVE of `c` are **bound into
one count-neutral operation**. "Unavailability will result only if either the old or new
majority fails." Their conclusion is a blanket recommendation: **all production-grade
Raft systems should use joint consensus.**
- https://www.cockroachlabs.com/blog/joint-consensus-raft/
- CockroachDB SIGMOD paper (§ replication):
  https://dl.acm.org/doi/pdf/10.1145/3318464.3386134

**How the added-but-not-yet-voter replica avoids being double-counted or triggering a
spurious add.** CRDB adds the incoming replica **first as a learner** (issue #34058,
"use learner replicas instead of preemptive snapshots"; #51943 non-voting replicas). The
learner "catch[es] up on the log and can receive snapshots, but they don't vote,
campaign, or **count in the commit quorum**." The atomic replication change then, in a
single joint transition, **promotes the learner to voter and removes the outgoing voter
together**. Because (a) the intermediate replica is *non-voting* and (b) the promotion and
removal are *atomic and count-neutral*, the allocator's voter count is `3` before and `3`
after — it never observes a stable `2` deficit that would provoke a spurious extra ADD,
and never observes a stable `4` that it would then have to reconcile. The move is modeled
as **one linked change**, not an add and a later, separately-planned remove.
- https://github.com/cockroachdb/cockroach/issues/34058
- https://github.com/cockroachdb/cockroach/issues/51943
- Replication layer docs (non-voting replicas "do not participate in quorum"):
  https://www.cockroachlabs.com/docs/stable/architecture/replication-layer

---

## 3. TiKV / PD (Placement Driver): the "operator" as a tracked, single-owner intent

PD does *not* (historically) use joint consensus; it instead solves the same problem with
**explicit in-flight-intent tracking**, which is the most directly relevant model for a
planner that plans over a stale-ish view.

**A move is ONE multi-step operator.** PD expresses "move a replica of a region from store
A to store B" as a **single `Operator`** built from ordered `OperatorStep`s — canonically
`AddLearner` (or `AddPeer`) → catch-up → `PromoteLearner` → `RemovePeer`
(+ `TransferLeader` if the leader is moving). `CreateMovePeerOperator` "creates an operator
that replaces an old peer with a new peer." The ADD and the REMOVE are steps of the *same*
operator — they cannot be orphaned from each other.
- https://github.com/tikv/pd/wiki/Balance-Scheduling
- https://docs.pingcap.com/tidb/stable/tidb-scheduling/

**One operator per region — the scheduler will not re-plan a fill already in flight.** All
operators funnel through a single `OperatorController` (`opController`) "for unified speed
limit and control." Dispatch is heartbeat-driven: "Every time PD receives a Region
heartbeat from a Region leader, it **checks whether there is a pending operator on the
Region** or not. If PD needs to dispatch a new operator ... it puts the operator into
heartbeat responses, and monitors the operator by checking follow-up Region heartbeats."
Only **one operator is active per region at a time**. So while the learner is catching up,
the region already *has* a pending operator; the balance scheduler will not generate a
second, redundant add for it. This is intent/lock tracking, not a re-derivation from a
possibly-stale replica count.
- https://docs.pingcap.com/tidb/stable/tidb-scheduling/
- https://docs.pingcap.com/tidb/stable/pd-scheduling-best-practices/

**The accounting is made in-flight-aware via `GetOpInfluence`.** When a scheduler evaluates
store loads to decide the next move it computes
`opInfluence := s.opController.GetOpInfluence(cluster)` and applies the **influence of
in-flight operators** to each store's projected count *as if the pending moves had already
completed*. In other words PD does not read a raw current count; it reads
`current + in-flight intent`. A region whose new peer is mid-catch-up is already counted as
placed, so no store is seen as deficient on its account. Concurrency is additionally bounded
by `region-schedule-limit` and per-store `store limit` (operators exceeding the store limit
are dropped), preventing a thundering herd of redundant balance operators.
- https://github.com/tikv/pd/wiki/Balance-Scheduling
- https://tikv.org/docs/6.1/deploy/configure/limit/

---

## 4. The general pattern: model a move as a single LINKED intent, and make accounting
intent-aware

Across all three systems the same principle recurs, implemented at different layers. The
Lagrange bug is the classic failure of treating a move as an independent add **and a
separately-planned** remove, with accounting that reads a raw current count.

The three industry mechanisms, and how they map to your options (a)/(b)/(c):

- **(a) Count the in-flight addition / learner toward the target in the accounting read.**
  PD's `GetOpInfluence` (projected count = current + in-flight operator influence) and
  CRDB's use of a non-voting learner that is *part of* the atomic change both mean the
  planner's view already reflects the pending placement. The planner never sees a deficit
  for a slot that is already being filled.
- **(b) Track the operation/intent so a fill in progress is not re-planned, and the ADD
  and its REMOVE cannot be orphaned.** PD's one-`Operator`-per-region + `opController`;
  etcd/raft's "no new membership change while one is uncommitted." The move is a single
  owned object with both legs; you cannot issue leg 2 twice and you cannot drop leg 2.
- **(c) Joint consensus: make the config change atomically old→new so it is count-neutral
  by construction.** CRDB. The window in which a spurious count could even be observed
  does not exist.

**The robust industry answer is not "a better count heuristic" — it is to represent the
move as a single linked intent and read the accounting through that intent.** (a) and (b)
are two facets of the same idea (the plan carries the intent; the accounting respects it);
(c) is the strongest form because it removes the transient config entirely. Systems that
plan over a distributed, slightly-stale view (PD, CRDB's allocator) rely on (a)+(b) *even
when* they also have (c), because the planner runs asynchronously from the raft membership
machinery and must not re-derive intent from a lagging count.

---

## 5. Anti-patterns / documented lessons

- **CRDB #12768 is the canonical documented anti-pattern.** Sequential add-then-remove
  produced a transient over-replicated (3/4, two-in-one-DC) or under-replicated (2/2)
  config and real availability loss. The fix was explicitly *not* to reorder or add
  heuristics but to make the change **atomic** (joint consensus). Their stated lesson:
  every production Raft system should use joint consensus for member changes.
  https://github.com/cockroachdb/cockroach/issues/12768 ,
  https://www.cockroachlabs.com/blog/joint-consensus-raft/
- **Adding a lagging server directly as a voter (the reason learners exist).** Ongaro §4.2.1:
  promoting a not-yet-caught-up server to voter enlarges the quorum with a member that
  cannot help commit, transiently reducing availability. Fix: **learner first, promote only
  when caught up.** https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf
- **Single-server change safety errata.** Starting a new membership change before the prior
  one *commits* can violate safety; the fix is to gate on commit (an explicit intent lock).
  https://groups.google.com/g/raft-dev/c/t4xj6dJTP6E
- **PD without in-flight influence / per-region operator locking** would let the balance
  scheduler repeatedly re-issue the same move on every heartbeat while it is mid-flight —
  which is exactly why `GetOpInfluence`, the pending-operator check, and store/region
  limits exist. https://github.com/tikv/pd/wiki/Balance-Scheduling

---

## MAPPING TO LAGRANGE

Our bug is structurally identical to what PD's `GetOpInfluence` and CRDB's atomic-change
model exist to prevent: **the planner reads a raw voter count that lags the in-flight
addition, sees a false deficit, and issues a second count-increasing ADD** — then, because
that ADD was never *linked* to a compensating REMOVE, the over-target leg is deferred and
orphaned, and the group never de-concentrates.

Memory guidance already narrows the solution space: prior **count-based heuristic** fixes
were all refuted, and this is the **voter-visibility read-path class** (same family as the
`136aebbc` raft_role visibility fix), calling for a **ROW-OP-LINKED** fix rather than a
count tweak. That guidance points precisely at the industry consensus, not away from it.

**Recommended pattern: (a) intent-aware / row-op-linked accounting, reinforced by (b)
linked-operation intent tracking. Not (c) as the immediate fix.**

1. **Primary fix — (a) count the durable in-flight learner toward the target via the
   row-op-linked read path.** The committed-voter-count read must resolve the durable
   learner (the added-but-not-yet-visible-voter) through the *same op-linked read path*
   that already fixed voter visibility in `136aebbc`, and count it as filling the deficit —
   exactly PD's `projected = current + in-flight intent`. This kills the spurious ADD at its
   source: with the learner counted, the planner sees `3 of 3`, not `2 of 3`, and never
   issues the extra count-increasing ADD, so the group never reaches `4`. This is a
   read-path correctness fix (make the accounting see reality-plus-intent), **not** a count
   heuristic — which is why the refuted count-based attempts do not bound it.

2. **Reinforcing fix — (b) model the move as one linked ADD↔REMOVE intent.** Bind each
   count-increasing ADD to its compensating REMOVE/REPLACE as a single operation (PD's
   `Operator`; CRDB's atomic change). Then two things become impossible: the planner cannot
   issue a second fill for a group that already owns an in-flight move (one-operator-per-
   group, like PD's pending-operator check), and the over-target leg can never be *deferred
   in isolation* because it is not a free-standing ADD — it is the tail of a move whose head
   already committed, so it must complete or roll back as a unit.

3. **Do not reach for (c) joint consensus as the immediate fix, but note it as the
   end-state.** Atomic joint-consensus swaps are the gold standard and the reason CRDB's
   allocator never sees this deficit at all — the transient config does not exist. But
   adopting joint consensus is a raft-layer change (Lagrange currently does sequential
   add-learner → promote → remove per partition), far larger than the read-path/intent fix,
   and it does **not by itself** repair an accounting read that undercounts the learner — a
   planner that reads a stale count would still misfire between the joint transition's
   phases. So (c) is the correct *long-term* target (and the CRDB lesson "all production
   raft systems should use joint consensus" applies), but the *decisive, correct, minimal*
   fix for the reported stall is (a) row-op-linked in-flight accounting, backed by (b)
   linked-move intent so the compensating REMOVE can never be orphaned.

**Tradeoffs.** (a) is surgical and matches the proven `136aebbc` read-path family, but it
requires the op-linked read to be *authoritative and fresh* for the learner's existence
(if it can itself be stale you have only moved the staleness); pair it with (b) so
correctness does not depend on the count ever being momentarily right. (b) adds an
intent/operator abstraction (one owned move object per group with both legs and a single-
owner guard) — more machinery, but it is the piece that structurally prevents the
"orphaned over-target ADD deferred forever" half of the bug, which (a) alone does not. (c)
is the most robust but the most invasive and is out of scope for closing this stall.

### Two/three most relevant mechanisms, with citations
- **TiKV/PD `GetOpInfluence` + one-operator-per-region tracking** — projected count =
  current + in-flight intent, and a region with a pending operator is not re-planned. This
  is the closest analogue to the Lagrange fix (a)+(b).
  https://github.com/tikv/pd/wiki/Balance-Scheduling ,
  https://docs.pingcap.com/tidb/stable/tidb-scheduling/
- **CockroachDB atomic replication changes (joint consensus) + non-voting learners** — the
  move is one count-neutral old→new change; the intermediate replica is a learner that does
  not count toward quorum, so the allocator never sees a spurious deficit or surplus.
  https://www.cockroachlabs.com/blog/joint-consensus-raft/ ,
  https://github.com/cockroachdb/cockroach/issues/12768 ,
  https://github.com/cockroachdb/cockroach/issues/34058
- **etcd/raft + Ongaro §4: learner-then-promote and one-uncommitted-change-at-a-time** — the
  primitives underneath both: catch up as a non-voting learner before it counts, and never
  start a second count-changing reconfiguration while one is uncommitted.
  https://github.com/etcd-io/raft/blob/main/README.md ,
  https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf
