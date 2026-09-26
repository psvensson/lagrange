# Verification O1 round 1 (fresh verifier, protocol v2 phase 8, 2026-09-26)

Subject: the committed-membership read and participation gate (owner decisions
O1/O4), production frozen at `ab7669fd0` (worktree `o1-gate`, branch
`quest/o1-committed-read-gate`), evidence at `82ec23647` (worktree
`evidence-o1`, branch `evidence/evidence-o1-2026-09-26`; the record
`evidence-o1-committed-read-gate.md` is committed there, the lab cone 194/194
green on `7d5bed7ca`). Read-only on both trees; every run below was made on
scratch copies under
`scratchpad/verify-o1/` (`vtree.sh` = `git archive` of the evidence HEAD, one
text mutation per tree). No `src` or `test` file of either worktree was
changed. Sibling fixes in flight (F1 REPLACE completion authority, F2 removed
source keeps stepping) are not in this tree and were not verified.

Method (phase 8): attack the coverage model of amendment 1 sections 0, 1, 3, 4,
5 first; explore any missing dimension fully; classify every finding as NEW
MECHANISM (a dimension the model lacks) or NEW SHAPE (an instance inside a
modelled dimension, hence a defect of the generic test or generator).

## 1. Findings

### V1 - a replica opened with NO stamp founds a second group under the same partition id (the seed's own bootstrap origin)

Classification: NEW SHAPE of D3 (the creator stamps) x D4 (GENESIS x a group
exists), with a model claim that is false and a census that cannot see the
producer. Severity: violates frozen claim 1 ("a GENESIS founding set for a
partition that no group exists for") on the seed lost-data-directory restart
path; evidence blind.

Mechanism, file:line (production `ab7669fd0`):

- `src/raft/raft-rs-bootstrap-membership.js:67` `const kind = membership?.kind
  ?? BOOTSTRAP_MEMBERSHIP_SOURCE.GENESIS;` and `:78` `const founders =
  membership?.founders ?? bootstrapPeerIds;` - an ABSENT stamp is read as a
  GENESIS of the request's `bootstrapPeerIds` (R07: an outcome inferred from an
  absent value; R11: a second path beside the handler's typed STAMP_INVALID for
  the same absence, `src/node/replica-handler-committed-membership-methods.js:135-138`).
- The seed phase constructs every system partition without a stamp:
  `src/bootstrap/phases/seed-partitions-phase.js:197-214` (`new
  PartitionService({... replicaIds: options.replicaIds ...})`, no
  `bootstrapMembership`); `src/partition/partition-service-core-base.js:292`
  makes it `null`; `src/partition/partition-service-raft-init-base.js:443`
  omits `BOOTSTRAP_MEMBERSHIP` from the port request; the port then opens
  GENESIS from `BOOTSTRAP_PEER_IDS` with `createdParticipationGate`
  (`src/raft/raft-rs-participation-gate.js:50-56`: a founder is admitted at
  index 0, gate OPEN at applied 0).
- The only GENESIS validation against an existing group is the handler's
  `discoveredOutsideFounders` (`replica-handler-committed-membership-methods.js:75-82,
  145-149`); the seed never passes through the handler. `requiresDurableRecord`
  (`raft-rs-participation-gate.js:248-252`) covers DURABLE_RECORD and
  COMMITTED-self only, so O4 does not apply to a stamp-less GENESIS either.
- The amendment claims the opposite: section 2 item 1
  (`committed-read-amendment-1-2026-09-26.md:57`) "a seed restart with a lost
  DB (site 12) [is] closed on the target side by GENESIS validation and O4".
  Challenger A had named this exact cell (F-A1 (b), census row D-restart).
- The static census "exactly two stamp origins"
  (`test/raft/raft-rs-backend/committed-membership-census.test.js:80-92`)
  counts callers of `genesisStamp(` and `committedStampOfAnswer(`; a
  constructor that passes no stamp at all is a third origin it cannot count.

Reproduction (scratch, port level, real rs-raft ports, `verify-o1/tree-base/
test/raft/raft-rs-backend/verify-o1-seed-genesis.test.js`, green = the defect
shown): founder a leads {a}; b joins from the oracle stamp and AddNode(b)
commits, b holds {a, b} open; a's node and database are closed, its file
deleted (the lost data directory), a is rebuilt with a request carrying no
stamp and `bootstrapPeerIds = [a]` (what the seed phase builds). Observed:
`readStatus()` = `gateOpen: true, bootstrapIndex: 0, admissionIndex: 0,
confState.voters: [a]`; `campaign()` = CORE_OK; a leads its own group;
`propose('second-genesis-write')` = CORE_OK and commits at index 2. a's durable
log: `[1, term 1, normal], [2, term 1, normal]`; b's committed log: `[1, term
1, normal], [2, term 1, conf-change AddNode(b)]` - two committed histories at
one (index, term) under one partition id (O-c broken; a's acknowledged write is
truncated the moment b's leader contacts it). The seed hosts every replica of
its founding list on one node (`seed-partitions-phase.js:97-100`), so the
second genesis always has a local quorum.

Reachability: a seed node restarted with a lost or wiped data directory while
joiners hold the system partitions - the hard-cutover "reseed" procedure
applied to a seed. With an intact record the seed restores (verified: T3 (C1),
anchors "GENESIS x durable record"); with a pre-gate record it is refused
INCOMPATIBLE (T5 (C2)). Note that in this scenario the seed's own system-table
cache is lost with the data directory, so a rows-based discovery check could
not have refused it either: closing this cell on the target side needs
challenger A's "live group reachable" probe (F-A1 proposed cells), or an
owner-accepted residual. Either way the amendment's claim must be superseded
(R09), the port must not default an absent stamp to GENESIS, and the census
must count constructors.

### V2 - the admission re-drive never fires when the AddNode was dropped behind a configuration change that applies with no effect

Classification: NEW SHAPE of D8 (admission re-drive) / event "AddNode(self)
dropped": the generic test (M3 "two rows in one turn") ranges over ONE kind of
pending change; the crate drops a proposal behind ANY pending configuration
index, two kinds of which apply without changing the configuration key the
wake-up is keyed on. Severity: liveness (a legitimate join is never admitted
by that leader session; M3's "no permanent lockout" fails), and for this shape
a regression against the base: before T6 the next services-cache change
re-proposed the dropped AddNode (d1-skew-classification.md, case 2); now the
IN_FLIGHT latch refuses every later re-proposal.

Mechanism, file:line:

- raft-rs drops a conf change while `has_pending_conf()` (`raft.rs:2743`:
  `pending_conf_index > applied`), answering Ok and appending an empty normal
  entry (`raft.rs:2063-2090`). `pending_conf_index` is set by EVERY proposed
  conf entry (`:2077`), whatever its effect, and conservatively to
  `last_index` at `become_leader` (`raft.rs:1227-1232`, the leader's election
  no-op entry).
- The re-drive subscribes to MEMBERSHIP_CHANGED
  (`src/partition/partition-service-raft-peer-cache-reconciliation.js:382-390`),
  which the runtime emits only when the ConfState KEY changes
  (`src/raft/raft-rs-runtime-owner.js:967-975`, `announceMembership`). A
  RemoveNode of a non-member (`changer.rs` remove of an absent id is a no-op)
  and an AddNode of a member apply with the key unchanged; so does the
  election no-op entry. No event, no `takeAdmissionsInFlight`
  (`src/partition/partition-service-raft-membership-administration.js:193-197`).
- The dropped AddNode was recorded PROPOSED and latched in flight
  (`:126-147`); every later cache-driven reconcile answers IN_FLIGHT
  (`:175-177`) and proposes nothing. Only a real membership change (which the
  stalled join cannot cause) or a restart of the leader's service clears it.
- Production producers of the no-op kind: R-1f re-drives REMOVE_PEER of the
  source on wakes and after the backstop, documented as "a raft no-op if the
  first one committed" (`src/rebalancer/operation-workflow-replace-owner.js:354-357`,
  BR10 `:325-351`; through RETIRE_REPLICA_PEER
  `src/node/replica-handler-membership-methods.js:100-115` ->
  `retirePartitionRaftPeer`, `membership-administration.js:295-313`); C3
  (`peer-cache-reconciliation.js:181, 269`). The post-election conservative
  index needs only a services-cache change to reach the new leader before it
  applies its no-op entry (admission is row-driven at init and on cache
  changes, never on leadership gain: `partition-service-core-base.js:840-870`).

Reproductions (scratch):

- Port level, `verify-o1-noop-confchange.test.js`: on the leader,
  `proposeConfChange(REMOVE_PEER nc-x)` (non-member) then `proposeConfChange(
  ADD_PEER nc-t)`; both CORE_OK; durable log after: `[2, term 1, conf-change],
  [3, term 1, EntryNormal, data null]` (the AddNode replaced by an empty entry);
  voters unchanged; MEMBERSHIP_CHANGED events emitted: 0.
- Real chain, `verify-o1-noop-redrive-chain.test.js` (PartitionService
  replicas, the production admission path): `retirePartitionRaftPeer(leader,
  'nq-gone')` left pending, the target's services row applied to the leader's
  cache in the same turn. Observed: the retirement answers PROPOSED; the row's
  AddNode is dropped (`[3, EntryNormal, null]` behind `[2, conf-change]`); the
  target is not admitted within 4 s (`voters` = the three founders); a later
  `admitPartitionRaftPeer` for the target answers `IN_FLIGHT`. Duration 5.1 s.

Consequence in the workflow: the target's row exists, the leader's set holds
its identity in flight, the join stalls to the SYNCING budget (300 s); a
REPLACE re-plan reuses the same target id (deterministic intent), so the retry
hits the same latch. Bounded only by an unrelated membership change.

Generic evidence defect: M3 (`evidence-o1-real-chain.test.js:416-472`) is one
hand-picked pending-change kind. The ranging form enumerates the crate's drop
rule: {effective AddNode, effective RemoveNode, no-op RemoveNode (non-member),
no-op AddNode (member), the leader's post-election conservative index} x "the
target's AddNode lands behind it" -> admitted within the bound; mutation "wake
keyed on the configuration key" must go red on the two no-op kinds.

### V3 - claim 2's TimeoutNow wording versus what the gate enforces (concurs with U1; evidence-only)

Classification: NEW SHAPE (B1 cell), already recorded by the evidence author
as unreachable cell U1 under the lead ruling. I checked the ruling against the
crate rather than the prose: `send_append` stamps every MsgAppend with the
leader's committed index (`raft.rs:737`); the follower commits to
`min(m.commit, last_new_index)` (`raft_log.rs:275`), so a target that holds
entry a_self also knows it committed; `hup(transfer)` then refuses on the
pending conf entry in `(applied, committed]` (`raft.rs:1516-1560`) until the
runtime applies it, and the group queue serialises the TimeoutNow behind the
drain in flight. Concur: unreachable through raft-rs replication; the only
producer of "holds a, commit < a" would be a snapshot (excluded, CR-F4). What
must still change: amendment section 0 claim 2 lists TimeoutNow among the
campaigns the GATE holds; the gate does not close that producer (the crate
guard plus the replication invariant do). Supersede the wording (R09) rather
than leave the record and the claim disagreeing. Hygiene, evidence-only.

### V4 - coverage cells with no ranging test (evidence-only)

For each decision of amendment section 4 (line 106) and each event/temporal
row (line 110), what ranges and what does not:

- D1 (which member answers): tested cells = leaderless (NOT_LEADER without
  address -> UNREADABLE), no hint (own node -> UNREADABLE), follower hint (one
  redirect) - `evidence-o1-real-chain.test.js:474-533`, three examples. No
  test: a leader change between hop 1 and hop 2 (second NOT_LEADER), a
  redirect resolving to the hinted node (`committed-membership-bootstrap-read.js:122-125`),
  a delivery timeout crossed at runtime (I6 is static only), the HELD and
  NOT_HOSTED reasons thrown by the creation owner, two local replicas of one
  partition on the answering node (`settleLocalAnswers`,
  `replica-handler-committed-membership-methods.js:62-71`).
- D2 (answer content and label): ranges through the histories and the joint
  anchor; the implementer's T1 covers NOT_LEADER with address, JOINT, HELD on a
  closed port. IDENTITY_UNRESOLVED as a read answer has no runtime test (the
  stamp defect of that name does, T3).
- D3 (the creator stamps): COMMITTED through the real chain (M2, routing);
  the provisioner's GENESIS origin
  (`src/query/sql-query-engine-initial-partition-provisioning.js:565`) is never
  exercised; the stamp-less origin is unmodelled (V1).
- D4 (target validates): every stamp defect ranges from the production
  enumeration (T3, keyed on `COMMITTED_MEMBERSHIP_STAMP_DEFECT`); GENESIS x
  record (C1), GENESIS x foreign replica, COMMITTED-self x no record, COMMITTED
  x record (M4 coordinator re-init) are examples. GENESIS whose founders omit
  self (gate closed forever, fail closed) has no test; the absent stamp at the
  port has none (V1).
- D5 (gate per producer): tick, explicit campaign, write - M1 at every cut
  (ranging over 6 histories x cuts); resume - M4 H1 transient; TimeoutNow -
  the B1 reachability anchor is observational (U1); the learner-promotion
  producer (`partition-service-learner-promotion-methods.js:416-422`
  `becomeFollower -> startElection`) is not exercised (recorded by the author;
  the real-chain M5 tests call `service.startElection()` directly, which is
  the same method, so the port side is covered and only the trigger is not);
  the lone-replica-below-gate init branch
  (`partition-service-raft-init-base.js:585-589`) has no test.
- D6 (restore) ranges over RESTART_POINT x RESTART_CLASS (14 cells,
  `evidence-o1-restart-equivalence.test.js:88-92, 195-280`) - adequate.
- D7 (rejoin) - T5 x4 + C2, M4 before-record - adequate.
- D8 (admission re-drive) - one pending-change kind (V2); "no re-admission of
  a just-removed source" is proven only incidentally by the D1 anchor
  (`bootstrap-committed-membership.test.js:198`, where the implementer's T6
  regression was caught) - it should be an explicit cell of the D8 witness.
- D9 (R-1a below-gate witness) - B12 H1 and H5 shapes; adequate for the
  integration cell (the sibling fixes F1/F2 are outside this tree).
- Temporal rows not tested at runtime: leader change mid-read, read timeout
  crossed. I2 (90 s formation) is not in this evidence at all (A2 gate).
- The M1 histories are a fixed table (`evidence-o1-model.js:63-76`), not a
  generator; acceptable as the enumeration of challenger B's shape classes
  B1-B4 (D = {}, |D| = 1, |D| = 2 odd n, transient sole voter). H9/B3 (the
  retried target) collapses to the A3 refusal under this production (V5).

### V5 - the model contradicts itself on the retried target (hygiene)

Amendment row B5 (line 41) says "a retried target already in C_j has a_self
<= j"; row A3 (line 26) and `requiresDurableRecord`
(`raft-rs-participation-gate.js:248-252`) refuse exactly that target when it
holds no record, and with a record it restores (no bootstrap, no a_self
observation). The "a_self <= j" cell is unreachable; `admitsReplica`'s `index >
bootstrapIndex` guard (`:115-120`) is defence in depth. Supersede the row.
Related residual, already recorded as CR-F2 and confirmed here: a target whose
row admitted it (A2) but whose creation died before the index-0 write is
re-created from the PERSISTED stamp (B14, fine); only a fresh re-plan after the
creating budget reads C_j naming it and is refused DURABLE_RECORD_MISSING -
an operator reseed under the hard cutover.

### V6 - typing gaps (hygiene)

- `committedBootstrap`'s IDENTITY_MISMATCH throws a bare Error with a `defect`
  field (`raft-rs-bootstrap-membership.js:31-36`) that
  `openPartitionConsensusPort` rethrows untyped
  (`partition-consensus-port-opening.js:40-50`, it types only `consensus`
  CORE_REFUSED). Unreachable after the handler's validation (same
  `deriveRaftRsPeerId` derivation, `raft-committed-membership-stamp.js:36-39`),
  but a second, untyped path for one refusal (R11).
- `RUNTIME_PHASE` is not classified in `evidence-o1-static.test.js` (the gate
  phase is a scalar `PARTICIPATION_GATE_PHASE`); a new phase member fails no
  test.

## 2. What was verified and holds

- Oracle independence (item 2): every W run builds its stamp from durable
  bytes on the test's own connection folded over the TEST's genesis
  (`evidence-o1-model.js:223-245` `oracleStamp`, `committed-membership-oracles.js`),
  plants a rows-vs-committed disagreement in every replica's services table
  (`:382-389`) or hands the creation owner rows that omit a committed voter and
  carry a removed founder and a phantom (real chain `:158-192`); a_self and j
  come from the leader's durable log and applied index; the implementation's
  status, stamp and answer are subjects only. The differential M2 compares the
  persisted stamp to the fold and to the row-derived stamp.
- Enumerations (item 3): scratch tree `tree-enum` added one member each to
  `COMMITTED_MEMBERSHIP_REFUSAL`, `RUNTIME_REASON` and
  `RAFT_MEMBERSHIP_ADMISSION_OUTCOME`: `evidence-o1-static.test.js` 3 red
  (tests at `:96`, `:120`, `:157`), 5 green. Conf-change and entry types are
  checked against the binding's own arms (`:169-186`). Stamp defects are keyed
  on the production enumeration in T3.
- The guarantee (item 4): every campaign producer traced to the gate. Tick:
  the `tick` primitive is refused while closed
  (`raft-rs-runtime-owner.js:1250-1252`) and the port arms no timer
  (`raft-rs-operation-port.js:254-260`, re-armed only by GATE_OPENED
  `:262-267`; `configureTick` re-schedules only when a timer existed `:338`).
  Explicit campaign, single-replica init and learner promotion all reach
  `campaignGroup` (`:1083-1086`) or `startScheduling`; reconstruction resume
  checks `group.gateOpen` before `isSoleVoter` (`:513-527`); rejoin restore =
  the record's gate (`restoredParticipationGate`, gate.js:66-73, closed on a
  null admission). Writes and conf-change proposals are refused typed
  (`:1250`). TimeoutNow: U1/V3. The gate index is `max(j, a_self)`
  (`gate.js:81-87`), a_self only from an applied entry above j (`:115-120`),
  written in the entry's application transaction
  (`raft-rs-application-transaction-owner.js:55-59`) and kept by every later
  applied-state upsert (`raft-rs-durable-store-constants.js:150-183`: the
  per-entry upsert never names the gate columns). The j label is the
  observation's own applied index, never core `applied`
  (`raft-rs-runtime-owner.js:1001-1006`). No early opening found: a restore
  with `bootstrap_index` null is closed; a pre-gate record is
  DURABLE_RECORD_INCOMPATIBLE; a held group observes closed
  (`gate.js:130-134`). Vote/term adoption below the gate remains, as the
  amendment allows (section 2 item 3): a real member's tally runs over its own
  committed voters. The one producer the gate does not cover is V1's
  stamp-less GENESIS (gate legitimately open at index 0 for a founder - the
  defect is that it founds).
- Fail-closed typing (item 5): every refusal is a named value of one
  enumeration (`raft-committed-membership-constants.js:74-84`) or a
  `RUNTIME_REASON`; the read refuses before anything is persisted
  (`rebalance-coordinator-operation-creation.js:752` precedes `:814`); the
  handler's refusals carry `code`/`defect` and are not retried
  (`replica-handler-runtime-metadata-methods.js:80-92` retries only the
  metadata-missing prefixes); the port refuses DURABLE_RECORD_MISSING /
  INCOMPATIBLE before `create_node` (`raft-rs-runtime-owner.js:450-461`,
  `:304-316`) and writes the index-0 state only after it (`:477-487`);
  GATE_CLOSED is retryable and distinct from NOT_ACTIVE_VOTER; UNREADABLE
  (host failure, retryable) is distinct from MISSING (non-retryable) - T5.
  Exception: V6.
- Liveness (item 6): re-arm in the drain that opened the gate (T4, M3, < 1 s
  measured, timer armed exactly once); the re-drive is scoped to this leader's
  in-flight admissions (`peer-cache-reconciliation.js:382-390`), so a removed
  voter whose row is still ACTIVE is not re-admitted (the D1 anchor caught the
  earlier regression); RF=1 transfer below a is one typed refusal then
  completion (B13 anchor). Except V2. I2 (90 s) is not derivable from `src`
  and is left to the A2 gate.
- Mutation adequacy (item 7): the three weakest re-run on my own scratch
  trees from the evidence HEAD: "R-1a ignores the gate" -> anchors 1 red (B12
  H1; the H5 shape fails closed through UNRESOLVED, so only one shape reaches
  the gate branch - thin but real); "join mode from a row count" -> real chain
  1 red (GENESIS anchor); "admission not re-driven" -> real chain 2 red (M2,
  M3). All as recorded. Equivalent mutants (j from core applied, resume
  unsuppressed alone) are correctly recorded. Missing mutation class: "absent
  stamp at the port" (no test can turn it red today - V1).
- Static census (item 8): it is a hand-list of expected files
  (`committed-membership-census.test.js:56-201`) checked against regex sweeps
  of every `src` file with comments stripped - a real enumeration of readers
  and carriers, and a new reader or carrier does fail it. It does not
  enumerate constructors of `PartitionService`, so a stamp-less origin (V1)
  passes.

## 3. Verdict

REJECT.

Two findings need production changes inside the sealed O1 scope, and the
evidence could not have caught either:

- V1 (guarantee): a replica opened without a stamp is a GENESIS by default
  (`raft-rs-bootstrap-membership.js:67,78`); the seed builds its system
  partitions that way (`seed-partitions-phase.js:197-214`), so a seed restart
  with a lost data directory founds a second group under each partition id
  while joiners hold the committed one (reproduced: gate open at index 0,
  campaign accepted, a second committed history at index 2). The amendment's
  claim that this cell is closed on the target side (section 2 item 1) is
  false, and the census cannot see a stamp-less origin.
- V2 (liveness, regression for the shape): the admission re-drive keys on a
  ConfState-key change while the crate drops an AddNode behind ANY pending
  configuration index; a no-op RemoveNode (R-1f's documented repeat) or the
  leader's post-election index swallows the dropped AddNode, which the
  IN_FLIGHT latch then refuses to re-propose on every later cache change
  (reproduced end to end on the production admission path: never admitted,
  later admission answers IN_FLIGHT).

What must change for approval:

Production (one implementer, the runtime/membership owner; production stays
frozen for the evidence author until these land):

1. V1: `bootstrapOfRequest` refuses an absent stamp typed (STAMP_INVALID /
   MISSING) - no default to GENESIS; the seed phase passes an explicit GENESIS
   stamp so that every founding goes through the one validator and the census
   counts one origin. Then the lead/owner decides the seed lost-data-directory
   cell (escalation: it changes the release acceptance): either challenger A's
   "live group reachable" refusal for a GENESIS at the port (a typed refusal
   when a founder-listed peer answers a committed configuration), or an
   owner-accepted residual recorded as CR-F5 with amendment section 2 item 1
   superseded. Rows cannot close it (the seed's cache is lost with its data).
2. V2: the re-drive must fire for every applied configuration-change ENTRY
   (or the runtime must answer a proposal the crate would drop as DEFERRED
   instead of PROPOSED, and the in-flight set must be cleared on leadership
   gain); the mechanism is the lead's choice, the property is "a dropped
   AddNode is re-proposed within one applied entry, whatever the pending
   change was".

Evidence (after the production SHA moves; regenerate, do not add hand cases):

3. Census: enumerate every `new PartitionService(` / `createPartitionService(`
   constructor in `src` and assert each passes a stamp or the durable-record
   bootstrap - a third origin fails visibly.
4. D8: one ranging witness over the crate's drop rule's pending-change kinds
   {effective AddNode, effective RemoveNode, no-op RemoveNode, no-op AddNode,
   post-election conservative index} x "AddNode(t) lands behind it" ->
   admitted within the bound; the mutation "wake keyed on the configuration
   key" red on the two no-op kinds; the "no re-admission of a removed source"
   cell made explicit there.
5. Amendment supersessions (R09): section 0 claim 2 (TimeoutNow is carried by
   the crate guard plus the replication invariant, U1); row B5 ("a_self <= j"
   is unreachable under A3); section 2 item 1 (V1).
6. Hygiene, no re-round needed: classify `RUNTIME_PHASE` in the static test;
   type the port's IDENTITY_MISMATCH throw or delete the duplicate check (V6).

Not required for approval, recorded: V4's untested D1/D5 cells (leader change
mid-read, timeout crossed, HELD/NOT_HOSTED thrown, two local replicas, the
promotion trigger, the lone-replica-below-gate branch) are examples the model
names but the evidence does not range over; the lead may accept them as
recorded gaps or fold the D1 ones into one routing witness over the answer
enumeration.

## 4. Scratch material (never committed)

`scratchpad/verify-o1/`: `vtree.sh` (scratch tree builder from the evidence
HEAD), `tree-base` (unmutated, with `verify-o1-seed-genesis.test.js`,
`verify-o1-noop-confchange.test.js`, `verify-o1-noop-redrive-chain.test.js`),
`tree-enum`, `tree-r1a`, `tree-ticksrows`, `tree-redrive`. Every run was a
single file, sequential, after `scripts/checks/wait-for-thermal-headroom.js`.
