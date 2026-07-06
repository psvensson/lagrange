# Verify: durability-shed leaderless-void plan (options i+ii) vs. production Raft practice — round 2

Reviewer: distributed-systems reviewer. Fresh web research (July 2026) against etcd/raft,
Hashicorp raft (Consul/Nomad), TiKV + PD, CockroachDB, and Ongaro §3.10.

## Problem under review (restated)

`replica_operations-p1` leader wedges its LOCAL durable store (orphaned sqlite txn: in-memory
writes ack to followers, nothing durable). Durability-fitness detector flags it unfit → it does a
**blind step-down naming no successor** and then **defers its own candidacy while unfit**. No
successor wins (only fresh candidate is a just-promoted learner that is voter-ready ~12s *after* the
shed and may be log-behind; other voters degraded on the same wedged partition). Group sits ~66s
leaderless until the ORIGINAL leader self-heals and re-elects. Confirmed: the zombie advertises its
DURABLE (stuck-low) index — no phantom-high-index veto — and the viability check is a weak
"did any follower ack in the last 10s" heuristic.

Plan: **(i)** directed + re-probed handoff (transfer to a *verified* successor via a
TimeoutNow-style primitive, and *retry* the transfer when a successor later becomes viable, since
today it fires once at first detection and never retries after shedding); **(ii)** strengthen
viability / don't shed into a void (only transfer to a genuinely electable target — log caught-up to
committed, heartbeat-healthy, not itself unfit; if none is ready, **do not shed** — keep serving
surface-only).

---

## Q1 — Leadership-transfer preconditions & feasibility from an unhealthy leader

**Established practice.** Every production implementation refuses to hand off to a target that is not
caught up, and brings the target current *first*:

- etcd/raft tracks `leadTransferee`; on `MsgTransferLeader` it only sends `MsgTimeoutNow` once
  `pr.Match == r.raftLog.lastIndex()`, otherwise it keeps running normal replication
  (`sendAppend`) to bring the target up, and **"If current leader cannot transfer leadership in
  electionTimeout, it becomes leader again."**
  ([etcd-io/raft raft.go](https://github.com/etcd-io/raft/blob/main/raft.go),
  [transfer optimization #5020](https://github.com/etcd-io/etcd/issues/5020))
- Hashicorp raft polls `for repl.nextIndex <= r.getLastIndex()` (append-entries to catch the target
  up), and aborts with a timeout error after one `ElectionTimeout`.
  ([hashicorp/raft raft.go](https://github.com/hashicorp/raft/blob/main/raft.go))
- Ongaro §3.10 / TimeoutNow: "the target node must be up-to-date with all the committed entries
  before the transfer begins"; the leader brings it current, then sends TimeoutNow.
  ([raft-dev thread](https://groups.google.com/g/raft-dev/c/wvxFwkrZuQg),
  [OngaroPhD.pdf](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf))

Feasibility from *this* leader: mechanically the transfer CAN complete, because in-memory
replication still works (writes are acked to followers), so the leader can drive the learner's
`Match` up to its in-memory `lastIndex`. The precondition is on *replicated* index, not the leader's
stuck *durable* index. **But** that exposes a durability hazard the plan doesn't name: the leader has
been acking entries it never made durable, so the successor may inherit a log that is "committed" in
Raft terms yet was never durably persisted by a quorum — the classic non-durable-ack corruption
window. Transfer mechanics are sound; the durability of what you transfer is the real question.

**Judgement: SUPPORTS (i)'s directed handoff, with a durability caveat** — feasible here because
in-memory replication is healthy, but the plan must confirm the successor's log is durably held by a
real quorum, not just index-matched to a non-durable leader.

---

## Q2 — Step down with no healthy successor: unconditional, or guard the void?

**Established practice.** Two distinct signals, and they cut opposite ways on (ii):

- etcd `CheckQuorum` makes a leader step down "when quorum is not active for an electionTimeout" —
  i.e. it self-demotes to avoid a partitioned zombie, but PreVote+CheckQuorum specifically stops it
  from stepping down *spuriously* and lets leaderless followers grant prevotes immediately so a new
  leader forms without waiting a full timeout.
  ([go.etcd.io/raft/v3](https://pkg.go.dev/go.etcd.io/raft/v3),
  [CheckQuorum by default in CRDB #104042](https://github.com/cockroachdb/cockroach/pull/104042))
- CockroachDB on a **disk stall** does the opposite of "keep serving": it **crashes the process**
  after ~20s ("disk stall detected: unable to sync log files"), precisely to *avoid serving
  non-durable writes*; and because a Store-Liveness "fortify" heartbeat itself requires a disk write,
  a stalled-disk leader **cannot fortify and automatically loses leadership eligibility**.
  ([CRDB #50196](https://github.com/cockroachdb/cockroach/issues/50196),
  [replication-layer](https://www.cockroachlabs.com/docs/stable/architecture/replication-layer),
  [cluster-setup-troubleshooting](https://www.cockroachlabs.com/docs/stable/cluster-setup-troubleshooting))

The accepted resolution of the exact tension: production systems treat "a durability-broken leader
keeps acking writes" as *worse than unavailability* and self-fence (crash / lose fortification). They
do NOT keep serving non-durable writes to preserve availability.

**Judgement: WARNS-AGAINST option (ii) as written.** The "electability gate before you hand off"
half is idiomatic and correct. But "keep **serving** (surface-only) rather than shed" is dangerous
for the write-acking part — CockroachDB crashes to avoid exactly that. The correct decomposition:
keep the **role** (so you can retry a transfer, see Q3), but stop acking durability — fail/backpressure
writes while unfit. Holding the leadership *token* to orchestrate recovery is fine; continuing to
tell clients/followers "durably committed" is not.

---

## Q3 — Retry / re-probe semantics: shed-then-reprobe vs stay-leader-until-transfer

**Established practice.** Uniformly: **stay leader and retry the transfer; never shed first.**

- etcd: a transfer that can't complete within `electionTimeout` → **"it becomes leader again."** The
  leader is never left as a candidate-less follower.
  ([etcd-io/raft raft.go](https://github.com/etcd-io/raft/blob/main/raft.go))
- Nomad/Consul: on `establishLeadership` failure the node "must be revoked and transferred to another
  server *if possible*, or … retry"; a failed `leadershipTransfer()` is **retried after 5s while
  still leader**; and a known bug where transfer failed and "we always retry if leadershipTransfer
  returns an error" caused a **leaderless infinite loop** — treated as a defect to fix, not a design.
  ([nomad #12293](https://github.com/hashicorp/nomad/pull/12293),
  [consul leader.go](https://github.com/hashicorp/consul/blob/main/agent/consul/leader.go))

The plan's "shed **then** re-probe *as a follower*" inverts this. Once you are a follower you no
longer control replication to the candidate and you've already created the void — which is the very
66s bug being fixed.

**Judgement: WARNS-AGAINST (i)'s ordering.** Keep the ordering the industry uses: remain leader,
keep driving catch-up, send TimeoutNow only when a target is verified-electable, and **only release
the role as a side effect of a *successful* transfer** (or a genuine quorum-loss CheckQuorum event).
"Re-probe as a follower" should never exist as a state.

---

## Q4 — Whole-group degraded: is moving leadership even the right tool?

**Established practice.** Leadership movement is the tool ONLY when a *healthy elsewhere* exists;
production schedulers explicitly refuse to thrash a uniformly-degraded group and escalate instead:

- TiKV `evict-slow-store` / `evict-slow-trend`: evict leaders **away** from a slow store to healthy
  stores — but gated by an affected-store ratio (default ~30%): if slowness spans more than the
  threshold of the cluster it **tolerates rather than evicts**, precisely to avoid cluster-wide
  thrashing ("if an event just affects a minor amount of the cluster, we could tolerate that").
  ([pd #5808](https://github.com/tikv/pd/pull/5808),
  [pd-scheduling-best-practices](https://docs.pingcap.com/tidb/stable/pd-scheduling-best-practices/))
- "**PD keeps transferring leader to a down store**" is filed as a *bug*: transferring toward an
  unavailable target "creates a broken state … cannot self-heal … stuck in a degraded state
  indefinitely." ([tikv/pd #3353](https://github.com/tikv/pd/issues/3353))
- Slow nodes "experience request accumulation, causing some Leaders to wait until the delayed
  requests are processed before handling Leader eviction requests" — a sick node **cannot even
  execute its own eviction promptly**. ([pd-scheduling-best-practices](https://docs.pingcap.com/tidb/stable/pd-scheduling-best-practices/))

When the resource wedge is group-wide, the idiomatic remedy is **member replace / add a caught-up
learner / operator-or-scheduler intervention / backpressure**, driven by an *external* control plane
(PD) — not leadership musical-chairs among sick peers.

**Judgement: WARNS-AGAINST relying on leadership movement here.** The plan's own preconditions (other
voters degraded on the same wedged partition, successor is a behind learner) are the textbook
"nowhere healthy to move to" case. This is where the repo's rebalancer (a partition *is* a service)
should escalate to member replace / faster learner promotion, not where a transfer primitive helps.

---

## Q5 — Viability signal: is "acked within 10s" adequate?

**Established practice.** Targets are chosen on **log caught-up (`Match == leader lastIndex` /
committed), Progress in `StateReplicate` (not Probe/Snapshot), voter-not-learner, and store health
(not in `down_peers`)** — never on liveness-recency alone.
([etcd-io/raft raft.go](https://github.com/etcd-io/raft/blob/main/raft.go),
[tikv/pd #3353](https://github.com/tikv/pd/issues/3353),
[hashicorp/raft raft.go](https://github.com/hashicorp/raft/blob/main/raft.go))

"Any follower acked in the last 10s" checks none of these: it passes a log-behind learner, a
non-voter, and a peer that is itself degraded — exactly the target this bug tried to hand off to.

**Judgement: SUPPORTS (ii)'s stronger viability gate.** Replace the 10s-ack heuristic with
caught-up-to-committed AND voter (not learner) AND healthy/not-unfit AND Progress=Replicate. This is
squarely idiomatic.

---

## Q6 — Anti-patterns the plan risks

- **Transfer to a not-caught-up target** — guarded against in etcd/Hashicorp (Q1); the current 10s
  heuristic violates it.
- **Transfer to an unhealthy target** — [tikv/pd #3353](https://github.com/tikv/pd/issues/3353)
  ("keeps transferring leader to a down store") is a named bug.
- **Demote-then-cannot-elect / leaderless loop** — the [nomad #12293](https://github.com/hashicorp/nomad/pull/12293)
  "always retry → leaderless infinite loop" and this repo's own 66s void are the same failure. The
  fix is *don't leave the role without a successor*, not retry-after-shedding.
- **Leadership churn/thrashing across degraded peers** — TiKV's affected-ratio gate exists to prevent
  it ([pd #5808](https://github.com/tikv/pd/pull/5808)).
- **Relying on a self-unhealthy leader to orchestrate its own handoff** — TiKV shows the sick node
  can't process its own eviction promptly; CockroachDB moves the trigger *off* the sick node entirely
  (a stalled disk can't fortify, so peers withdraw support). Production designs push orchestration to
  an **external control plane or peer-driven liveness**, not the patient.
  ([replication-layer](https://www.cockroachlabs.com/docs/stable/architecture/replication-layer))

**Judgement: WARNS-AGAINST — several of these are live in the plan** (weak target check, self-driven
handoff, retry-after-shed).

---

## OVERALL VERDICT

(i)+(ii) is **directionally correct and strictly better than today's blind-shed, but needs three
refinements and is missing one architectural move.** It is NOT yet idiomatic as written.

**REFINE — three concrete changes:**
1. **Invert the ordering (Q3, biggest single risk).** Never shed first and "re-probe as a follower."
   Match etcd/Nomad: *stay leader*, keep driving catch-up, and release the role **only as a side
   effect of a verified, successful TimeoutNow transfer** (or a real CheckQuorum quorum-loss). Delete
   "defer own candidacy while unfit and wait" — that is the void generator.
2. **Decouple durability-ack from role-holding (Q2).** "Keep serving surface-only while unfit" is
   only safe if it means *hold the leadership token to retry handoff*; it must NOT mean *keep acking
   writes as durable*. While unfit, fail/backpressure writes (CockroachDB self-fences rather than ack
   non-durably). Holding the token to orchestrate recovery = fine; lying about durability = the thing
   real systems crash to avoid.
3. **Harden the viability gate (Q5) and add a whole-group-degraded escape (Q4).** Target must be
   caught-up-to-committed + voter + healthy + Progress=Replicate. And when *no* such target exists
   because the wedge is group-wide, do NOT thrash leadership — escalate to the rebalancer/control
   plane (member replace / faster learner→voter promotion / operator), mirroring PD's affected-ratio
   tolerate-don't-evict rule.

**The move the plan is missing (and the deepest read):** this is substantially a **heal-latency
problem, not a leadership-mechanism problem.** The 66s is dominated by *no successor being ready*
(learner voter-ready ~12s after shed, peers degraded on the same resource), not by handoff mechanics.
Production systems make the *external control plane* responsible for having a caught-up voter ready
(pre-provision/promote the learner, or replace the wedged member) so that when a leader must yield
there is somewhere healthy to yield to — and they take the trigger OFF the sick node. A directed
retry-able transfer (i) with a strong viability gate (ii) is worth building, but it only pays off if
paired with (a) never-shed-into-void ordering and (b) a control-plane path that produces an electable
successor. Without those two, a better-verified transfer primitive still has nowhere to send
leadership and the 66s largely remains.

**Single biggest risk:** any code path that relinquishes the leadership role — including (i)'s
"shed then retry as follower" — when there is provably no electable successor. That reproduces the
exact leaderless void the Quest is trying to close. The invariant must be: *do not leave the role
until a verified successor has been made ready*, and make readying that successor the control plane's
job, not the wedged leader's.
