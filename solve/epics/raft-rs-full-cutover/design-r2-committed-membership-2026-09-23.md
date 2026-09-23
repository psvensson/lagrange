# Design: R2 committed-membership cleanup (epic raft-rs-full-cutover)

Read-only design on worktree `.claude/worktrees/raft-rs-write-path`, HEAD
fe70eb76ef2 (branch quest/raft-rs-single-path-partition-cutover). Every
file:line is on that head; paths are repository-relative. Two read-only raw-core
probes (no cluster, store, network) sit beside this file:
`probe-confchange-context.{mjs,out}`, `probe-joiner-empty-config.{mjs,out}`.
No repository file changed, no git write ran, no suite ran.

## 0. Measured facts the design rests on

- M1 ConfState is already the durable, restorable membership record: written
  with the applied index in one transaction
  (`src/raft/raft-rs-durable-store.js:297-306`), read with the record
  (`:335-368,461-465`), restored as `bootstrap.confState` with `peers: []`
  (`src/raft/raft-rs-runtime-owner.js:384-404`, `:387`); every committed
  conf-change entry is decoded, applied and set in the core before the
  application transaction (`:766-788,800-807`). The restore path cannot reach
  a cache (`test/raft/raft-rs-backend/restart-from-durable-record.test.js:246,271`).
- M2 The bootstrap list matters only when no durable record exists
  (`runtime-owner.js:387`); it is `PartitionService.replicaIds`
  (`src/partition/partition-service-raft-init-base.js:453`), each name
  reserved at port creation (`src/raft/raft-rs-operation-port.js:134-138`).
- M3 A Lagrange "learner" is a ConfState VOTER. `ADD_LEARNER` has no caller in
  src (only the port table, `raft-rs-operation-port.js:106`); admission
  proposes `ADD_PEER` (`src/partition/partition-service-raft-membership-administration.js:81-85`);
  the F16 witness asserts the joiner in `confState.voters`
  (`test/raft/raft-rs-backend/partition-peer-admission.test.js:227-231,243`).
  The joiner's role is LEARNER with election deferred
  (`raft-init-base.js:530-541`, `src/partition/partition-service-core-base.js:309`);
  "promotion" is a local role flip with no port operation
  (`src/partition/partition-service-learner-promotion-methods.js:416-422,559`).
  So a catching-up replica already counts toward quorum (design.md §7 A7.4).
- M4 Peer identity is a sha256 digest of the replica name
  (`src/raft/raft-rs-peer-identity.js:58-69`), reserved locally in
  `_raft_rs_peer_identity` (`src/raft/raft-rs-peer-identity-constants.js:9-14`),
  append-only (`raft-rs-peer-identity.js:22-24,111-125`). A digest is not
  invertible: a replica resolves only ids it reserved itself (`:154-163`).
  Reservations: self + bootstrap list (port `:134-138`); a joiner on the
  LEADER only, from its cache row
  (`src/partition/partition-service-raft-peer-cache-reconciliation.js:276-283`
  -> `membership-administration.js:17-26` ->
  `src/raft/raft-rs-membership-administration.js:19-34` -> port `:142-147`).
  A follower that never saw the row reports the peer UNRESERVED
  (`src/raft/raft-rs-status-observation.js:27-31`; F17's throw is gone) but
  cannot deliver to it: `resolvePeerAddress` throws (port `:169-177`) and the
  send is recorded FAILED (`runtime-owner.js:724-731`). A follower that becomes
  leader cannot append to a peer it never reserved (F17 residual).
- M5 The binding carries a conf-change `context` end to end
  (`vendor/raft-rs-wasm/src/lib.rs:288,300-308,728-737,757-799,1054-1068`).
  Probe 1: it round-trips propose -> commit -> decode (`contextRoundTrip:
  true`), `apply_conf_change` of the decoded change yields the learner, and a
  change without context decodes with no field. The runtime decodes before
  applying (`:768-771`), so `decoded.value.context` is available where every
  replica applies. The port never sets it (`:98-123`).
- M6 A joiner created with an EMPTY configuration reconstructs membership and
  identities from the log alone, if every membership fact is in the log.
  Probe 2: `create_node({peers: [], learners: []})` succeeds, `promotable:
  false`; after the seed's idempotent `AddNode(self)` carrying its identity
  (index 2) and the leader's `AddLearner(J)` with J's identity (index 3), J
  observes `{voters: [1], learners: [2]}` and decodes both identities; after
  `AddNode(J)` J is promotable; after `RemoveNode(J)` it observes
  `{voters: [1]}` and is not. Without the seed's self-entry the same joiner
  saw `{voters: [], learners: [2]}` and refused `removed all voters` (first
  run): a configuration set at `create_node` is NOT in the log.
- M7 raft-rs does not refuse a second conf change while one is pending: both
  accepted, the second became an empty entry (probe 2, commit 4 -> 6). The
  status exposes `pending_conf_index` and `promotable`
  (`lib.rs:333-334,686-687,710-711`); the shaped status does not surface them
  (`status-observation.js:113-130`).
- M8 After a committed removal the removed peer's late acks are refused by
  the leader's core (`cannot step as peer not found`, probe 2 `stepRefusals`,
  msgType 4); in the runtime a typed step outcome (`runtime-owner.js:1169-1173`).
  Ingress admits any `from` (`src/raft/raft-rs-ingress.js:57-74`): F-ab, R5.
- M9 `src/raft/raft-rs-membership-projection.js` (the designed one-way
  projection, `:33-41,52-58,69-80,88-170,181-185`) has ZERO src importers;
  only `test/raft/raft-rs-backend/conf-state-authority.test.js:181-183,220-222`.
- M10 Nothing in src/rebalancer, src/control-plane, src/node reads `confState`
  or `readStatus().peers`; their only "membership generation" is the
  PUBLICATION epoch (`src/rebalancer/spread-cure-transition-authorization.js:401-407`,
  `src/rebalancer/operation-workflow-dispatch-epoch-gate.js:33-34,111`), blind
  to replica changes (memory: no-committed-raft-membership).

## 1. Census: every path deriving or mutating membership from something other than ConfState

Classes: DELETE, REPLACE (same concern, new owner), KEEP-POLICY, KEEP-PROJECTION,
RECORD (R3/R4/R5). "Alone" = what breaks if only this site is deleted first.

- C1 Cache -> ADD_PEER. `peer-cache-reconciliation.js:295-357`; triggers: init
  (`raft-init-base.js:581` via `:154-156`) and every services-row cache change
  for the partition (`core-base.js:828-845` -> `:850-868`, coalesced). Claim: a
  row not FAILED/REMOVING/REMOVED (`:92-102`) IS a member. Pushes into
  `replicaIds` (`:332-334`), reads `readStatus().peers` (`:336`), reserves
  (`:276-283`), admits as a VOTER (`:284-287`). DELETE. Alone: no path admits
  any joiner (ADD execution only writes rows,
  `src/node/replica-handler-create-methods.js:495-497,541-545`) and no
  follower ever reserves a joiner's identity.
- C2 Stale-address REMOVE_PEER by address, `:257-271` (no replicaIdentity),
  refused by shape (port `:111-114`; F-q, verification-round-3.md:293-295).
  Inert. DELETE. Alone: nothing; an rs-raft peer is an identity, its address
  resolved at send time (port `:167-177` -> `raft-init-base.js:467-468`).
- C3 Row DELETE / REMOVED -> REMOVE_PEER, `:202-247` (trigger `:149-154`),
  proposed on EVERY replica that sees the row (`:175-184`; raft-rs forwards a
  follower's proposal, so N-1 duplicates are possible, the F16 class), splices
  the local arrays (`:232-236`). DELETE. Alone: nothing removes a retired
  replica from ConfState; a dead voter keeps counting after REMOVE.
- C4 Bootstrap voters from placement. `raft-init-base.js:453` <-
  `core-base.js:124` <- seed lists (`src/bootstrap/phases/seed-partitions-phase.js:87-100`),
  the node handler's cohort from viability-filtered rows plus dispatched
  REPLACE cohort/topology (`src/node/replica-handler-runtime-metadata-methods.js:231-301,337-347,386-399`),
  the coordinator's stamped topology
  (`src/rebalancer/rebalance-coordinator-operation-creation.js:549-557` ->
  `src/service/replicated-service-topology.js:69-98`), the worker path
  (`src/worker/partition-worker-service.js:156-159`, R4). Legitimate ONLY as
  a fresh group's founding set. For a joiner it fabricates a local ConfState
  from its cache view (F16 builds the joiner with `[LEADER, FOLLOWER, JOINER]`,
  `partition-peer-admission.test.js:217-218`). REPLACE: founding set on create
  only; a joiner opens empty (M6).
- C5 Init join loop, `raft-init-base.js:543-580` (`:568`): no-op on create
  (typed ALREADY_MEMBER); on RESTORE `replicaIds` may name replicas the record
  does not and a restored leader proposes them. DELETE. Alone: nothing on
  create; on restore membership stops drifting toward rows (intended).
- C6 `admitPartitionRaftPeer` (`membership-administration.js:120-135`):
  leadership and membership from the port (`:121-129`), one shape. REPLACE:
  becomes the request owner of section 2. Its QUEUED answer (`:80-102`) is
  counted current by C1 (`peer-cache-reconciliation.js:13-16,290-292`; F-v).
- C7 Reservation trigger: `reservePartitionRaftPeerIdentity` (`:17-26`) and
  the process-global owner map (`raft-rs-membership-administration.js:4-17`).
  KEEP the registry and its port wiring (port `:142-147`); REPLACE the
  trigger: leader reserves inside the request owner, every replica reserves
  from the committed entry's context (M5/M6).
- C8 Local peer arrays as authority. Writers `core-base.js:124,313`, C1
  `:333`, C3 `:232-236`. Readers: election jitter (`raft-init-base.js:418-425`,
  `src/raft/replica-election-timeouts.js:24`), init counts (`:330,339,543`),
  single-replica decisions (`:583,637,701`; `core-base.js:630`), status
  `replicaCount` (`src/partition/partition-service-split-accessor-base.js:643`),
  the CL-013 fork guard (`partition-service-write-metrics-base.js:705` ->
  `src/partition/partition-write-kernel.js:204-222`), solo check
  (`src/partition/partition-service-transaction-base.js:464-470`). A second
  authority (R05, R10). REPLACE: readers consume `readStatus().confState` /
  `peerCount`; the array becomes frozen `foundingReplicaIds`.
- C9 `resolveLiveRaftLeaderAddressForPeer` (`peer-cache-reconciliation.js:29-70`,
  caller `core-base.js:742-759`) consumes the port's `leaderAddress`
  (`status-observation.js:58-66`). KEEP-PROJECTION; re-home.
- C10 Lagrange learner role and its row projection: LEARNER at join
  (`raft-init-base.js:530-541`, demotion suppression `:511-529`), local
  promotion (`learner-promotion-methods.js:416-422`), `raft_role` written from
  the local role (`src/partition/partition-service-row-owner.js:48-58,108`;
  `src/node/replica-handler-voter-readiness-methods.js:160,168`). Row says
  LEARNER while ConfState says VOTER (M3). REPLACE: learner = ConfState
  learner; promotion = committed `AddNode`; role and `raft_role` project
  `readStatus()`.
- C11 Promotion policy inputs from rows: in-flight ADD-like operation rows
  (`learner-promotion-methods.js:561-584`), row statuses (`:275-283`), node
  cohorts (`src/partition/partition-service-learner-promotion-count-check-methods.js:126-138`);
  the proof reads the leader's core-derived follower progress
  (`src/partition/partition-service-learner-promotion-proof-methods.js:96-111`,
  `status-observation.js:68-90`). KEEP-POLICY: they decide WHETHER to request
  promotion. Their "membership epoch" is the publication epoch (M10):
  REPLACE by the committed generation.
- C12 REMOVE execution `src/node/replica-handler-remove-execution-methods.js:201-206`
  retires the LOCAL lifecycle owner (`src/raft/raft-rs-lifecycle-administration.js:5-7`
  -> `src/raft/raft-rs-replica-lifecycle-owner.js:119-147`), writes REMOVING
  (`:209-213`), deletes the row (`:245-249`); ConfState removal is only C3's
  side effect. REPLACE: explicit REMOVE request to the leader; local
  retirement driven by the committed removal.
- C13 The port's raw `ConfChangeV2` pass-through (`raft-rs-operation-port.js:99-102`)
  bypasses identity normalisation; callers are tests only
  (`test/raft/raft-rs-backend/durable-ready-loop.test.js:267,293,329`,
  `conf-state-authority.test.js:132`, `restart-from-durable-record.test.js:163`,
  `runtime-trap-and-restore.test.js:183`, `operation-port-provenance.test.js:30`).
  DELETE (one canonical shape, R08) - D4.
- C14 Ingress admits any sender (`raft-rs-ingress.js:57-74`); F-ab. RECORD, R5.
- C15 Message groups (R3), same shape on liferaft objects:
  `src/message-group/message-group-service-raft-lifecycle.js:38-146`
  (`raft.nodes` `:101-103`, `leave` `:136-141`, `joinPeer` `:142-145`),
  triggers `:222` and `message-group-service-peer-resolution.js:264-282`;
  routing reads `raft.nodes` (`message-group-forwarding-owner-routing-methods.js:84-88`).
  RECORD.
- C16 R4 carriers: `src/raft/raft-group.js:99-104`,
  `src/raft/raft-replica-base.js:83-99`, `src/worker/*-service.js`. RECORD.
- C17 Test harnesses writing rows as membership:
  `test/raft/raft-rs-backend/partition-node-cluster.js:410-420,449-460`; the
  dt6 fixtures already use live voters (`test/convergence/dt6-learner-promotion-fixture.js:10-12`).

F16 is closed on this head (`raft-init-base.js:568`; witness
`partition-peer-admission.test.js:154-155`). F18 (`runtime-owner.js:1106-1132`)
and F-w are untouched by R2.

## 2. Target model

Truth. Current membership is the committed ConfState the core reports
(`status-observation.js:126`) and its durable twin (`durable-store.js:297-306`).
Nothing else is read for a membership decision; `replicaIds`, rows and caches
are POLICY inputs or PROJECTIONS of the truth.

Membership facts live in the log. Every change is a `ConfChangeV2` whose
`context` is frozen JSON `{replicaIdentity, requestId, baseGeneration}`. The
founding set is in the log too: on create (no durable record) the runtime
owner proposes, once the group has a leader, an idempotent `AddNode(self)`
per founding voter with its identity (M6; raft-rs applies an add of an
existing voter as a no-op). Invariant: a replica replaying the log from index
1 reconstructs the ConfState and every identity it names (probe 2). Snapshot
install must carry the same (ConfState plus the reservation rows of every id
it names): recorded for the snapshot quest (F5), not solved here.

Identity is reserved from the log. In `resolveCommittedEntryConfState`
(`runtime-owner.js:766-788`) the runtime reads `decoded.value.context` before
`apply_conf_change` and reserves `replicaIdentity` in this replica's
registry; the derived id must equal `change.nodeId` (`deriveRaftRsPeerId`,
`raft-rs-peer-identity.js:58-69`), else a typed host outcome
(`conf_change_identity_mismatch`) holds the group (it cannot apply a
configuration it cannot name). This is the only way a follower learns a
joiner's identity: F17's residual closes, and the leader's reservation from a
row (C7) is deleted. Reservation stays distinct from membership: append-only,
never reassigned; a removed replica's row stays so a late sender is
resolvable and refusable (R5, M8); it is never evidence of membership.

One request owner. `partition-service-raft-membership-administration.js`
grows from `admitPartitionRaftPeer` into the membership request owner, the
ONLY `proposeConfChange` caller in src:

- request `{kind: ADD_LEARNER | PROMOTE | REMOVE, replicaIdentity, requestId,
  baseGeneration}`; `requestId` is the replica_operation id (Model A: the
  operation IS the intent), `baseGeneration` the generation it was planned
  against;
- admission, in order, each a named outcome: NOT_LEADER (answer carries
  `leaderId`/`leaderAddress` from the status); STALE_GENERATION when
  `baseGeneration < membershipGeneration`; TRANSITION_PENDING when
  `pendingConfIndex > applied` (M7; the shaped status gains
  `pendingConfIndex` and `promotable`); ALREADY_SATISFIED when the ConfState
  already holds the target (idempotent, R14); PROPOSED with `{index}` on
  CORE_OK; REFUSED with the port's reason;
- the leader reserves the identity (idempotent `registerReplica`) before
  proposing; `normalizedConfChange` sets `context`.

Generation. `membershipGeneration` = log index of the last applied
conf-change entry, persisted beside the ConfState (new `conf_index` column,
same transaction as `:800-807`), exposed on `readStatus()`: monotonic per
group, restart-safe (M1), derived from the log, not a new concept. It is the
fence Model A presumed and memory says did not exist. The publication epoch
keeps its node-set meaning; the rebalancer reads `membershipGeneration` from
the projected row for replica-set fences (D3).

How a joiner learns membership. The ADD execution constructs the partition
with `isJoiningExistingGroup` and NO founding set: the port opens the group
empty (`create_node({peers: [], learners: []})`, M6); `campaign` is refused
until the configuration names it a voter (`runtime-owner.js:1045-1052`). The
executor sends `ADD_LEARNER` to the leader (address from the row projection
or the NOT_LEADER answer); the committed entry reaches the joiner by normal
replication and sets its ConfState and reservations. `replicaIds`,
`peerAddresses`, `leaderAddress` remain transport/policy hints; the founding
set is used only for a fresh, non-joining group.

Promotion. The promotion check (C11) ends in a `PROMOTE` request instead of
`becomeFollower()` (`learner-promotion-methods.js:559`); on the committed
`AddNode(self)` the runtime announces the role change (`:921-942`) and the
partition projects role and `raft_role` from `readStatus()`. During catch-up
the joiner is a ConfState learner and never counts toward quorum (A7.4 gone).

Removal. REMOVE execution sends `REMOVE` to the leader BEFORE the row delete
(`remove-execution-methods.js:245-249`) and awaits the answer. On the committed
`RemoveNode(self)` the runtime retires the local lifecycle owner
(`lifecycle-owner.js:119-147`: durable `retired`, every later entry refused
`:98-117`), so a removed replica cannot tick, campaign or re-enter the core
by its own log; the handler's `retireReplica` (`:201-206`) stays as shutdown
driver and treats an already-retired owner (`:120-123`) as done. Row
deletion is the placement record's step and no longer touches consensus (C3
gone). F-q dissolves: no address-based removal exists.

Projection. Rows carry `raft_role`, `status` (lifecycle) and
`membership_generation` derived from `readStatus()`, one way (the designed
sink `raft-rs-membership-projection.js` does this in memory, M9: it becomes
the row owner's source or is deleted, D6). Desired RF and placement stay
above Raft (`src/partition/README.md:49-50`).

## 3. Deletion list, in order (a deletion lands only after its replacement is proven)

Step A, add only: `context` on every proposal and the raw pass-through gone
(C13) once the five tests use the canonical shape; runtime reserves from
context before apply; `conf_index` in applied state; `membershipGeneration`,
`pendingConfIndex`, `promotable` on the status; founding `AddNode(self)`
entries on create; local retirement on a committed self-removal; the request
owner with its fences. R2-1, R2-3, R2-5 go green; nothing is left red.
Step B, switch consumers: the joiner opens empty (`create-methods.js:449-467`
pass no founding set when joining); the executor issues ADD_LEARNER after
`initialize()`; promotion issues PROMOTE; REMOVE issues REMOVE before the row
delete; C8 readers move to `readStatus()`; the row owner projects
`raft_role`/`membership_generation`. R2-4, R2-6.
Step C, delete: `partition-service-raft-peer-cache-reconciliation.js` (C1,
C2, C3; C9 moves to a leader-address module), `raft-init-base.js:154-156,543-581`
(C5), `core-base.js:843-868` (keep the wake observation `:829`), the
`replicaIds` mutators and `peerAddresses`, `reservePartitionRaftPeerIdentity`
and the owner map (C7), the learner-as-voter branches (C10). R2-2 must stay
green with the files gone; red-on-revert for each step-A change. Static
guard in the style of `test/raft/raft-rs-backend/production-raft-call-census.js`:
fail when more than one src module calls `proposeConfChange`, or when a
`src/partition` module reads `systemTableCache` inside a membership decision.
Stays: the registry, the lifecycle owner, the request owner, the promotion
policy and proof, `resolveLiveRaftLeaderAddressForPeer`, README lines already
stating the target (`README.md:20-22`). Recorded, not absorbed: C14 (R5),
C15 (R3), C16 (R4), snapshot-carried identities (F5), F18, F-w.

## 4. Receipts (red first), in the R1 quest.json style

- R2-1 `joiner-learns-the-committed-configuration-not-its-cache`. Leader L,
  follower F; joiner J built through production options with a cache naming a
  phantom X and J's row; ADD_LEARNER through the executor path. Assert on an
  independent connection: J's durable ConfState equals L's; J's registry has
  no reservation for X; J's initial ConfState was empty. Red today: J's
  configuration is fabricated from `replicaIds` (`raft-init-base.js:453` ->
  `runtime-owner.js:387`) and C1 reserves X (`:276-283`).
- R2-2 `a-services-row-cannot-alter-membership`. Three live replicas; on every
  cache insert a row for a non-existent replica, delete a live voter's row,
  mark another REMOVED. Assert every replica's durable ConfState and
  conf-change entry count unchanged after the reconcile hop
  (`core-base.js:859-867`). Red today: C1 admits the phantom, C3 proposes
  REMOVE_PEER.
- R2-3 `every-replica-can-address-every-configured-peer`. L admits J while F's
  cache never receives J's row; after commit F's `readStatus().peers` shows J
  RESOLVED; stop L, let F lead, assert J's applied index advances. Red today:
  F reports UNRESERVED (`status-observation.js:27-31`) and its sends fail at
  address resolution (`runtime-owner.js:724-731`).
- R2-4 `removal-retires-the-removed-replica-by-the-committed-log`. REMOVE for
  R; assert survivors' ConfState excludes R, R's lifecycle row is `retired`
  and R's port answers CORE_REFUSED `retired` to tick/campaign/propose before
  R's handler runs `retireReplica`; the handler is idempotent. Red today: no
  removal without a row delete (C3); retirement is local only
  (`remove-execution-methods.js:201-206`).
- R2-5 `one-owner-proposes-with-a-monotonic-generation`. Static: exactly one
  src module calls `proposeConfChange`. Dynamic: two ADD requests with the
  same `baseGeneration` -> one PROPOSED, one TRANSITION_PENDING or
  STALE_GENERATION; `membershipGeneration` strictly increases per committed
  conf change and is identical after restart. Red today: three call sites
  (`peer-cache-reconciliation.js:178,266`, `membership-administration.js:81`),
  no generation, second proposal silently accepted (M7).
- R2-6 `a-lagrange-learner-is-a-confstate-learner-until-promoted`. J joins:
  before the proof L's `confState.learners` holds J and `voters` does not;
  after PROMOTE `voters` holds J and J's row says a voter role. Red today: the
  F16 witness asserts the joiner in `voters` at admission
  (`partition-peer-admission.test.js:229`) and `ADD_LEARNER` has no caller.

## 5. Open owner decisions and interactions

- D1 Request channel: reuse the leader RPC the promotion proof uses
  (`learner-promotion-methods.js:521-524`) or a new partition message. Sender:
  the operation executor on the joining/removing node (Model A: one owner
  creates membership-changing operations). Evidence C1/C12.
- D2 Founding set on create: seed (`seed-partitions-phase.js:87-100`) and fresh
  CREATE TABLE (`runtime-metadata-methods.js:328-347,394-398`) keep
  `foundingReplicaIds`; every join opens empty (M6). Whether a REPLACE join is
  "joining" is decided by the operation kind, not cache viability (`:375-385`).
- D3 Which generation the rebalancer fences on: `membershipGeneration` from
  the row projection (this design) vs the publication epoch used today
  (`spread-cure-transition-authorization.js:401-407`, `dispatch-epoch-gate.js:111`).
  Model A's stop condition ("Raft generation cannot fence") is answered only
  if D3 adopts the conf index.
- D4 Delete the raw `ConfChangeV2` pass-through (C13) and migrate five tests,
  or fence it to test construction. Evidence M5, port `:99-102`.
- D5 Restore with a founding list that disagrees with the record: refuse the
  option, ignore it, or log it (C5). Evidence M2.
- D6 Row projection sink: adopt `raft-rs-membership-projection.js` as the row
  owner's source or delete it (M9); `raft_role` today comes from the local
  role (`row-owner.js:48-58`).
- D7 Quorum during joins changes (a learner does not count): the formation
  gates that treat a SYNCING row as a voter (memory: no-committed-raft-membership)
  and the voter-readiness gate (`voter-readiness-methods.js:143-189`) must be
  re-read against `membership_generation` and the projected role; a cold
  3/5-node formation (R8 item 6) is the proof, not a shape assertion.
- D8 Snapshot install must carry identities (M6 invariant); F5's quests own
  it; until then a joiner behind a compacted log cannot reconstruct
  reservations (`durable-store.js:313-327` writes the ConfState only).
- R3 interaction: the request owner, the context rule and reserve-from-log
  are group-agnostic (groupId + identity); message groups keep their liferaft
  reconcile (C15) until R3 moves them onto the same port, then
  `message-group-service-raft-lifecycle.js:38-146` is deleted under the same
  witnesses parametrised on group type. R2 must not touch it.
- Model A interaction: ReplicaOperation = the request (identity, kind,
  requestId, baseGeneration); ConfState = committed truth; SYNCING/ACTIVE =
  lifecycle on the row, never membership (it WAS a second authority via C1;
  after R2 it is not); one unresolved transition per group = the core's
  `pending_conf_index` surfaced as a typed refusal (M7). No transition
  object, ceiling or epoch domain is added. Complexity ledger for the quest:
  concepts +1 (membershipGeneration, derived), decision owners -2 (cache
  reconcile, row-delete retire), authoritative sources -2 (rows, local
  arrays), persistent fields +1 (`conf_index`), guard branches -3 (C1-C3).
- Still open after R2 by design: F-ab (sender admission, R5), F-w (replay
  attestation), F18 (probe inert). F-q closes by dissolution, F-v by C1's
  deletion.
