# External-practice verify: durability honesty vs "unfit-voter veto-recusal"

**Question under test:** Our bug is a Raft leader whose *local* durable log write (sqlite) has
wedged/timed-out, yet the leader has **advanced its in-memory last-index** — a "phantom-high,
non-durable index." Because Raft §5.4 makes a voter veto any candidate whose last log index/term
is behind the voter's own, this zombie **vetoes every honest, genuinely-durable candidate**, causing
a ~19-round / ~66–78s election storm until leadership luckily lands on a fresh node.

**Proposed fix under consideration:** make a durability-**unfit** voter **recuse** from the §5.4
up-to-date veto (grant votes it otherwise would deny), so an honest durable candidate can win.

**Verdict in one line:** Mainstream Raft practice **does not endorse veto-recusal**. It says the
phantom-high index is itself an **invariant violation** — the fix is **durable-before-advertise**
(never let the phantom index exist), backed by **leadership transfer** and **Pre-Vote/CheckQuorum**.
Vote-recusal is a smell: it patches a lie downstream instead of not lying.

---

## Q1 — Durable-before-ack / persistence invariant

**Established practice.** Raft's correctness proof assumes a server never claims to hold a log
entry it has not durably persisted. etcd/raft makes this explicit and mechanical:

- etcd/raft `AsyncStorageWrites` doc: *"All writes performed in service of a `MsgStorageAppend`
  **must be durable before response messages are delivered**. However, if the `MsgStorageAppend`
  carries no response messages, durability is not required."* The `MsgStorageAppend` → response
  handshake is precisely the **gate that withholds `MsgAppResp`/matchIndex advancement until the
  entry is on stable storage** — a follower's `MsgAppResp` cannot be sent until the corresponding
  `MsgStorageAppend` is acknowledged. (`go.etcd.io/raft/v3` package docs;
  [PR #14627 "support asynchronous storage writes"](https://github.com/etcd-io/etcd/pull/14627).)
- Raft-dev thread "fsync, crashes, and guarantees": Archie Cobbs — *"the proof of Raft's
  correctness relies on the assumption that when a node says it has persistently appended X, Y, Z
  to the log, then the only possible future scenarios after a crash are (a) the node can actually
  recover X, Y, Z, or (b) the node is completely lost."* Ensar Basri Kahveci — a node that lost a
  previously-acknowledged record *"could participate in election of other leader, who has never
  known about lost records."* Andy Schwerin's practical corollary: if you don't fsync before
  acknowledging, a crashed node must be treated as **permanently lost** and reconfigured before
  rejoining. ([raft-dev](https://groups.google.com/g/raft-dev/c/tfLgQfdVLnk).)
- Raft thesis §3.8 / §10.2.1 and etcd/TiKV both persist the log (and vote/term/commit) to stable
  storage before the entry counts; the leader/follower parallelism optimization
  (send-before-sync) is bounded exactly so a leader "can commit an un-synced log accidentally"
  never happens — the un-synced entry must not be advertised as committed.
  ([etcd #12257 fsync frequency](https://github.com/etcd-io/etcd/issues/12257).)

**"Advertising a non-durable entry" is a recognized violation.** Our zombie advertising a
phantom-high last-index in RequestVote/AppendEntries is exactly the class of behavior the invariant
forbids. The standard remedy is **"never advertise non-durable state" (fix the log layer)**, not
"let peers ignore a lying voter."

**Implication for the proposed fix:** **REDIRECT.** The root is that our sqlite-wedged leader
advances/advertises a non-durable index. Enforce durable-before-advertise so the phantom index
never exists; peers then never face a lying veto to route around.

---

## Q2 — Disruptive election storms (Pre-Vote / CheckQuorum / leases / randomized timeouts)

**Established practice.** Ongaro thesis §9.6 (Pre-Vote) and §6.2 (CheckQuorum) plus randomized
election timeouts are the canonical anti-storm machinery:

- **Pre-Vote** (`go.etcd.io/raft/v3`): *"a pre-election is carried out first … and **no node
  increases its term number unless the pre-election indicates that the campaigning node would
  win.** This minimizes disruption when a partitioned node rejoins the cluster."*
  ([etcd PR #9352 configure Pre-Vote](https://github.com/etcd-io/etcd/pull/9352).) This is the
  direct cure for the "term climbs 19×" symptom — a candidate that can't win never bumps the term.
- **CheckQuorum**: *"Leader steps down when quorum is not active for an electionTimeout."* A leader
  that cannot reach a durable quorum voluntarily relinquishes leadership. (`go.etcd.io/raft/v3`.)

**Crucial caveat for our case.** Pre-Vote defends against a *disruptive rejoining candidate*. Our
wedged node is the **incumbent leader/voter**, not a losing candidate — so **Pre-Vote on the
zombie does not directly fix us.** What is on-point is **CheckQuorum**: an fsync-wedged leader that
cannot commit should detect it cannot serve a quorum and **step down** (see etcd
[#15247](https://github.com/etcd-io/etcd/issues/15247): "leader stuck in fdatasync → raft layer
steps to follower"). The residual storm is because a stepped-down-but-still-voting zombie keeps
vetoing; the correct suppression is (a) it stops advertising phantom state (Q1) and (b) it hands
off via transfer (Q3) — **not** that healthy peers learn to disbelieve its veto.

**Implication for the proposed fix:** **REDIRECT.** Pre-Vote + CheckQuorum + randomized timeouts
are the idiomatic storm controls; our lever "election-gap / faster reseat" maps to CheckQuorum-style
step-down, not to disabling §5.4 on peers.

---

## Q3 — Leadership transfer to a specific caught-up target

**Established practice.** Raft thesis §3.10 leadership transfer, implemented as
etcd `TransferLeadership` / TiKV `transfer_leader`, sends **`MsgTimeoutNow`** to a chosen
transferee so it starts an election immediately — **but only after the leader confirms the
transferee's log is up-to-date** (TiKV first appends lagging entries, bounded by
`raftstore.leader-transfer-max-log-lag`, then sends `MsgTimeoutNow`).
([etcd/raft raft.go](https://github.com/etcd-io/raft/blob/main/raft.go);
[TiKV #10602](https://github.com/tikv/tikv/issues/10602);
[etcd #5020](https://github.com/etcd-io/etcd/issues/5020).)

**"Leader detects own storage unfitness → directed transfer to a durable, caught-up voter" is an
established pattern.** Precisely this is used for *safe demotion*: Moby SwarmKit
[PR #1939](https://github.com/moby/swarmkit/pull/1939) "Use TransferLeadership to make leader
demotion safer," and etcd/raft's `StepDownOnRemoval` (leader steps down when removed/demoted).
This is the idiomatic realization of our "faster reseat on demotion" lever.

**Implication for the proposed fix:** **SUPPORTS the transfer lever, REDIRECTS away from
recusal.** The correct move when a leader knows its store is unfit is a **directed
`TransferLeadership` to a durable caught-up voter**, not to weaken §5.4 vetoes cluster-wide. Note
the ordering constraint: a wedged leader that has *already advertised* a phantom-high index cannot
find a "caught-up" transferee (nobody matches its lie) — which again reduces to Q1: don't create
the phantom index.

---

## Q4 — Vote-recusal for unhealthy voters (the exact proposal)

**Established practice: there is no such mechanism.** No mainstream Raft (etcd, TiKV/raft-rs,
Hashicorp raft, Consul, Vault, CockroachDB) has a voter that, on detecting its **own** storage is
unhealthy, **relaxes the §5.4 up-to-date test and grants votes it would otherwise deny**. The
universal answer to an unhealthy voter is the opposite:

- **Step down and stop advertising**, not "keep voting but lie the other way." etcd/raft
  `StepDownOnRemoval`; CheckQuorum step-down; the raft-dev consensus that a node that can't honor
  its durability claims must be treated as lost and **reconfigured out**, not left voting.
  ([raft-dev fsync thread](https://groups.google.com/g/raft-dev/c/tfLgQfdVLnk).)
- **Learners / non-voting members** (etcd 3.4): the sanctioned way to have a node "not count toward
  quorum / not vote" is to make it a **Learner** — *"joins as a non-voting member … does not count
  towards the quorum."* An unhealthy node is **demoted to non-voter (or removed)**, it does not
  selectively recuse from one clause of the vote rule.
  ([etcd 3.4 announcement](https://kubernetes.io/blog/2019/08/30/announcing-etcd-3-4/);
  [dev.to learners](https://dev.to/simplytunde/etcd-cluster-and-non-voting-learners-4l0b).)
- CockroachDB **demote-then-remove**: never remove/neutralize a voter directly; demote to non-voter
  first, then remove — preserving quorum math throughout.
  ([etcd #12359 apply-time config-change liveness](https://github.com/etcd-io/etcd/issues/12359).)

The §5.4 up-to-date veto is a **safety** property — it is what prevents a stale node from erasing
committed entries. Selectively disabling it on a "self-assessed-unfit" node is dangerous because
the assessment ("am I unfit?") is made by the very component (local storage / its own view of its
index) that is malfunctioning — you'd be trusting a lying sensor to decide when to stop enforcing
safety. (This is the same "you can't build a deadband on a lying/stale sensor" verdict already
recorded for Path H in this change's research.)

**Implication for the proposed fix:** **CONTRADICTS.** Veto-recusal is **not** idiomatic and is a
safety smell. The idiomatic equivalent of "this voter shouldn't block progress" is **demote it to a
non-voter / remove it / make it step down** — a *membership/role* change, executed while quorum is
intact — never a per-node relaxation of §5.4.

---

## Q5 — Self-referential metadata (storing the move's driver inside the group being moved)

**Established practice.** Raft membership changes are logged **in the group itself** (thesis §4;
single-server change §4.1, joint consensus §4.3), and safety during the change is preserved by
**joint consensus / atomic replication changes**, not by taking the metadata out of band:

- CockroachDB "[Joint consensus in CockroachDB](https://www.cockroachlabs.com/blog/joint-consensus-raft/)":
  the change transitions through an intermediate joint config where *"making a decision requires
  agreement of a majority of C₁ **as well as** a majority of C₂"* — so no single-config quorum can
  unilaterally decide, and the change is **atomic** (no unsafe add-then-remove intermediate).
- The **range descriptor** (which *is* the membership metadata) is updated *by* the range's own
  Raft, and **demote-before-remove** guarantees the range never loses the quorum needed to *record*
  its own progress: a departing voter is first turned into a non-voter (still receiving log, no
  longer required for majority) before removal, so the in-group log that carries the descriptor
  update always retains a live majority to commit it.
  ([CockroachDB #12768 "Rebalances must be atomic"](https://github.com/cockroachdb/cockroach/issues/12768);
  [replication layer docs](https://www.cockroachlabs.com/docs/stable/architecture/replication-layer).)

The general safety rule: a reconfiguration must **never drop below the quorum that records that
reconfiguration**. Joint consensus + demote-before-remove is exactly the mechanism that keeps the
"move progress" recordable even though it lives inside the moving group.

**Implication for the proposed fix:** **REDIRECT / orthogonal.** If our ledger self-move can wedge
because the partition that would record its own move loses durable quorum (the sqlite-wedged leader
vetoing replacements), the idiomatic protection is **atomic, quorum-preserving reconfiguration
(joint-consensus / demote-before-remove)** and durable-before-advertise — not letting peers ignore
a §5.4 veto to force the move through a degraded quorum.

---

## OVERALL VERDICT

**Mainstream practice does not endorse "unfit-voter veto-recusal" as the root fix. It points to a
different root.** In priority order:

1. **Durable-before-advertise (the actual root).** etcd/raft is categorical: *"All writes performed
   in service of a `MsgStorageAppend` must be durable before response messages are delivered."* A
   leader/voter must never advance or advertise a last-index it has not fsynced. Our
   **phantom-high, non-durable index is the bug** — eliminate it and the lying veto disappears at
   the source. This is the invariant-level fix; everything else is symptom management.
2. **CheckQuorum step-down + Pre-Vote** for the storm: a leader that cannot reach a durable quorum
   steps down (CheckQuorum); term-bumping is suppressed by Pre-Vote. (Note Pre-Vote helps the
   *cluster*, not the incumbent zombie — the zombie's fix is #1 + #3.)
3. **Directed leadership transfer** (`TransferLeadership`/`MsgTimeoutNow` to a durable caught-up
   voter, à la SwarmKit safe-demotion / `StepDownOnRemoval`) — this is the idiomatic form of our
   "faster reseat on demotion" lever.
4. If a voter must stop obstructing, **demote it to a non-voter / remove it via atomic
   (joint-consensus) reconfiguration** — never relax §5.4 per-node.

**Is our proposed direction idiomatic? No — it is a smell.** "Recuse the unfit voter from the §5.4
veto" trusts the malfunctioning node's self-assessment to disable a *safety* property, and it
treats the symptom (a lying veto) rather than the cause (a node advertising non-durable state). The
idiomatic root cause fix is **durability honesty**: never advertise a non-durable index; when local
storage is unfit, **step down and directed-transfer** to a genuinely-durable, caught-up voter, and
change *roles/membership* (demote/remove) atomically rather than weakening the vote rule. This
independently corroborates the Path-H "can't build a deadband on a lying sensor" NO-GO already in
this change's research.

---

### Sources
- etcd/raft `AsyncStorageWrites` — durable-before-response invariant: [PR #14627](https://github.com/etcd-io/etcd/pull/14627), package docs [go.etcd.io/raft/v3](https://pkg.go.dev/go.etcd.io/raft/v3)
- raft-dev "fsync, crashes, and guarantees": https://groups.google.com/g/raft-dev/c/tfLgQfdVLnk
- etcd fsync-frequency control: [#12257](https://github.com/etcd-io/etcd/issues/12257)
- etcd Pre-Vote config: [PR #9352](https://github.com/etcd-io/etcd/pull/9352); CheckQuorum + Pre-Vote docs: [go.etcd.io/raft/v3](https://pkg.go.dev/go.etcd.io/raft/v3); Ongaro thesis §9.6 / §6.2
- etcd leader stuck in fdatasync → steps down: [#15247](https://github.com/etcd-io/etcd/issues/15247)
- Leadership transfer / MsgTimeoutNow: [etcd/raft raft.go](https://github.com/etcd-io/raft/blob/main/raft.go), [TiKV #10602](https://github.com/tikv/tikv/issues/10602), [etcd #5020](https://github.com/etcd-io/etcd/issues/5020); safe-demotion via transfer: [SwarmKit PR #1939](https://github.com/moby/swarmkit/pull/1939)
- Learners / non-voters + demote-before-remove: [etcd 3.4](https://kubernetes.io/blog/2019/08/30/announcing-etcd-3-4/), [dev.to](https://dev.to/simplytunde/etcd-cluster-and-non-voting-learners-4l0b), [etcd #12359](https://github.com/etcd-io/etcd/issues/12359)
- CockroachDB joint consensus / atomic replication changes: [blog](https://www.cockroachlabs.com/blog/joint-consensus-raft/), [#12768](https://github.com/cockroachdb/cockroach/issues/12768), [replication layer](https://www.cockroachlabs.com/docs/stable/architecture/replication-layer)
- Raft thesis (Ongaro): §3.8/§10.2.1 durability, §3.10 leadership transfer, §4 membership changes, §5.4 up-to-date election restriction
