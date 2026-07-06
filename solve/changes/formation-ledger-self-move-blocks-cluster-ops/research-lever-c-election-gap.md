# Lever C research — the post-voter-ready election gap (replica_operations-p1)

Read-only research. Question: why can the replica_operations-p1 raft group not
elect a leader for ~66s after target 4e1551aa reaches voter-ready (07:04:29),
while the liferaft term climbs 2 → 21 (~19 failed election rounds), and can that
gap be closed independently of the persistence wedge (lever A)?

Verdict up front: **C is DOWNSTREAM of A, not a root.** The election storm is the
*expected symptom* of the same non-durable-but-in-memory-acked log that defines
lever A. Closing it at the election layer is a symptom-patch that cannot succeed
while a live voter advertises a phantom-high, non-durable last-log index.

---

## 1. The election / vote path and why ~19 rounds fail (base liferaft)

Provider is `@markwylde/liferaft`, subclassed in `src/raft/liferaft.js`
(`class LifeRaft extends BaseLifeRaft`). The election logic is entirely in the
base package `node_modules/@markwylde/liferaft/index.js`.

- **Free-running promote (the storm engine).** On a heartbeat timeout a follower
  calls `promote()` (`index.js:514-518` → `698-732`). `promote()` **immediately**
  bumps the term and becomes CANDIDATE (`raft.change({state: CANDIDATE, term:
  raft.term + 1})`, `index.js:701-705`), votes for self, broadcasts `vote`, and
  arms an `election` timer that re-fires `promote` after `timeout()`
  (`index.js:727-729`). If quorum is not reached within that window, the next
  `promote` **bumps the term again**. Nothing rate-limits this beyond the election
  timeout.
- **Configured timing explains the cadence.** `src/raft/raft-group-constants.js:60-63`:
  `HEARTBEAT_MS: 150`, `ELECTION_MIN_MS: 1000`, `ELECTION_MAX_MS: 3000`,
  `ELECTION_JITTER_PER_REPLICA_MS: 500`. So each failed round is ~1–3.5s. ~19
  bumps over 66s ≈ 3.5s/round — **a textbook free-running election storm**, not a
  slow single election. The term climb IS successive failed `promote()` calls.
- **Where a candidate wins:** the `voted` handler (`index.js:263-296`) — only in
  CANDIDATE state, tallies grants, and on `raft.quorum(...)` transitions to
  LEADER. `quorum()`/`majority()` (`index.js:431-445`): `majority =
  ceil(nodes.length/2)+1` over PEERS (self excluded), i.e. a real majority of the
  group. To win you need `granted >= majority`.

## 2. Root hypothesis — why no candidate can reach quorum

The blocker is the **up-to-date-log veto** in the `vote` handler, NOT vote/term
persistence:

- `index.js:228-239`: when a log is configured, a voter denies the vote if its
  own log is strictly more up to date than the candidate's:
  `if (term > packet.last.term || (term === packet.last.term && index >
  packet.last.index)) → granted:false`. `packet.last` is the candidate's
  `getLastInfo()` (`index.js:757`).
- **The frozen leader lies about its log.** The persistence wedge (quest
  `formation-ledger-leader-local-persistence-wedge`, run-23 zombie; documented in
  `src/partition/partition-service-durability-fitness.js:10-30`) is a
  BEGIN IMMEDIATE / silently-closed adapter that makes writes **non-durable while
  same-connection reads still see them**. `SQLiteLogAdapter.getLastInfo()`
  (`src/raft/sqlite-log-adapter.js:157-185`) reads `SELECT ... ORDER BY log_index
  DESC LIMIT 1` on that **same wedged connection**, so it returns the
  **phantom-high, non-durable index**. The zombie therefore advertises a last
  index no honest peer can match.
- **Consequence:** the zombie is still a *live voter*. Every honest candidate
  (whose durable log is behind the phantom index) is **vetoed** by the zombie at
  `index.js:234`. No candidate collects majority → every round fails → term
  climbs. This is the ~66s gap.
- **Vote/term durability is NOT the mechanism.** Base liferaft keeps `raft.term`
  and `raft.votes.for` **in memory only** (`index.js:83-86, 246, 701-711`); it
  never calls the adapter's `currentTerm`/`votedFor` setters. Those setters exist
  in `sqlite-log-adapter.js:790-831` but are **vestigial** — the base election
  path does not touch them. So a failing durable store does not block *casting or
  winning* a vote directly; it corrupts the vote **comparison** via the lying
  `getLastInfo()`.

## 3. Election-storm mitigations present / missing

- **Pre-vote: NOT implemented in production.** Grep for pre-vote across
  `src/` + the base package finds only `src/raft/spike/raft-logic-spike-adapter.js:231`
  (`preVote: true`) — a `ThreadedRaftNode` **spike** of an alternative raft, not
  wired into any live partition/message-group path. Base liferaft's `promote()`
  bumps the term unconditionally with no pre-vote round. **The 2→21 climb is
  exactly the missing-pre-vote signature** (disruptive candidates bumping term
  without winning).
- **Randomized timeouts: yes.** `LifeRaft.timeout()` (`src/raft/liferaft.js:417-447`)
  + jitter (`raft-timing-utils.js:44-46`, `ELECTION_JITTER_PER_REPLICA_MS`). Helps
  split-vote convergence but does nothing against a *veto*.
- **Candidacy reluctance / leader-stickiness: yes, and already aimed at this node.**
  `deferCandidacy()` inflates a node's election delay 4× for a 10s window
  (`liferaft.js:73-74, 437-445, 472-475`). The durability-fitness detector calls
  `raft.deferCandidacy()` **every tick while the leader is unfit**
  (`partition-service-durability-fitness.js:308-310`) and `performTrackedLeaderDemotion`
  defers-then-steps-down (`tracked-leader-demotion.js:33-40`).
- **Why the existing mitigations don't close the gap:** they only keep the *zombie*
  from *campaigning*. The zombie still **votes**, and still vetoes every honest
  candidate on its phantom index. Keeping a bad node from running does not help
  when the bad node's *vote* is what blocks everyone else.

## 4. voter-ready → election eligibility (4e1551aa)

Voter-ready DOES make 4e1551aa election-eligible:
- Log string `Replica reached voter-ready activation state`
  (`src/node/replica-handler-constants.js:44`); readiness poll in
  `replica-handler-voter-readiness-methods.js:145-191`.
- Learner→follower promotion clears the election defer and starts campaigning:
  `raft-replica-base.js:431-441` — `checkLearnerPromotion()` sets
  `role=FOLLOWER`, `deferElection=false`, then `this.startElection()`
  ("Learner promoted to follower - now participating in elections",
  `partition-service-constants.js:246`).
- **Eligible ≠ electable.** 4e1551aa can campaign, but its *durable* last index is
  behind the zombie's *phantom* index, so the zombie's `vote` handler vetoes it
  (`index.js:234`). It cannot reach quorum. The rebalancer can even actively drive
  its election (`priority-publication-leader-safety.js:254-322`,
  REQUEST_REPLACEMENT_LEADER_ELECTION / `raftProvider.requestElectionNow`,
  `liferaft-provider.js:276-281`, 1ms immediate timer) — and it **still loses the
  veto**. So driving the election harder does not help; the block is on the vote
  comparison, not on timer scheduling.

## 5. REUSE verdict

- **Config/timer tune — NO (counter-productive).** Lowering the election timeout
  increases disruptive term bumps; raising it just lengthens the stuck window.
  Timing is not the blocker.
- **Candidacy-deferral reuse — already in place, insufficient.** `deferCandidacy`
  (`liferaft.js:472`) and durability-fitness demotion
  (`durability-fitness.js:308`, `tracked-leader-demotion.js`) already exist and
  already target the zombie; they suppress its *candidacy*, not its *veto*.
- **Pre-vote — NEW + large, and does NOT fix this.** No production pre-vote path
  exists (only the `raft-logic-spike-adapter.js` spike). Adding it to base
  liferaft's `vote`/`promote` (`index.js`) is a deep raft-adapter change. And
  pre-vote addresses *disruptive term climbs*, not the *phantom-index veto* — with
  pre-vote the term would stop climbing but the group would still fail to elect
  (the honest candidate still fails the durable-log check against the zombie's
  lie). Pre-vote would make the storm quieter, not shorter.
- **The load-bearing fix is at persistence (lever A):** either the zombie
  advertises its *durable* index (so its veto is honest and a caught-up candidate
  wins) or it is removed from the voter set / its vote muted while unfit. The
  modules that own this are `sqlite-log-adapter.js` (getLastInfo /
  durability watermark, lines 157-185, 316-318) and
  `partition-service-durability-fitness.js` (detect/demote). Making demotion also
  **stop the unfit node from vetoing on a phantom index** is an EXTENSION of the
  existing durability-fitness mechanism — but it is fundamentally a lever-A
  (persistence-honesty) change, not an election-layer change.

## 6. DT-FIRST proof path

The deterministic substrate CAN drive liferaft elections:
- `test/raft/election-jitter-seed.test.js` constructs `LifeRaft` with
  `timeSource: new VirtualTimeSource()` + `randomSource: new SeededRandomSource({seed})`
  — a fully seed-deterministic election clock (the `liferaft.js:388-408`
  timeSource/randomSource seams).
- `test/raft/leader-election-completion.property.test.js` is the shape template:
  "an N-replica group elects exactly one leader within the configured timeout."

Proposed DT proof ("a ledger raft group with a voter-ready node installs a leader
within bounded time under local-persistence pressure"):
1. Build a 3-node `LifeRaft` group on `VirtualTimeSource`+`SeededRandomSource`.
2. Rig one node's log adapter so `getLastInfo()` returns a **phantom-high** index
   (durable index behind the advertised index) — the lever-A wedge in miniature.
   Give the other two honest, caught-up durable logs.
3. Advance virtual time; assert **NO leader is installed within a bounded number
   of ticks** and the term climbs — reproduces the storm (the red state).
4. Apply the persistence-honesty fix (zombie advertises durable index, or its vote
   is muted while durability-unfit); assert a leader is installed within a bounded
   virtual window and the term stops climbing. Red-on-revert via
   `npm run dt:prove -- --test <f> --src <persistence/fitness modules>`.

This binds the observable (leader installed within bounded virtual time) to the
persistence lever, per `dt-must-move-the-binding-observable`. Note: a DT that only
tuned election timers would move nothing — the phantom-index voter still vetoes.

## 7. ADVERSARIAL — is C a symptom-patch?

**Yes. C is strictly downstream of A.** The election cannot complete because a
live voter (the frozen leader/source on replica_operations-p1) advertises a
**non-durable, phantom-high last-log index** via same-connection reads
(`sqlite-log-adapter.js:157-185` over the wedged transaction described in
`durability-fitness.js:25-28`) and vetoes every honest candidate at
`index.js:234`. That phantom index exists *only* because writes are
in-memory-acked but not durable — the exact definition of lever A.

Corollaries:
- Any pure election-layer change (pre-vote, timer tune, harder election drive,
  more candidacy deferral) leaves the veto intact → the group still cannot elect.
  The 2→21 term climb would go quiet under pre-vote but the ~66s stuck window
  would remain until the wedge clears.
- The only way the election *does* complete today is when the wedge resolves
  (durability-fitness 3-strikes → `performTrackedLeaderDemotion` + the transaction
  heals / adapter reopens), after which a caught-up node's durable index matches
  and the veto lifts. That is a **lever-A event**, and the ~66s is the
  strike-window + heal latency, not an election-tuning deficit.
- Sharp form: **you cannot elect around a lying voter.** As long as one member's
  advertised log is a non-durable phantom, correctness (Raft §5.4 leader
  completeness, the very invariant CL-042/`getLastInfo` guards protect) *requires*
  vetoing candidates behind it. Fix the lie (A) and the election closes on its
  own; leave the lie and no C-side mechanism can safely install a leader.

Recommendation: treat C as a **diagnostic consequence** of A. Do not spend a
frontier on pre-vote or election-timer tuning for this wedge; the honest lever is
persistence-truthfulness / unfit-voter muting, owned by
`src/raft/sqlite-log-adapter.js` + `src/partition/partition-service-durability-fitness.js`.
