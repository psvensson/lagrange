# B0: what the participation gate does to Raft ticking (base 585aaa93a)

Finding for the owner ruling of 2026-10-05: "First prove what the
participation gate currently does to Raft ticking." Citations are against
585aaa93a.

## How a gated replica is (not) ticked on the base

1. **The port arms its tick timer only while the gate is open.**
   `startScheduling` in `src/raft/raft-rs-operation-port.js:281-292` refuses
   with `participation-gate-closed` while `dispatcher.participationGateOpen()`
   is false. It records `schedulingRequested`. `rearmOnGateOpened` (:293-299)
   arms the timer only on `GATE_OPENED`.
2. **The runtime refuses a tick for a gated group.**
   `performCommand` in `src/raft/raft-rs-runtime-owner.js:1327-1334` treats
   `tick` as a primitive. With `primitive && !group.gateOpen` it returns
   `participationGateClosed()` and never enters the core. An explicit
   `port.tick()` is refused too.
3. **Partitions stop scheduling for a deferred election and for a joining
   learner.**
   - `src/partition/partition-service-core-base.js:279` sets
     `deferElection = options.deferElection || isJoiningExistingGroup`.
   - `src/partition/partition-service-raft-init-base.js:435` hands it to the
     port as `DEFER_ELECTION`.
   - :480-487 calls `stopScheduling()`.
   - :489-507 (`shouldIgnoreDemotionEvent`) stops scheduling again on every
     FOLLOWER/CANDIDATE event of a joining learner.
   - Scheduling resumes only at `startElection()` (:640-657), which runs from
     the host-level learner promotion (`becomeFollower`,
     `src/partition/partition-service-learner-promotion-methods.js:415-421`)
     or from the bootstrap phases.
4. **A gated joiner is a voter of its own core configuration.**
   - O2: `src/raft/raft-rs-bootstrap-membership.js` `committedBootstrap` opens
     a joiner with `voters = C_j + self`.
   - It is therefore `promotable` in raft-rs. Ticked, raft-rs
     `tick_election` (raft.rs:1081-1092) would step `MsgHup` from inside
     `tick` once `election_elapsed >= randomized_election_timeout`.
   - That is why the gate refuses the tick, and why the host cannot separate
     "advance time" from "campaign" for a promotable core without a fork.

So the core's `election_elapsed` of a gated replica never advances. raft-rs
resets it to 0 on every heartbeat or append from a leader (`step_follower`).

## Why that is a permanent lock-out under native check_quorum

raft-rs ignores a higher-term `MsgRequestVote` or `MsgRequestPreVote` while
`check_quorum && leader_id != INVALID && election_elapsed < election_timeout`
(raft.rs:1330-1356, `in_lease`).

A gated replica that heard a leader once has `leader_id` set and
`election_elapsed` frozen below the timeout. With check_quorum on, it ignores
every vote request from anyone, members included, until its gate opens. Its
gate opens only by applying entries from a leader, and that leader may need
its vote to be elected. This is the same permanent lock-out as B1 (verdict
round 2), produced by the crate instead of the host.

**Real-core probe.** The probe is the mutation "gated replica not ticked"
(head with only the gated-tick admission reverted):
- `native-election-liveness` P3 gated goes red: {n,t} never elect.
- The randomized conf-change differential L goes red.

Mutation table, quest attempt note.

## Every state in which a replica is in a configuration (or asked for votes) but not ticked, on the base

| State | Who | Ticks | Bounded by |
|---|---|---|---|
| Gated COMMITTED joiner (j <= applied < a_self, or below j) | partition ADD/REPLACE target | refused (port, runtime, partition learner stop) | its AddNode application; needs a leader that may need its vote: **unbounded** |
| Restored record below its gate (applied < max(j, a_self)) | restart of such a joiner | refused (runtime) | replay / leader: **unbounded** |
| Joining learner after its core admitted it but before host promotion (`becomeFollower`) | partition joiner | stopped (partition) | the host promotion check: **policy-bounded, not Raft-bounded** |
| Deferred founder election | seed system partitions, seed and created message groups (`deferElection: true`) | not scheduled | `startElection()` in the same bootstrap phase (`seed-partitions-phase.js:326,409`, `seed-message-groups-phase.js:219`, `create-message-group-replica-lifecycle.js:173,294`): bounded |
| Durable-rejoin restored voter | `durable-rejoin-partition-restore-planner.js:271` | not scheduled | `startDurableRejoinLocalPartitionElections` after the batch is recreated (`node-joining-publication-activation.js:167-181`): bounded |
| Held (reseed-required) replica | P1 hold, open-time refusal | none: every operation and delivery answers the hold | permanent by design: the group counts it as unreachable, and no exit exists until the fresh-identity ADD |
| Learner in the committed configuration | ADD_LEARNER | ticked; raft-rs `tick_election` returns before MsgHup while not promotable | n/a |

## Why the gate exists (O1)

A replica that is not yet admitted must not campaign, vote as a member, lead,
commit writes or claim quorum membership. Only the receive/replay needed to
catch up is allowed (owner decision O1, 2026-09-26). The tick refusal was the
host's way to keep a *promotable* gated core from campaigning. It also froze
the core's time, which is harmless only while nothing reads that time. Native
check_quorum reads it.

## Consequence for B1

The gated state must be representable in the core as **not promotable**, so
the core can be ticked like every replica. The joiner opens with itself as a
LEARNER of C_j: it is still named, so O2 holds. The applied AddNode that opens
the gate is the same entry that makes it a voter natively. Ticks then need no
gate, and the gate keeps refusing campaign, proposals, and a tick of a gated
core that is promotable (only a legacy record).

For the same reason the deferred-founder and durable-rejoin deferrals (bounded
by `startElection`) stay host decisions. The joiner deferral and the joining
learner's scheduling stop are removed.
