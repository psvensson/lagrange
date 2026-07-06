# Research — Lever B: faster reseat after a ledger-partition durability demotion

Read-only. Scope: bound the ~78s leaderless window that follows the durability-
fitness self-demotion of the `replica_operations-p1` leader in run-6, by handing
leadership to a healthy voter promptly instead of the current blind local
step-down.

Context anchor: `verify-model-lever-vs-run6-binding-wedge.md` (the binding wedge
is a self-referential ledger-persistence quorum deadlock; the 07:04:17 demotion
is a *correct* shipped heal `9234e904` that nonetheless leaves the group ~78s
leaderless — target `4e1551aa` voter-ready 07:04:29, no leader until term 21
07:05:35, wedge resolves at handoff to target term 22 07:05:52).

## 1. The demotion mechanism — it is a BLIND local step-down, NOT a directed handoff

The durability-fitness detector, after 3 strikes, calls
`resolveLeaderDurabilityUnfitConsequence`
(`src/partition/partition-service-durability-fitness.js:274-323`). When the node
is leader and a successor is viable it invokes
`performTrackedLeaderDemotion(this)` at **:320**.

`performTrackedLeaderDemotion` (`src/raft/tracked-leader-demotion.js:18-41`):

1. `service.cancelLeaderOwnedActivation()` (:29-31)
2. `raft.deferCandidacy()` (:32-34) — inflate *this* node's own election delay 4x
3. `raft.change({state: FOLLOWER, leader: ''})` (:35-38) — step down, clear leader
4. `raftProvider.startElectionTimer(raft)` (:39) — re-arm the *randomized* timer

There is **no successor argument anywhere in this function**. It sheds leadership
into an empty `leader` field and lets the group's ordinary randomized election
pick whoever times out first (minus the demoting node, which is candidacy-
reluctant). It does **not** send a `STEP_DOWN_REPLICA` / `TimeoutNow`-style
directed election to any chosen voter.

Contrast — a DIRECTED handoff mechanism *does* exist and is used elsewhere:

- The rebalancer emits a `STEP_DOWN_REPLICA` handoff request naming a specific
  `dispatchNodeId`/`replacementReplicaId`
  (`src/rebalancer/priority-publication-handoff.js:114-146`, the
  `REQUEST_REPLACEMENT_LEADER_ELECTION` branch — reason
  `REPLACE_TARGET_LEADER_ELECTION`, and the source-handoff branch :176-191).
- The receiving node runs `handleStepDownReplica`
  (`src/node/replica-handler-remove-request-methods.js:251-354`) →
  `requestTrackedPartitionLeaderHandoff`
  (`src/node/replica-handler-leader-handoff-methods.js:58-92`). For a *follower*
  replacement with reason `REPLACE_TARGET_LEADER_ELECTION` it calls
  `requestTrackedReplacementLeaderElection` (:31-50) →
  `raftProvider.requestElectionNow(raft)`.
- `requestElectionNow` (`src/raft/liferaft-provider.js:276-281`) fires
  `raftNode.heartbeat(1ms)` — an immediate election on the *named* node; note it
  *bypasses* `timeout()` so it is unaffected by any `deferCandidacy` inflation
  (`src/raft/liferaft.js:462-475`, esp. :466-467).

So: the runtime has a "make THIS specific voter hold an election right now"
primitive. The durability demotion does not use it — it uses the undirected
timer path.

Note also that at runtime `resolveLeaderDurabilityUnfitConsequence` does the
demotion *directly*; the `leaderDurabilityUnfitHook` (:321) and
`setLeaderDurabilitySuccessorProbe` (:84-87) seams are **only wired in tests** —
`grep` finds no `setLeaderDurabilityUnfitHook` / `setLeaderDurabilitySuccessorProbe`
caller under `src/` outside the definition. So `hasViableLeaderDurabilitySuccessor`
falls back to its default probe (:89-103): any follower whose ack landed within
10s (`logAdapter.lastFollowerAckAtByAddress`, set at
`src/raft/sqlite-log-adapter.js:336-339`). The demotion therefore already
*computes* that a recently-acking follower exists — and then discards that
identity and re-arms a blind timer.

## 2. Why ~78s with no leader — BOTH "no target" AND "election can't complete"

The blind step-down is a necessary but not sufficient explanation. Two coupled
causes, per the verify doc's adversarial trace:

- **No directed target (this lever's gap).** The step-down names no successor, so
  recovery waits on randomized timers across a group whose viable fresh voter
  (the self-move target) is not being told to stand.
- **The election physically cannot complete (the deeper cause).** The verify doc
  (adversarial point 1) established that scoped to `replica_operations-p1` there
  are **no leader installs at any term 3–20** — the term 2→21 jump is ~19
  *failed* election rounds, "a wedged group that can't elect because candidates'
  logs aren't durable." The same self-referential persistence failure that
  demoted the leader also prevents *any* candidate from having a durable,
  committable log. Right after the demotion the write path returns **"No leader
  available for write operation"** (verify doc point 3;
  `src/constants/errors.js:7`).
- **The orchestrator that would drive a directed handoff is itself down.** On
  self-demotion the node logs "Lost leadership, stopping rebalancing scheduler"
  (`src/rebalancer/rebalancer-constants.js:166`). The rebalancer's existing
  directed escalation (§5) runs on the rebalancer/control-plane leader — which,
  for a control-plane partition like `replica_operations-p1`, is exactly what
  just went leaderless. So the group cannot self-heal via the rebalancer path
  until *some* leader wins first (term 21, 07:05:35), which then restarts the
  scheduler and drives the R3 escalation → target term 22 (07:05:52).

This ordering matters for the lever's ceiling: a directed step-down at demotion
time removes cause #1 and side-steps cause #3 (it does not need the rebalancer
scheduler), **but it cannot beat cause #2** — if the target's log is not durable/
caught-up at 07:04:29, telling it to stand still fails. Something changed by term
21 (zombie transaction released / target caught up) that is not fully pinned in
the evidence; until that change, no honest successor existed.

## 3. Could the demotion do a directed step-down to the self-move target?

Mechanically: yes, the primitive exists (§1) and the demoting node already knows
a viable follower acked recently. But the *right* successor here is not "any
acking follower" — it is specifically the fresh self-move **target** `4e1551aa`
(a NEW voter with no zombie transaction), which is why the wedge only clears when
leadership reaches *that* node (verify doc, causal bookend). The partition-raft
durability detector does **not** carry operation-level knowledge of which
follower is the self-move target; that identity lives in the rebalancer's
operation row (`replacementReplicaId`/`replacementNodeId` in
`priority-publication-handoff.js:128-132`). The default successor probe would
happily pick a *different*, still-degraded voter — see §4.

The information to pick a *durable, caught-up* successor is only partially
available at demotion time:
- Recent-ack timing (`lastFollowerAckAtByAddress`) — present, but acks were
  *in-memory* under the zombie (the fitness comments at
  `partition-service-durability-fitness.js:303-305` note the zombie's in-memory
  log matched followers), so a recent ack does **not** prove durable-log
  freshness. It is exactly the "lying sensor" the memory frontier warns about.
- Which voter is the fresh operation target — NOT available at the partition-raft
  layer; only in the rebalancer.

## 4. Safety

Raft correctness requires the successor to hold an up-to-date *committed* log.
The base liferaft vote path enforces log-freshness (candidate must be at least as
current), but during a durability-degraded window the honest signal of
committed-durability is precisely what is unreliable — recent acks are in-memory
only. Two concrete hazards:

- **Hop-to-a-node-that-also-demotes.** If every existing voter is writing to the
  degraded `replica_operations-p1` quorum, a faster reseat to another stale voter
  just relocates the deadlock: the new leader immediately re-trips the same
  non-durable-write demotion. Nothing in a recent-ack probe distinguishes "fresh
  target" from "peer that will re-demote." The only node that provably breaks the
  cycle is the fresh target with no zombie — which the partition layer cannot
  identify.
- **Directing to a non-durable log** would violate the very invariant `9234e904`
  protects (a leader whose writes are not durable must not lead). A directed
  election bypasses `deferCandidacy` (`liferaft.js:466-467`) but does NOT bypass
  the base vote-freshness check; still, "voter-ready" (membership) ≠ "durable log
  caught up," so a viability gate stronger than the current 10s-ack default is
  required before any directed hop.

Net: a directed reseat is only safe if it targets a voter proven to have a
durable, committed, up-to-date log — and that proof is exactly what the wedge
degrades. This is not a fatal objection, but it means the lever cannot reuse the
existing ack-based probe as-is.

## 5. REUSE verdict — EXTENDED (a directed-escalation mechanism already ships)

**EXTENDED, not NEW.** The exact "abandon the cooperative/blind step-down and
drive a directed election on the voter-ready replacement instead" behaviour
already exists as **Lever A / R1 / R3** for the surplus-drain REPLACE case:

- `src/rebalancer/priority-publication-handoff.js:114-146` —
  `REQUEST_REPLACEMENT_LEADER_ELECTION` dispatches `STEP_DOWN_REPLICA` to the
  named replacement with reason `REPLACE_TARGET_LEADER_ELECTION`.
- `test/rebalancer/r3-handoff-escalate-replacement-election.test.js` /
  `r1-leader-election-ack-proof-starved-rejoiner.test.js` — when a source's
  cooperative STEP_DOWN never fires (starved node), the gate **escalates
  immediately** to driving the healthy replacement's election ("Lever A latency-
  tail reducer … IMMEDIATE once a voter-ready replacement exists").

The lever would EXTEND: (a) `performTrackedLeaderDemotion` /
`resolveLeaderDurabilityUnfitConsequence`
(`partition-service-durability-fitness.js:316-322`) to route the demotion through
the *directed* replacement-election escalation rather than the blind timer, using
the operation's known target; **or** (b) more faithfully to the existing design,
make the rebalancer's R3 escalation fire for a *durability-demoted* source (not
just a starved one) even while the control-plane leadership is itself in flux.
Both reuse `requestElectionNow` / `STEP_DOWN_REPLICA`; neither is greenfield.
This aligns with the standing "avoid new read paths / reuse existing machinery"
directive.

## 6. DT-first proof path

Substrate exists and can force the fault:

- **Fault injection for local-persistence failure is real and deterministic.**
  `test/convergence/dt6-ledger-leader-durability-fitness.test.js` induces the
  exact non-durable-write regime with a real abandoned participant
  `beginTransaction` on a real file-backed sqlite, then drives
  `enforceLeaderDurabilityFitness` on virtual-clock ticks. It already asserts
  detection + demotion signaling — but it is **single-replica** (a solo fixture
  with an injected successor probe) and therefore proves *nothing* about reseat
  latency across nodes.
- **Multi-node raft substrate exists.**
  `test/convergence/dt6-candidacy-reluctance-drain-stepdown.test.js` runs real
  liferaft nodes over `test/distributed/harness/virtual-network.js` +
  `raft-network-host.js` with real vote/append RPCs, a virtual clock, and
  per-node seeded election RNG — fully deterministic. It already measures a
  post-step-down succession outcome ("the drained leader NEVER wins while a live
  caught-up peer exists").

**Proposed DT (EXTENDED from the two above):** host a multi-node
`replica_operations-p1` group on the virtual-network substrate; make one voter a
fresh caught-up target; force the leader's local-persistence failure (the
dt6-durability-fitness abandoned-transaction physics); assert that after the
demotion a **healthy voter is installed as leader within a bounded virtual-time
window**, RED-on-revert when the demotion is the blind timer path and GREEN when
it is the directed hop. The observable to move is *time-to-new-leader*, and the
red-on-revert lever is the directed-vs-blind branch — mirroring the R3 test's
existing red-on-revert construction.

Caveat the DT must honor (else it repeats the E-cheap mistake): the injected
target must model **durable-log caught-up-ness**, not just membership voter-
readiness. A DT that hands off to a mock "ready" follower with no durable-log
gate would go green while the live wedge (cause #2 in §2) stays inert.

## 7. Adversarial — is this root or symptom?

**Honest verdict: a genuine latency bound, but symptom-level for the binding
wedge, not the root cure.**

- The verify doc is explicit that the binding class is the *self-referential
  ledger-persistence quorum deadlock*, and that the persistence failures
  **precede** the demotion (cluster-wide 07:03:37, op's own 07:04:08, demotion
  07:04:17). Reseat latency is a *consequence* of that deadlock, not its cause.
- Strongest refutation: **if all incumbent voters share the self-referential
  persistence failure, reseating faster just relocates the deadlock** (§4). The
  only reason the run-6 handoff *worked* is that it landed on the fresh target
  `4e1551aa`, which carried no zombie. A directed-reseat lever that cannot prove
  it is targeting such a clean, durable voter would, at best, do nothing (no
  honest successor exists yet — cause #2) and, at worst, hop to a peer that
  re-demotes.
- The real root cures named in the verify doc are levers 1 and **3** — break the
  self-reference so a ledger self-move's own progress persistence does not depend
  on the partition being moved. With that fixed, the demotion window shrinks on
  its own because a durable successor exists promptly.

Is reseat latency *the* binding constraint? No — durable-successor *availability*
is. Reseat latency is a real *secondary* constraint: even after a durable
successor exists (≈07:04:29+ once the target is clean), the blind timer path plus
the down rebalancer scheduler cost the remaining ~66-83s before the handoff. So
Lever B is legitimate **defense-in-depth** that bounds the tail *once a clean
successor exists*, and it cheaply EXTENDS shipped machinery — but chosen alone it
leaves the self-reference intact, and a subtly different trigger re-opens the
window. It should be sequenced *after* (or alongside) the off-partition-
persistence root lever, not instead of it.

---

### Executive summary

- **Mechanism (confirmed):** the durability-fitness demotion is a BLIND local
  step-down — `performTrackedLeaderDemotion` (`tracked-leader-demotion.js:18-41`)
  sets FOLLOWER + empty leader + deferCandidacy + re-arms a *randomized* timer; it
  names no successor. A directed-handoff primitive (`requestElectionNow` /
  `STEP_DOWN_REPLICA`) exists and is used by the rebalancer, but the demotion does
  not use it.
- **Why ~78s leaderless:** BOTH "no target picked" AND "election can't complete
  because candidates' logs aren't durable" (verify doc: no leader at terms 3-20),
  compounded by the rebalancer scheduler stopping on leadership loss. Faster reseat
  fixes only the first.
- **Feasibility:** mechanically feasible; the hard part is SAFE successor
  selection — recent acks are in-memory (a lying sensor), and only the fresh
  self-move *target* breaks the cycle; the partition layer can't identify it.
- **Reuse:** **EXTENDED** — the identical "escalate to the voter-ready
  replacement's directed election" already ships as Lever A / R1 / R3
  (`priority-publication-handoff.js:114-146`; r1/r3 rebalancer DTs). Prefer
  extending that escalation to cover durability-demoted sources over a new
  primitive.
- **DT path:** multi-node virtual-network raft substrate
  (`dt6-candidacy-reluctance-drain-stepdown` host) + the real local-persistence
  fault physics (`dt6-ledger-leader-durability-fitness`); assert time-to-new-leader
  is bounded, red-on-revert on the directed-vs-blind branch. Must model durable-log
  caught-up-ness, not mere voter-readiness, or it repeats the E-cheap mock trap.
- **Biggest risk / honest take:** SYMPTOM, not root. If all incumbents share the
  self-referential persistence failure, faster reseat relocates the deadlock; it
  only helped in run-6 because leadership reached the clean fresh target. Reseat
  latency is a *secondary* constraint (durable-successor availability is the
  binding one). Worth doing as defense-in-depth that cheaply extends shipped
  machinery, but sequence it after the off-partition-persistence root lever (verify
  doc lever 3), never instead of it.
