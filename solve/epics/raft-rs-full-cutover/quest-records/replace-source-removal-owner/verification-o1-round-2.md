# Verification O1 round 2 (fresh verifier, protocol v2 phases 8-9, 2026-09-27)

Subject: the committed-membership read and participation gate (owner
decisions O1/O4) after round 1's REJECT on V1 (stamp-less opening defaulted
to GENESIS) and V2 (admission re-drive missed dropped AddNodes). Production
FROZEN at `d46777ecf` (integration 2: F1, F2, F4, V1a, V2, joint leave);
evidence and records through `eff0357c6` (worktree `o1-gate`, branch
`quest/o1-committed-read-gate`; `git diff d46777ecf..eff0357c6 -- src` is
empty). Read-only; every run below was made on scratch copies under
`scratchpad/verify-o1-r2/` (`mutate.sh` = `git archive` of HEAD, one text
mutation per tree, one file per run after the thermal check). No `src` or
`test` file was changed; this record is the only file written.

Method (phase 8 and the same-root rule): (a) confirm each round-1 item is
closed as a class, not by the example that found it; (b) attack coverage
completeness of the changed production (V1a, V2, F2's consensus exit on the
gate) - a counterexample first asks whether a dimension is missing from the
model of amendment 1 sections 4 and 8; (c) re-run mutations by mechanism and
treat a silent one against a claiming test as a finding. Every finding is
classified NEW MECHANISM or NEW SHAPE.

## 1. Round-1 closure as a class

### V1 - closed (V1a), one residual about the census's granularity (F-4)

- No default exists any more: `bootstrapOfRequest`
  (`src/raft/raft-rs-bootstrap-membership.js:88-109`) has exactly three
  outcomes - DURABLE_RECORD, a stamp that passed
  `validateBootstrapMembershipStamp`, or a thrown typed `STAMP_INVALID`
  (`:41-53`, phase `bootstrap-stamp-validation`, non-retryable, carrying
  `consensus` so `openPartitionConsensusPort` surfaces it as the partition's
  init refusal, `src/partition/partition-consensus-port-opening.js:40-50`).
  `bootstrapPeerIds` is read only by the port's identity registration
  (`raft-rs-operation-port.js:157-159`); no path re-derives GENESIS from it
  (swept `src/raft`, `src/partition`, `src/node`, `src/bootstrap`).
- One validator for every origin: the seed's explicit
  `genesisStamp(options.replicaIds)` (`seed-partitions-phase.js:210`) and
  the provisioner's `genesisStamp(bootstrapTopology.replicaIds)`
  (`sql-query-engine-initial-partition-provisioning.js:565`) are the same
  constructor; the provisioner's stamp passes the handler's
  `resolveStampedBootstrapMembership` (validation + `discoveredOutsideFounders`,
  `replica-handler-committed-membership-methods.js:132-149`) and then the
  port's `validateBootstrapMembershipStamp`; the seed's passes the port's
  only. The GENESIS-vs-existing-group refusal is a handler concern the seed
  does not go through - that is exactly the empty-data-directory cell the
  amendment records as owner decision CR-F5 (section 8 item 3). Confirmed as
  stated there: V1a closes the stamp-less default and no more.
- The snapshot-install replacement opens from `durableRecordBootstrap()`
  (`src/raft/snapshot-catchup.js:335`); the durable rejoin planner too
  (`durable-rejoin-partition-restore-planner.js:258`). The two forwarding
  factories (`bootstrap-service-replica-registration-methods.js:119`,
  `node-joining-publication-activation.js:247`) and the catch-up wrapper
  (`snapshot-catchup-wiring.js:149, 209`) spread their caller's options: the
  handler's validated stamp, a restore plan, or a replacement's bootstrap.
  My own sweep found 10 construction expressions in 7 files, all traced.
- `withFoundingStamp` (`test/partition/partition-founding-stamp.js`) hides
  nothing: production has no default to hide (`partition-service-core-base.js:292`
  keeps `null`, `partition-service-raft-init-base.js:443` omits the field,
  the port refuses MISSING). It only makes test-built founders say what the
  seed now says.
- A GENESIS whose founders omit self stays closed forever
  (`createdParticipationGate`, `raft-rs-participation-gate.js:50-56`): fail
  closed, as round 1 recorded (no witness, unchanged).

### V2 - closed as a class on the leader-local ingress; a second ingress remains (F-1)

- The deferral (`raft-rs-conf-change-admission.js:44-58`) is decided from the
  core's own `pendingConfIndex`/`applied` (the binding's status, camelCase:
  `vendor/raft-rs-wasm/src/lib.rs:322-335, 684-712`) and configuration, read
  in the proposing turn (`raft-rs-runtime-owner.js:968-979`, called from
  `performCommand` `:1290-1294` after the gate check). Checked against the
  crate: `step_leader` (`raft.rs:2062-2090`) drops on `has_pending_conf()`
  (`:2742-2744`, `pending_conf_index > applied`), on `already_joint &&
  !want_leave` and on `!already_joint && want_leave`, where `want_leave =
  cc.changes.is_empty()` (`:2065-2066`) - so the integrator's joint carve-out
  ("a change with no steps") is EXACTLY the crate's rule, not wider (the
  proto's `leave_joint()` also requires transition Auto, but `step_leader`
  does not consult it). The third reason (an empty change outside joint) is
  not deferred, but the port's normaliser builds exactly one change per
  proposal (`raft-rs-operation-port.js:137-139`), so it has no producer past
  the port; a raw `{changes: []}` reaches the crate only from tests.
- The settlement (`:66-84`) counts EVERY decoded conf-change entry the drain
  applied (`raft-rs-runtime-owner.js:806`: no-op RemoveNode and no-op AddNode
  are conf entries too) and the window close (pending before, not pending
  now) for the post-election conservative index and the crate's own
  auto-leave entry; `announce` runs at the end of every drain that ends with
  `has_ready == false` (`:893-895`). Mutation "window close removed" turns
  exactly the post-election kind red (section 4).
- The re-drive (`partition-service-raft-peer-cache-reconciliation.js:372-395`,
  wired in production at `partition-service-raft-init-base.js:481`) runs on
  CONF_CHANGE_APPLIED and on the LEADER role event, takes the in-flight AND
  deferred sets and the deferred retirements, and re-evaluates only those
  ids from their rows: `expectedPeerAddressesOf` skips FAILED/REMOVING/REMOVED
  rows (`:96-104`) and a deleted row is absent, so a just-removed source is
  never re-admitted by the wake. The LEADER-event re-drive lands while the
  new leader's conservative index is pending, is deferred typed, and is
  re-driven by the window close: two hops, both witnessed.
- Forwarded proposals from followers (the implementer's recorded residual):
  reachable in production, and the V2 class is incomplete there - finding
  F-1. It does not matter for admission (AddNode is proposed by the leader
  only, `admitPartitionRaftPeer` role check,
  `partition-service-raft-membership-administration.js:194-197`); it matters
  for retirements.

## 2. Findings

### F-1 - a conf-change proposal forwarded by a follower is dropped silently at the leader: the V2 repair covers one of the crate's two ingresses

Classification: NEW SHAPE of V2's root (the crate replaces a conf change it
will not take with an empty normal entry and answers Ok) at the second
ingress into `step_leader`: a MsgPropose forwarded by a follower
(`step_follower` forwards to `leader_id`), which enters the leader's runtime
through `drainInbound -> step` (`raft-rs-runtime-owner.js:1309-1311`), not
through `performCommand`, so `deferredConfChange` never sees it. The
proposing follower's own status has `pending_conf_index = 0` (the crate
resets it on every term change, `raft.rs:1000`), so its port's deferral
answers null and the port answers `CORE_OK`. A missing model dimension: D8
assumes the proposer is the leader (the chain and port witnesses propose at
the leader); "which replica proposes / which ingress the proposal takes" is
not an axis of section 4.

Reproduction (scratch, real rs-raft ports, `mut-base/test/raft/raft-rs-backend/
verify-o1-r2-forwarded-drop.test.js`, green = the defect shown): A leads
{A, B, C}; A proposes AddNode(x) (pending, effective); B - a follower -
proposes RemoveNode(C) through its own port. Observed: B's port answers
`{outcome: CORE_OK, reason: drained}`; A's durable log after the pending
index: `[3, EntryNormal, data null]` (the RemoveNode replaced by an empty
entry); A's applied voters after settling: four (x admitted, C still a
voter). Nothing records a deferral anywhere; nothing re-drives.

Production producers of a follower's conf-change proposal:

- The row-driven retirement runs on EVERY replica of the partition that
  sees a REMOVING/REMOVED/DELETE row
  (`retireRaftPeerFromAuthoritativeServiceChange`,
  `peer-cache-reconciliation.js:199-247`) and `proposePeerRetirement`
  tracks a deferral only from the port's answer
  (`membership-administration.js:227-240`): a follower's copy is recorded
  PROPOSED and forgotten. The leader's own copy carries the liveness - when
  the leader has one.
- R-1f's RETIRE_REPLICA_PEER is addressed to the REPLACE target t
  (`operation-workflow-replace-witness.js:6-7, 90-99`;
  `replica-handler-membership-methods.js:100-115` ->
  `retirePartitionRaftPeer`, whose contract says so:
  "raft-rs forwards a follower's proposal to its leader",
  `membership-administration.js:365-372`). Before the handoff, or with a
  FAILED source and t not elected, t is a follower. The REPLACE record's AN6
  wakes R-1f on the election's relayed leader/term - exactly when the new
  leader's conservative pending index is set (`raft.rs:1227-1232`) - so the
  forwarded proposal lands in the drop window by construction of the wake;
  R-1f records it issued and re-drives only after its W_max backstop (+61 s
  owner clock). Liveness only.
- A plain REMOVE whose source is the LEADER has ONLY forwarded proposers:
  the leader's own row-driven handler skips itself (`:225`), and the REMOVE
  handler proposes nothing (F2 order: REMOVING -> await exit -> retire,
  `replica-handler-remove-execution-methods.js:282-300`; the exit module
  names "a removal nobody proposed" as a BACKSTOP cause,
  `replica-removal-consensus-exit.js:22-23`). If the leader holds a pending
  configuration index when the forwarded RemoveNode(leader) copies arrive
  (an admission in flight, or the post-election window), every copy is
  dropped silently, nothing is tracked, and the source retires at the 30 s
  backstop (`REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS`) while still a committed
  voter; its row delete then re-triggers proposals whose forward has no
  leader (`step_follower` answers ProposalDropped, `answerRefusedProposal`
  types it, `trackRetirement` records REFUSED, not DEFERRED). The survivors
  keep a phantom voter: n = 3 runs on {a, b} of {a, b, s} (any one failure
  stalls it), n = 2 loses quorum permanently. This is the CR-F2 zombie class
  (operator reseed) with a production trigger instead of a crash.

Severity: bounded liveness in the REPLACE shapes (R-1f's W_max); availability
degradation to reseed in the leader-source REMOVE shape, through F2's named
backstop. The O1 claim (no row grants authority; the gate; typed refusals)
is not touched, and V2's sealed AddNode property holds. What is false is
amendment section 8 item 4's class statement "the runtime answers a
proposal the core would drop as a typed, retryable deferral and never lets
the crate replace it with an empty entry" - true at the leader's port, false
for the forwarded ingress. Required: supersede that sentence (R09); add the
proposer/ingress dimension to the model with this cell as a recorded
residual; the repair is an owner decision because it moves an owner boundary
(who proposes membership removals): the systemic form is one path (R11) -
conf-change proposals are leader-only, a follower's port answers a typed
NOT_LEADER instead of forwarding (the admission path already does this), and
the removal owner proposes a leader-source's own RemoveNode through its own
port (where V2's deferral applies). Not an O1 evidence re-round.

### F-2 - F2's below-gate rule has no witness (mutation silent)

Classification: NEW SHAPE of D9 (below-gate observation) x F2 (the removed
replica's own read), evidence only. `consensusExitOf`
(`replica-removal-consensus-exit.js:57-66`) holds a removed replica while
`gateOpen !== true`; the exit witness
(`test/node/replica-removal-consensus-exit.test.js`) is one two-voter
follower cell with the gate open throughout. Scratch mutation "exit ignores
the gate" (`|| observation.gateOpen !== true` removed): 17/17 green. The
rule is right (below the gate the target's applied configuration is its
bootstrap C_j + self, and its absence from it proves nothing), and item 3's
question is answered from the code: a REMOVING target below its gate keeps
stepping and acking (receiving is never gated), so a pending RemoveNode
that needs its ack commits once it catches up, its gate opens on a_self,
GATE_OPENED wakes the read, MEMBERSHIP_CHANGED on the removal ends the wait;
only a target that cannot catch up within 30 s retires at the backstop, and
such a target was contributing no acks. A target refused
DURABLE_RECORD_MISSING has no port: NO_CONSENSUS_PORT retires it at once and
its identity is a CR-F2 phantom if its AddNode had committed. Required:
one cell in the exit witness (removed while below the gate: no exit on
ABSENT until GATE_OPENED, then REMOVAL_APPLIED) so the mutation goes red;
no production change.

### F-3 - AN11 compares the completion authority's commit index, not its applied index, to C0 (F1 owner question)

Classification: NEW SHAPE of the model's I7 row (commit ahead of apply by up
to 120 s) at the F1 completion authority; recorded for the REPLACE
completion owner, not O1. `completionVerdictOf`
(`operation-workflow-replace-owner.js:196-210`) decides ABSENT from the
leader's APPLIED configuration and guards it with
`observation.commitIndex >= C0`. A leader's applied configuration can lag
its commit by exactly one conf entry (it proposes only with
`pending_conf_index <= applied`, and the `hup` guard means a candidate has
applied every committed conf entry, `raft.rs:1516-1560`); if that one entry
is ADD(s) - s admitted, its ADD committed at the leader, its application
held by persistence admission - the leader answers ABSENT for s at commit
>= C0 with its gate open: SOURCE_RETIRED for a committed voter. Reachability
is narrow (the leader must stay behind on that one entry from s's ADD to
the completion read, while V2 defers t's AddNode behind it), so this is a
timing-window cell for F1's owner to close or record: the sound guard is
the answer's `appliedIndex` (carried by the observation, unused here) and
no pending index above it. No change required of the O1 evidence.

### F-4 - the V1a census counts files, not sites (hygiene, evidence)

Classification: NEW SHAPE of D3 (the creator stamps) in the static census.
`filesMatching(PARTITION_CONSTRUCTION)` (`committed-membership-census.test.js:226-259`)
returns one entry per FILE and asserts one evidence regex per file; two
declared files hold two sites each (`snapshot-catchup-wiring.js:149, 209`;
`node-joining-publication-activation.js:206, 247`). A second, stamp-less
site added to a declared file passes the census and fails only at runtime
(MISSING). Round 2's "third constructor" mutant added a NEW file, so it
could not see this. Required: count sites (every match), not files; no
production change.

### F-5 - unconsumed and hand-listed evidence surfaces (hygiene)

- `CONF_CHANGE_APPLIED`'s `admissible` flag (`raft-rs-conf-change-admission.js:82`)
  has no consumer in `src` (the re-drive ignores its payload,
  `peer-cache-reconciliation.js:372-395`; a re-drive on a non-admissible
  settlement is simply deferred again). Either consume it or drop it (R07:
  an output nobody decides on).
- The admission module's header claims the crate's drop reasons; it covers
  two of three (the empty-change-outside-joint reason has no producer past
  the port normaliser). State the exclusion.
- `partition-admission-redrive-wakes.test.js` is four hand cases on a
  fixture port (settlement without key change, deferred admission,
  leadership gain, deferred retirement), not a range over an enumeration;
  it is the only witness that discriminates the re-drive wiring (section 4),
  so it carries V2's liveness half alone. Acceptable as anchors; record that
  the chain witness proves the property by the cache-reconcile path, as the
  evidence author found.

### F-6 - "R-1a ignores the gate" is equivalent under F1: confirmed, with the proof the record asked for

Not a defect. The authority is the leader's own answer
(`readReplaceCompletionAuthority`,
`operation-workflow-replace-surviving-membership.js:174-195`:
`isLeaderAnswer` = the answering replica's `leaderReplicaId` from its own
core status equals its `replicaId`). A leader's gate is open by construction:
every campaign producer except TimeoutNow is refused below the gate (tick and
proposals at `performCommand` `:1285-1287`, `campaignGroup`, single-replica
init, learner promotion, reconstruction resume `:518-527`); TimeoutNow is
held by U1, which is structural, not timing: the leader tracks t only after
it APPLIES AddNode(t) (`post_conf_change`), so every MsgAppend it ever sends
t carries `commit >= a_self`; t's runtime applies the committed entries of
the drain that steps that append (`finishReady`, `:827-876`), so t either
holds a_self applied (gate open, a_self > j by `admitsReplica`'s
`index > bootstrapIndex`) or unapplied-but-committed, where `hup` refuses
the transfer (`raft.rs:1535-1560`); `matched == last_index` is required
before a TimeoutNow is sent at all. A restart is a follower. Hence
`WITNESS_BELOW_GATE` (`replace-owner.js:203-205`) is unreachable from a
leader's answer and the branch is defence in depth. Below the gate a leader
would in any case answer its bootstrap C_j + self, which names s
(RemoveNode(s) is proposed after t's admission), so STILL_VOTER, never
ABSENT: the B12 anchors' `STILL_VOTER` pin is the right pin.

## 3. What was verified and holds

- Item 1 (V1 as a class): section 1; my sweep of every construction
  expression in `src` (10 in 7 files) traced to a stamp or the record.
- Item 2 (V2 as a class at the leader's port): the crate's drop rule read
  from `raft.rs:2062-2090` matches the module's two conditions exactly; the
  settlement fires on every conf entry (no-ops included) and on the window
  close; leadership gain clears both sets and re-evaluates from rows with
  retiring/deleted rows excluded. Forwarded ingress: F-1.
- Item 3 (F2 on the gate): the removed replica reads its own applied
  configuration only with `gateOpen` true; below the gate it keeps stepping
  and acking; the backstop retires a voter only when it made no progress in
  30 s. A removed LEADER is not stepped down by the crate
  (`post_conf_change`, `raft.rs:2667-2684`, the TODO branch); F2's exit on
  its own MEMBERSHIP_CHANGED retires it and the survivors elect - fine for
  n >= 3, permanent quorum loss for n = 2 (a REMOVE of the leader at RF 2 is
  degenerate; recorded, F2 owner).
- Item 4: F-6 (equivalence proven); the V2 property is carried by the port
  witness (deferral + settlement, ranging over the crate's five kinds) and
  the wakes witness (re-drive wiring), the chain witness by another path -
  as the evidence author recorded.
- Item 5 (dimensions the changed production adds): the stamp-defect
  enumeration is ranged at the port and the handler (anchors "port stamp
  validation", T3); the `admissible` flag: F-5; the deferred-retirement map:
  keyed by identity, cleared and re-proposed on settlement/leadership, a
  repeat is a no-op RemoveNode (a real conf entry, so it costs one deferral
  round to any admission behind it - latency only); the exit backstop:
  item 3; the REMOVING-row rule cluster-wide: every non-self replica
  proposes, the leader's copy is deferral-tracked, duplicates are dropped
  (pending) or applied as no-op conf entries (each announcing a settlement),
  a "wrong replica" is impossible because `retireMatchingRaftAddresses`
  removes only addresses that parse to the row's replica id and are in the
  port's peers; the leader-source case: F-1.
- Guarantee spot checks unchanged from round 1 (gate index `max(j, a_self)`
  written in the application transaction; restore closed on a null
  admission; pre-gate record INCOMPATIBLE; UNREAD gate observes closed).
- Enumerations: `RUNTIME_PHASE` now classified (round-2 item 6 confirmed in
  `evidence-o1-static.test.js`).

## 4. Mutations re-run (scratch copies of HEAD, one file per run)

| Mutation (mechanism) | File(s) | Result |
| --- | --- | --- |
| deferred set inert (`trackAdmission` never adds to DEFERRED) | wakes 9; chain 3 | wakes 1 red ("re-drives an admission the port deferred"); chain 0 red - the recorded non-discrimination confirmed |
| F2 exit ignores the gate (`gateOpen !== true` removed) | exit witness 17 | 0 red - silent: F-2 |
| joint carve-out removed (`!(joint && !leavesJoint)` dropped) | anchors 8 | 1 red (the joint anchor: the AddNode while joint is no longer deferred typed) |
| window close removed (`windowClosed = false`) | port deferral 5; wakes 9 | port 1 red - exactly the post-election conservative-index kind; wakes 0 (fixture-emitted events, out of reach) |
| probe (no mutation): follower proposes RemoveNode behind the leader's pending index | `verify-o1-r2-forwarded-drop.test.js` | CORE_OK at the follower, `[3, EntryNormal, null]` at the leader, C still a voter: F-1 |

## 5. Verdict

APPROVE WITH RECORDED DEFECTS.

Round 1's two items are closed as classes (V1a: one validator, no default,
every construction site traced; V2: typed deferral and settlement re-drive
at the leader's port, ranging over the crate's own drop rule), the O1/O4
claim holds on every cell I could reach, and the mutation matrix is honest.
No finding changes the O1 guarantee. The recorded defects and the exact
changes:

Evidence / records (no re-round; run the property witnesses, anchors and
census only):

1. F-1: supersede amendment section 8 item 4's class sentence (R09) - the
   deferral and the no-empty-entry guarantee hold for proposals made at the
   leader's port; a follower's forwarded proposal is still replaced silently
   at the leader. Add "proposer role / ingress" as a model dimension and
   record this cell as a residual with the reproduction above, owner = the
   removal/REPLACE owners (R-1f's W_max and F2's backstop bound it today).
2. F-2: one below-gate cell in `test/node/replica-removal-consensus-exit.test.js`
   so "exit ignores the gate" turns red.
3. F-4: the V1a census counts construction sites, not files.
4. F-5: state the admission module's exclusion (empty change outside joint,
   no producer); consume or delete the settlement's `admissible` flag;
   record that the wakes witness alone discriminates the re-drive wiring.

Owner decisions (section 9 escalation: an owner boundary moves):

5. F-1 production repair, now or as a scheduled residual: conf-change
   proposals leader-only (a follower's port answers a typed NOT_LEADER, never
   forwards), and the removal owner proposes a leader-source's own RemoveNode
   through its own port. The leader-source REMOVE shape (phantom voter via
   the F2 backstop) is the reason to decide rather than only record.
6. F-3 to the F1 owner: guard SOURCE_RETIRED on the leader's applied index
   (and no pending index above it), not its commit index; or record the
   window with its bound.

Not required: CR-F5 stays the owner's pending decision (confirmed only that
the stamp-less default is closed); round 1's untested D1/D5 cells stand as
recorded gaps.

## 6. Scratch material (never committed)

`scratchpad/verify-o1-r2/`: `mutate.sh` (scratch tree builder from HEAD),
`mut-base` (unmutated, with `verify-o1-r2-forwarded-drop.test.js`),
`mut-deferred-set-inert`, `mut-exit-ignores-gate`,
`mut-joint-carveout-removed`, `mut-window-close-removed`. Every run was one
file, sequential, after `scripts/checks/wait-for-thermal-headroom.js`
(cpu 65C, nvme 68C at start).
