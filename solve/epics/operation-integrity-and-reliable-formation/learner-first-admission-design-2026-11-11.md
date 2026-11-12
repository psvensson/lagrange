# Learner-first replica admission through one membership port: design (2026-11-11)

Read-only design unit (subagent) over HEAD 103f132c1 plus the uncommitted tree. Nothing
is built. **Status: proposed; awaiting an independent design vet and the owner's
approval.** Items marked [inferred] were reasoned, not read.

## Bottom line

- Learner-first was designed for partitions in September (R2 design, Step B) and is
  endorsed by the binding Model A direction. It was built only for message groups
  (FreshMG) and that build has no production caller. For partitions it was never
  executed, and no record rejects it.
- The one recorded reason that reads like a voter-first rationale (a formation-order
  deadlock, "voter before fact") is dissolved by learner-first: a learner never counts.
- Recommendation: ADD = AddLearner, then a port-checked promotion. REPLACE = one joint
  ConfChangeV2 {promote target, remove source} with auto-leave, proposed only after the
  target's catch-up is proven. REMOVE = a simple RemoveNode issued from the committed
  operation. Every voter-adding change passes one ingress predicate (etcd's "ready to add
  a voter" rule plus the catch-up proof). Message groups use the same path; the unwired
  FreshMG permit layer is deleted rather than wired.

## A. Current state

**ADD today.** Coordinator creates the operation row and sends CREATE_REPLICA; the target
opens its partition as a learner in its own local ConfState with an application role
LEARNER; it writes services SYNCING and sends ADMIT_REPLICA to the leader
(`src/node/replica-handler-create-methods.js:491-494` ->
`src/partition/partition-replica-admission.js:499-575`). The leader reads the committed
operation row (accepting steps PENDING, SENDING, CREATING, SYNCING, `:127-132`; the header
claims SYNCING only) and proposes **ADD_PEER = raft-rs ADD_NODE, a voter**
(`src/raft/raft-rs-group-membership-admission.js:128-134`,
`src/raft/raft-rs-operation-port.js:178`). The ingress predicate
(`src/raft/raft-rs-conf-change-admission.js:167-219`) checks nothing when a voter is
added. Application "promotion" is then a proof RPC plus `becomeFollower()`, a local role
flip (`partition-service-learner-promotion-methods.js:526`), after Raft already counts
the replica. Only critical system partitions wait for a routable non-learner before
ACTIVE; a non-critical ADD can complete with no admission evidence [inferred].

**REPLACE today.** The target runs ADD (N+1 voters from admission on); on ACTIVE the
owner checks the target's services-row `raft_role` (a row, not ConfState), hands
leadership off a leading source, records STOPPING, and the source is removed by a
separate RemoveNode with two proposers: every replica that sees the REMOVING row in its
CDC cache (`partition-service-raft-peer-cache-reconciliation.js:74-98, 171-222`) and the
coordinator's RETIRE_REPLICA_PEER re-drive. Target death after the intent sends
CANCEL_REPLICA_REMOVAL to the source.

**Where Raft's voter set and the application's membership disagree.** (1) Between the
ADD_NODE commit and `becomeFollower`, ConfState says voter while the role and row say
learner. (2) The leader adds the joiner to `replicaIds` on PROPOSED, before commit. (3) A
non-critical ADD can reach ACTIVE with no committed admission. (4) REPLACE remove safety
trusts the row's `raft_role`. (5) Peers splice a removal subject out of `replicaIds` when
they propose, not when the removal commits. (6) From target admission to the source
RemoveNode the group holds N+1 voters, one unproven: the traced wedge. (7) A failed target
stays a voter until cleanup. (8) The membership read has no LEARNER state. (9) Snapshot
catch-up can only begin after AddNode, so a joiner installing a snapshot already counts.

**Message groups and formation.** Message groups never change membership in production
(the rebalancer parks them; the learner-join capability is never composed; the REMOVE
handler proposes no RemoveNode); `reconcileRaftPeersFromCache` is a latent voter-first
path; `proposeAuthorizedGroup{Learner,Promotion,Removal}` and the repository permit
methods have no src caller. Every system group and mg-1 is founded as three voters on the
seed node; placement then moves replicas out: priority partitions by ADD, ADD, REMOVE,
REMOVE (peak 5 voters, the added ones unproven); the ledger by REPLACE, ADD, REMOVE;
default system partitions with up to two concurrent REPLACEs.

## B. History and supersessions

| Date | Record | What it says |
|---|---|---|
| 2026-09-19 | `solve/epics/formation-seed-decoupling/architectural-guidance-membership-transitions-2026-09-19.md` | Prefers joint consensus; serialize transitions |
| 2026-09-20 | `binding-direction-replica-membership-model-reduction-2026-09-20.md` §6 (binding) | One operation may perform `ADD_LEARNER` -> catch up -> `PROMOTE` -> `REMOVE_OLD`; no separate transition object |
| 2026-09-23 | `solve/epics/raft-rs-full-cutover/design-r2-committed-membership-2026-09-23.md` | "A Lagrange 'learner' is a ConfState VOTER ... a catching-up replica already counts toward quorum"; target: promotion ends in PROMOTE, the joiner is a ConfState learner during catch-up (Step B, receipt R2-6) |
| 2026-10-05 | `solve/epics/raft-rs-full-cutover.md` ~:953-972 | "A target becomes a voter on the row change that records its fact" (avoids voter-before-fact deadlock); also "raft-rs 0.7 learners grant votes" (why the identity gate exists; it stays) |
| 2026-10-07..27 | quest `message-group-fresh-identity-membership` | Built learner/promote/remove permits with a native promotion check; approved 8/8; no proposer ever wired |
| 2026-11-01..02 | `learner-host-from-committed-admission`, `replica-admission-from-committed-operation` | Took R2's request-owner shape "limited to ADD" and kept ADD_PEER; never discussed learner versus voter |

A change supersedes (each by an explicit R09 record): the N3 follow-up sentence above (a
target becomes a *learner* there); the semantics of
`replica-admission-from-committed-operation` ("admitted" = admitted as a learner); the
FreshMG quest statement and receipts if its permit layer is deleted; the "production is
simple-only" premise in `design-replace-source-removal-owner-2026-09-25.md:568-569`; the
application-learner vocabulary of `learner-promotion-progress-proof` and
`formation-voter-surplus-promotion-deferral-livelock`. Kept:
`architecture/contracts/authority-and-recovery.md:212-216` ("retires the old source only
after the required target voter and leadership-handoff evidence"), which joint REPLACE
satisfies atomically.

## C. Target design

1. **ADMIT adds a Raft learner.** Same request, same committed-operation read; the leader
   proposes ADD_LEARNER_NODE with the existing three-key admission context (already an
   accepted shape). Admitting step narrows to SYNCING. A learner is in the leader's
   Progress, so log and snapshot catch-up run before it counts for anything.
2. **Promotion through the same request, decided in the leader's port turn.** The target
   keeps re-sending the idempotent ADMIT_REPLICA. The leader acts on its own ConfState:
   absent -> ADD_LEARNER; learner -> promotion; voter -> ALREADY_VOTER. The promotion
   check runs at the ingress in the same core turn as the proposal: role LEADER, an entry
   of this term applied, `progress[target].matched >= commit > 0`, target is a ConfState
   learner, no pending conf change; bound to the leader's committed membership generation
   index, not the cache publication epoch. Named refusals: `PROMOTION_PROGRESS_BEHIND`,
   `LEADER_TERM_UNAPPLIED`, `NOT_LEARNER`, `CONF_CHANGE_PENDING`,
   `VOTER_ADD_LACKS_LIVE_QUORUM`. No separate proof RPC; the learner never self-reports.
3. **The voter-add rule at the one ingress (`confChangeProposalRefusal`).** For a change
   whose incoming voters gain peer P: (a) P is currently a learner (an ADD_NODE of a
   non-member is refused `ADD_VOTER_NOT_LEARNER`); (b) the catch-up proof holds; (c) with
   V' the resulting voters and G the gained peers, `|live(V') \ G| >= floor(|V'|/2)+1`:
   the new configuration has a live quorum without counting what it adds, and for a joint
   entry the outgoing half too; (d) liveness is the leader's current-tenure record,
   cleared on gaining leadership, answering `LIVENESS_UNSAMPLED` until sampled. With (c)
   the traced wedge cannot be entered. A refusal is a typed wait on CONF_CHANGE_APPLIED,
   LEADER or VOTER_LIVENESS_CHANGED; there is no "add as voter" path.
4. **REPLACE is one joint change** {AddNode D (a proven learner), RemoveNode C},
   auto-leave. It commits under the old configuration; in the joint state the surviving
   pre-existing voters are a majority of both halves, so neither D's nor C's death blocks
   anything; the core proposes the leave itself; coordinator death leaves no decision
   pending. Two simple changes were rejected: with a dead source, promote fails rule (c)
   and the only way forward is remove-first, which contradicts the kept contract, and the
   separate source RemoveNode keeps the cancel race alive. Missing today: a multi-step
   normaliser; the context decoder accepts only one change (a joint entry would make
   every replica fail to resolve the committed entry, so **the decoder is widened before
   any proposer exists**); liveness for both halves.
5. **One meaning of "learner".** The application role becomes a projection of the
   replica's own applied ConfState (VOTER / LEARNER / ABSENT). Deleted: the role flip and
   `becomeFollower` as promotion, the count-check owner, the proof RPC, the
   publication-epoch proof. The membership read gains LEARNER. ACTIVE means "the target's
   own applied ConfState names it a voter" for every partition class, as an event wait.
   REPLACE remove safety reads committed membership.
6. **A failed target never counted.** It stays a learner; cleanup removes a learner, which
   changes no voter and is always committable.
7. **The cancel race.** For REPLACE it disappears: there is no separate source
   RemoveNode, and CANCEL_REPLICA_REMOVAL is deleted for REPLACE. For every remaining
   RemoveNode: (R1) the leader's port takes it only under a removal permit minted in its
   current term from a committed read of the subject's row at the exact REMOVING
   generation, started after the port's revocation counter for that subject last moved;
   the cache-row-driven proposer is deleted. (R2) CANCELLED is answered only by the
   partition leader, in one port turn in which it revokes the permit, has applied an
   entry of its own term, has nothing pending and sees the subject still a voter.
8. **Message groups use the same mechanism.** Delete the cache-row admission; delete the
   FreshMG permit layer and its fences (its in-turn promotion check moves into the
   ingress rule); give message-group REMOVE a RemoveNode through the R1 route. Moving
   mg-1 off the seed and unparking message-group placement remain separate owner items.
9. **Formation.** Priority partitions: +L(J1), promote (4V), +L(J2), promote (5V), remove
   seed replicas one at a time (3V on 3 nodes). Ledger: +L(J1), joint {+J1, -seed
   replica} (3V throughout), +L(J2), promote, remove. Default system partitions: one
   unresolved membership operation per partition, enforced in the planner. At no step
   does a slow or failed joiner count for quorum. Not changed: while all voters are on the
   seed, seed loss is total loss.

## D. Durable state, wire and pins

No existing accepted bytes change. The joint entry with the target's context is a new
accepted shape (decoder widened first; all nodes one version). `replica_operations` gains
no column or step; SYNCING means "ConfState learner", ACTIVE means "committed voter" (a
semantic change recorded by R09). Services `raft_role` is projected from ConfState. Wire:
ADMIT_REPLICA answers gain LEARNER_ADMITTED, PROMOTED, ALREADY_VOTER and the named
refusals; the promotion-proof request and response are deleted; RETIRE_REPLICA_PEER gains
{operationId, replicaGeneration}; CANCEL_REPLICA_REMOVAL is deleted for REPLACE. Whether
any transport pin covers these message shapes was not determined.

## E. Invariants, each with a paired witness on real rs-raft groups from the production entry

- I1: no group's voters (incoming or outgoing) ever contain a replica that has not passed
  the catch-up proof in the current leader term. Fault: drop appends to the target; it
  stays a learner and data writes keep committing.
- I2: no voter-adding change is proposed without a live quorum of the result excluding
  what it adds. {A,B,C-dead} promote D is refused; joint REPLACE C->D succeeds.
- I3: a group is never left with an uncommittable pending conf change while a live quorum
  of its pre-change configuration exists. Kill D at each stage of a REPLACE into
  {A,B,C-dead}; a write and a later RemoveNode commit after each.
- I4: a failed target never counted.
- I5: after CANCELLED no RemoveNode of the subject commits (inherited entry; cache-lagged
  re-drive).
- I6: `raft_role`, ADMIT answers and ACTIVE agree with the replica's own applied
  ConfState.
- I7: a joint configuration always leaves, including across leader death. **To be
  witnessed before the joint REPLACE unit** (the vendored tree lacks `raft.rs`; the
  auto-leave after a leader change is inferred from upstream).
- I8: on a lab three-node formation no control-plane group's voter set contains an
  unproven replica, and a joiner stopped mid-catch-up never stalls system-table writes.
- I9 (static): exactly one src module proposes conf changes; no ADD_PEER for a
  non-learner; no row-driven RemoveNode.

## F. Staged plan (each unit leaves the tree working)

| # | Unit | Size |
|---|---|---|
| U0 | Seal the quest; R09 records; owner confirmation on deleting the FreshMG permit layer | S |
| U1 | Widen the context decoder to the joint shape (decode only); clear liveness on leadership gain | S |
| U2 | Partition ADMIT proposes ADD_LEARNER; the same request drives the promotion at the leader, proof in the port turn; LEARNER membership state; admitting step SYNCING | M |
| U3 | Voter-add rule (a-d) in `confChangeProposalRefusal`; delete the partition-side proof copy | M |
| U4 | Role as ConfState projection: delete `becomeFollower` promotion, the count-check owner, the proof RPC, the publication-epoch proof; ACTIVE = committed voter for all classes; remove safety reads ConfState | L (net deletion) |
| U5 | Joint REPLACE: multi-step normaliser; the owner proposes the joint after a proven learner; delete the separate source RemoveNode and the REPLACE cancel | L |
| U6 | RemoveNode only under an operation-bound permit (R1/R2); delete the row-driven retirement; failed-target learner cleanup | M |
| U7 | Message groups: delete the cache admission and the FreshMG permit layer; REMOVE through the U6 route | L (deletion) |
| U8 | One unresolved membership operation per partition in the planner; the lab formation witness I8 | S-M |

U1 runs beside U2; U3 and U4 can run in parallel if files are split; U5 needs U1 and U3;
U6 follows U5; the three-green-formations acceptance follows U8.

## G. Risks and open points

- The vendored crate lacks `raft.rs`; joint auto-leave across a leader change needs the
  I7 witness first.
- If log compaction can carry a lagging learner past its promoting entry by snapshot, the
  participation gate must open from the snapshot's ConfState.
- Learner catch-up adds one promotion round per formation step; the 60 s sync bound may
  need a recorded revision.
- Deleting the FreshMG permit layer discards reviewed (8/8) but uncomposed work: an
  owner-level choice.
- Transport or message pins for ADMIT_REPLICA, RETIRE_REPLICA_PEER and CANCEL were not
  determined.

---

## Independent design vet, 2026-11-11: REVISE

The core holds against raft-rs 0.7 (the full crate, checksum matching
`vendor/raft-rs-wasm/BUILD.md`, was read from the cargo cache: `raft.rs`,
`confchange/changer.rs`). Joint auto-leave after leader death is supported by source
(`raft.rs:957-983`, `become_leader` sets `pending_conf_index = last_index` at
`:1227-1232`; the host applies committed conf entries before `advance_apply`), the
Changer accepts promote-a-learner plus remove-a-voter in one ConfChangeV2, and an earlier
measurement records "the new leader does leave"
(`formation-seed-decoupling/evidence/raft-backend-evaluation-verification-2026-09-21/round-2.md:179`).
A witness on the production host is still required. This design is NOT approved until
revised and re-vetted.

Blockers:

1. **Rule (c) refuses every change to a one-voter group for ever**, and RF=1 REPLACE is a
   supported, tested case (`test/rebalancer/replace-real-group-handoff.test.js`). etcd's
   rule has an explicit 1 -> 2 exception. The RF=1 path must be named (promote a proven,
   live learner into {A,D} with the exposure recorded, hand off, remove A) with a witness.
   Formation itself is unaffected (system groups are founded with three voters).
2. **Joint configurations are refused across the committed-membership read path**
   (`raft-rs-committed-membership-read.js:98`, `raft-committed-membership-stamp.js:376-377`,
   `operation-workflow-committed-voter-floor.js:47,84`, the removal-subject handoff,
   message-group authorization), and a standing record says "Enabling joint changes later
   invalidates replay over a later bootstrap and requires O1's genesis model"
   (`raft-rs-full-cutover/design-committed-membership-bootstrap-read-2026-09-25.md:40,351`).
   Section B omitted it. Every refusal site must become a bounded wait woken by the leave,
   and the replay statement must be superseded with a witness or shown already satisfied.

Must-fix:

3. R1/R2 as written still let a RemoveNode commit after CANCELLED: the in-memory
   revocation counter does not survive a leader change, and R2 does not order the row
   change before the answer. Keep today's "row compare-and-set from the exact REMOVING
   generation commits before CANCELLED"; the minting leader performs its own committed
   read after gaining leadership; or put the revocation in the partition's log.
4. Joint REPLACE has no stated authorization or terminal rule: bind the proposal to the
   committed operation row; a FAILED decision racing a committed joint rolls forward;
   ADMIT must answer "await joint" for a REPLACE target (otherwise the N+1 shape
   returns); state the hand-off precondition for a leading source and witness the
   removed-leader step-down for a leader that left through a joint.
5. The staging does not leave the tree safe: the voter-add rule before joint REPLACE
   refuses every dead-source REPLACE; two notions of learner coexist between U2 and U4;
   the count-check owner is deleted before the planner has the bound. Order instead:
   U0, U1 plus the I7 witness; U2+U4 merged for partitions; U3+U5 together with the RF=1
   rule; U8; U6; U7. Units U2/U4, U3/U5, U6 and U8 are join-coupled and need the full lab
   formation proof.
6. `matched >= commit` can starve: in formation commit advances at loopback speed on the
   seed while a remote learner trails by a round trip, sampled only on a 1 s re-send,
   against a 60 s sync bound that the sealed quest forbids widening. Use a bounded-lag
   predicate or promote on the leader's own progress event; witness under write load.
9. Deleting the row-driven retirement removes the leader-change re-drive; the coordinator
   needs a wake on that partition's leader change, and the failed-target learner cleanup
   has no R1 route (its row is not REMOVING).

Notes: liveness is already cleared on a term change (`raft-rs-voter-liveness.js:18-24`);
the "missing multi-step normaliser" is an unvalidated raw passthrough to forbid; REPLACE
remove safety already has a committed-configuration credit, with row `raft_role` reads
remaining in `priority-publication-safety-topology.js` and
`move-planner-placement-tail-methods.js`; the role projection and the ACTIVE event must
fire on snapshot restore (compaction now exists); joint gives up "target died, keep the
live source" for live-source moves (state it; the planner re-REPLACEs); a managed split
or merge must exclude a partition holding a learner or in joint; an in-flight old-style
REPLACE at the version switch is drain-or-unsupported.

Experiments owed before the revised design is approved: (i) joint enter, kill the leader
after commit and before the leave; (ii) the outgoing-only source elected leader inside
the joint steps down after the leave; (iii) promotion lag of a remote learner under
steady seed-local write load; (iv) the R1/R2 interleaving.
