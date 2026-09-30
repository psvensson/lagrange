# Challenger A: coverage model of the committed-membership bootstrap read (state, events, census, oracle)

Protocol v2 phase 3, model challenge before any evidence is written. Read-only on
worktree `replace-d1`, branch `quest/replace-d1-bootstrap-membership`, HEAD
4d9c2a790. Every file:line below is at that head. Subject:
`design-committed-membership-bootstrap-read-2026-09-25.md` (sections 2 and 4).
Sibling challenger B owns timing and interleaving; nothing here is temporal.

Method: every claim in sections 2 and 4 was checked against the code that
actually runs, by grep from the constructors outward (`new PartitionService`,
`createPartitionService`, the two stamp builders, `BOOTSTRAP_PEER_IDS`, the
`readOpeningRecord` restore/create fork, `admitPartitionRaftPeer`,
`reconcileRaftPeersFromCache`, every reader of `REPLICA_IDS`, every reader of
`replicaIds.length`, every reader of `confState` outside `src/raft`).

Classification: NEW MECHANISM = the model needs a new dimension, input, event
or consumer; NEW SHAPE = an instance of a dimension the model already has, but
one that is not a modelled cell.

---

## 1. Findings

### F-A1. The GENESIS decision is made from rows, and a GENESIS stamp is never validated against group existence
**NEW MECHANISM** (a decision the model lists as "routing only" is a membership decision).

- Evidence. Provisioning plans `targetReplicaCount - routableNodeIdSet.size` new
  replicas (`src/query/sql-query-engine-initial-partition-provisioning.js:258-264`)
  and stamps `currentServices` (the provisioner's own cache rows,
  `src/query/sql-query-engine-provision-target-methods.js:290-355`, read at `:294`)
  union the plan. Section 4.2 lists "whether the partition has any replica (B/C)
  [rows, routing only]". The seed phase constructs system partitions from the
  constant `INITIAL_REPLICA_IDS` with no durable-record check of its own
  (`src/bootstrap/phases/seed-partitions-phase.js:87-104,197-210`); whether that
  is a create or a restore is decided only by what the DB holds
  (`src/raft/raft-rs-runtime-owner.js:292-300`, `readOpeningRecord`;
  `src/raft/raft-rs-durable-store.js:467-471`). Section 3.4 accepts a stamp of
  kind GENESIS with no further check.
- What is missing. A stamp of kind GENESIS is a claim "no group exists for this
  partition id". The model has no cell for that claim being false: (a) B/C retry
  or `reconcileExistingInitialPartition`
  (`src/query/table-creation-service-existing-table-reconciliation.js:32-120`)
  on a provisioner whose cache lags or whose rows were deleted while a live group
  exists; (b) a seed restart whose partition DB is lost or corrupt while joiners
  still hold the group (row D says "genesis by construction"; that is true on the
  first boot only). Either case founds a second, independent group under the same
  partition id, which is a stronger violation of the frozen claim than the D1
  skews (two committed configurations for one group id, both able to lead and
  acknowledge writes).
- Proposed cells. Decision 6 (genesis or join) gains the dimension "group
  existence as the target can observe it": none / live group reachable / durable
  records only (all founders down). The stamp kind is crossed with it: GENESIS x
  live group = refuse (typed), never create; GENESIS x records only = refuse until
  a member answers or an operator decides; COMMITTED x none = `MEMBERSHIP_UNREADABLE`
  (already modelled). Row D splits into D-first-boot (GENESIS) and D-restart
  (restore; no record = `DURABLE_RECORD_MISSING`, the same rule as E/F).
- Evidence to cover it. W4 gains two red-first rows: a GENESIS stamp delivered to
  a node whose partition already has a reachable leader is refused with no group
  created; a seed replica reopened with its DB removed while two joiner voters run
  is refused and never leads. The independent oracle is the number of distinct
  groups: count distinct genesis ConfStates at applied index 0 across every
  durable `_raft_rs_applied_state` for the partition id (must be one).

### F-A2. Row-driven admission (C1) stays the only admission path and keeps mutating the committed configuration from rows on every leader, including the target once it leads
**NEW MECHANISM** (an event on the committed configuration that section 4.3 does not list; section 2.2 row 3 overstates "rows are not read for membership").

- Evidence. `reconcileRaftPeersFromCacheForService`
  (`src/partition/partition-service-raft-peer-cache-reconciliation.js:295-357`)
  runs at init (`src/partition/partition-service-raft-init-base.js:581`) and on
  every services-row cache change (`src/partition/partition-service-core-base.js:840-870`);
  it pushes every row replica into `replicaIds` (`:330-333`) and proposes
  `ADD_PEER` as a VOTER for any row not FAILED/REMOVING/REMOVED (`:92-102`), so
  PENDING, CREATING and SYNCING rows are admitted. The admission owner checks only
  leadership and current membership (`src/partition/partition-service-raft-membership-administration.js:120-134`).
  Nothing else in src proposes `ADD_PEER`. The design relies on this path for the
  target's own admission ("that entry is proposed after CREATE", section 3.5) but
  models it only as the A4 re-add hazard.
- What is missing. (a) The committed configuration the read returns can itself
  carry a row-driven phantom (a row whose replica was never built, or was built
  and died before its first vote); the read faithfully returns it (F2 holds), but
  the model must say this is an allowed shape, and the phantom exclusion in
  section 1 covers only "phantoms in genesis". (b) The target, once it leads (RF=1
  path step 3, or any later election), runs C1 against its own cache and admits
  whatever rows it sees; "the handler never reads rows" (section 3.1) is true of
  the answer and false of the group's evolution. (c) Admission depends on the
  leader's cache seeing the target's row; if C1 is later deleted (R2 design) or
  the row never propagates (D1 case 2), no path admits the target and the gate
  holds forever (liveness, but a modelled cell is needed so the evidence author
  does not read a stuck gate as a gate defect).
- Proposed cells. Section 4.3 gains the event "row-driven admission proposed on
  a leader" at every column; the shape table (F-A9) gains "committed voter with
  no process, row or DB" and "committed voter admitted from a PENDING/CREATING
  row". Section 4.2 gains the input "the leader's services cache view" as the
  admission trigger.
- Evidence to cover it. The W3 differential history generator must include the
  production admission trigger (a services row write) as the way an identity
  enters the log, not only direct `proposeConfChange` calls; one W4 row shows a
  phantom row on the leader producing a phantom voter in the answer and the target
  still failing closed (stricter quorum, never a leader with an invalid quorum).

### F-A3. A committed voter identity re-created with no durable record (zombie voter)
**NEW MECHANISM** (the durable-record dimension applies to path A, not only to E/F).

- Evidence. REMOVE execution deletes the replica DB
  (`src/node/replica-handler-runtime-methods.js:133-158`, `cleanupReplicaResources`)
  and the row. The only RemoveNode producer, C3, proposes `REMOVE_PEER` only for
  an address found in `readStatus().peers[].address`
  (`peer-cache-reconciliation.js:166-190`); after the row is gone the address
  resolves to null (`src/raft/raft-rs-status-observation.js:27-43`), so the
  removal is usually skipped (D1 report, "A10 caveat"). The identity stays a
  committed voter. REPLACE re-plans reuse a deterministic intent id and therefore
  the same target replica id (`src/rebalancer/rebalance-coordinator-operation-creation.js:690-705`).
  Section 3.5 handles "a retried target is already a committed voter" and assumes
  the gate alone makes it safe.
- What is missing. The retried target's earlier incarnation voted (its
  `_raft_rs_hard_state` held term and vote). Its DB is gone. Re-created from
  C_j' that names it, it is promotable from creation, and after the gate opens it
  can vote again in a term it already voted in. That is a Raft safety hazard
  (double vote) the gate does not address, because the gate reasons about
  configuration, not about hard state. The model has no "record present / record
  absent" dimension for a committed identity on path A.
- Proposed cells. Decision 4 (target accept/refuse) gains "the stamp names self
  and no durable record exists for self": either refuse (`DURABLE_RECORD_MISSING`
  applies to A as well as E/F) or state explicitly that the log's committed
  RemoveNode must precede any re-creation. Decision 7's record dimension moves up
  to "every path".
- Evidence to cover it. W5 gains a row: admit t, delete t's DB and row, re-plan
  with the same intent id, and assert that t is refused or that t's durable
  hard-state term at re-creation is not below the group's current term before it
  is allowed to vote. Independent oracle: hard-state rows on independent
  connections plus vote counting per term across every member's durable log.

### F-A4. The stamp kind and the target's own join/founder classification are two authorities that can disagree
**NEW MECHANISM** (an input section 4.2 omits).

- Evidence. `resolveReplicaContext` derives `existingReplicaCount` from ACTIVE
  rows with a voter `raft_role` on viable nodes, the `leader_node_id` row and the
  fresh-bootstrap window (`src/node/replica-handler-runtime-metadata-methods.js:229-240,294-345,355-380`;
  `src/node/replica-handler-transition-policy.js:75-84`, which is true only while
  `created_at === updated_at` and no leader is recorded). `isJoiningExistingGroup
  = existingReplicaCount > 0` (`src/node/replica-handler-create-methods.js:441`)
  decides `deferElection`, the LEARNER role, learner promotion and voter-readiness
  gating (`raft-init-base.js:530-541,587-603`; `core-base.js:309`). The stamp
  kind decides the ConfState. Nothing ties them.
- What is missing. COMMITTED x existingReplicaCount = 0 (a B-retry into a live
  group whose partition row is still in the fresh window; a priority partition
  whose siblings all look non-viable): ticks start at once on a promotable retried
  target. GENESIS x existingReplicaCount > 0: founders open as learners and never
  elect until the promotion flip. Neither is a modelled cell.
- Proposed cells. Section 4.1 decision 4 crosses stamp kind with the target's
  classification and states which governs (the kind must; the classification
  must never start scheduling on a gated replica).
- Evidence to cover it. Two W4 rows with the mismatched pairs; the oracle is the
  port's scheduling state (`startScheduling` at
  `src/raft/raft-rs-operation-port.js:221,306`) and the durable hard-state term
  not advancing while applied < j.

### F-A5. Consumers of the temporary over-replication are absent from the model: the planner's surplus lanes (owner constraint 6)
**NEW MECHANISM** (a consumer axis the model lacks).

- Evidence. Voter counting for the ledger lanes is rows only
  (`src/rebalancer/operation-ledger-quorum-concentration.js:34-40`: ACTIVE and
  REMOVING rows with a voter role). The surplus drain restores "contradictory"
  active voters from rows (`src/rebalancer/unified-rebalancer-ledger-surplus-drain-replica-state.js:22-60`).
  An in-flight REPLACE blocks topology moves only until its remove-dispatch phase
  (`src/rebalancer/unified-rebalancer-topology-drain-methods.js:52-54`). The
  REPLACE owner design records the drain removing r1, not the source, in every
  recorded episode (`design-replace-source-removal-owner-2026-09-25.md`, row B2).
- What is missing. Section 4 decisions 1-7 name no consumer that reads the RF+1
  window between CREATE and the committed RemoveNode. The owner's constraint 6
  asks for exactly that proof, once.
- Proposed cells. A consumer table (F-A10) with the planner's surplus lanes as a
  row: "reads RF+1 ACTIVE voter rows while R is non-terminal; expected: no REMOVE
  of any replica of P". Evidence: one witness through the planner with a REPLACE
  at ACTIVE, asserting no REMOVE operation row is created for P.

### F-A6. A second seam and a second consumer of the same authority: the REPLACE owner's local committed-membership reread
**NEW MECHANISM** (consumer and contract-shape axis).

- Evidence. The REPLACE owner design reads the committed ConfState through a
  different seam: rebalancer -> local replica handler `getTrackedService` ->
  `service.raft.readStatus().confState` on the target's node
  (`design-replace-source-removal-owner-2026-09-25.md:379-380,438-439,582-589`),
  and plans a membership-changed emit in `announce`. This design's seam is a
  routed `READ_COMMITTED_MEMBERSHIP` message answered by the leader. Today no
  file outside `src/raft` reads `confState` (grep: only `.peers` readers at
  `peer-cache-reconciliation.js:169,336`), which the design's static census
  relies on.
- What is missing. The model lists neither the REPLACE completion reread nor the
  membership-changed emit as consumers; the static census "no reader of
  confState outside the stamp or the port bootstrap" will be contradicted by the
  sibling design the moment both land; and one contract will have two shapes
  (R08) unless the design names the seam both use.
- Proposed cells. Consumer table rows for REPLACE completion and for the
  membership-changed wake; the static census enumerates every `confState` reader
  outside `src/raft` and asserts the set equals the named seams.

### F-A7. The `replicaIds` list, renamed "address hints", still feeds membership-flavoured decisions in the target
**NEW SHAPE** (instances of the O2 consumer list the design already names, with two omissions).

- Evidence. `BOOTSTRAP_PEER_IDS` = `this.replicaIds` reaches the port
  (`raft-init-base.js:456`) and every hint is reserved as an identity
  (`raft-rs-operation-port.js:134-140`). Readers of `replicaIds.length`: the
  single-replica campaign (`raft-init-base.js:587-603`, named by the design), the
  election jitter (`raft-init-base.js:418-425`; `src/raft/replica-election-timeouts.js:22-30`),
  `startElection`'s early return (`raft-init-base.js:640-644`), the write commit
  mode's self-only rejection (`src/partition/partition-write-kernel.js:234-252`,
  called at `src/partition/partition-service-write-metrics-base.js:702-708`),
  the solo-group transaction check (`src/partition/partition-service-transaction-base.js:464-470`),
  and the status `replicaCount` (`src/partition/partition-service-split-accessor-base.js:643`).
  C1 also pushes rows into it (`peer-cache-reconciliation.js:330-333`), so it is
  a hint list that rows keep growing.
- What is missing. The write-kernel and transaction-base readers are not in the
  O2 list. Under the design, an RF=1 source s has `replicaIds = [s]` until its
  cache sees t's row; the write path stays in RAFT mode (safe, the core decides),
  but `isSoloReplicaGroup` also reads `peerCount` from the core, so its answer
  is consistent; both belong in the consumer table so the evidence author can
  show they never authorize a commit the committed configuration would refuse.
- Evidence to cover it. The census witness asserts that no reader of
  `replicaIds` decides a quorum, a commit or a campaign (only the core does),
  by listing the readers and their decisions.

### F-A8. Target-side identity resolution for changes applied after j
**NEW SHAPE** (the F8/identity-completeness risk exists on the target side too, and section 3.2's redirect has a hint-less cell).

- Evidence. A conf-change entry carries only the u64 id; the port never sets
  `context` (`src/raft/raft-rs-operation-port.js:103-123`). A replica resolves
  only ids it reserved (`src/raft/raft-rs-peer-identity.js:154-163`); reservation
  outside the bootstrap list comes from rows
  (`peer-cache-reconciliation.js:317-333`, `reservePartitionRaftPeerIdentity`).
  An unreserved leader yields `leaderAddress: null`
  (`src/raft/raft-rs-status-observation.js:27-31,58-66`).
- What is missing. Two concurrent joins t1, t2 where t2's read precedes
  AddNode(t1): t2 replays AddNode(t1) as a bare id and can name t1 only if its
  own cache showed t1's row. A `NOT_LEADER` answer from a member that never
  reserved the leader carries no address, so the "one redirect" in section 3.2
  cannot happen and the outcome is `MEMBERSHIP_UNREADABLE`. Both are liveness,
  but neither is a cell.
- Proposed cells. Section 4.2 gains "the target's registry for ids applied
  after j [rows]"; decision 1 gains "NOT_LEADER without a hint".

### F-A9. Membership shapes the read can return: the modelled set versus the reachable set
**NEW SHAPE** (several reachable shapes have no cell).

Reachable shapes, with the producer, and whether section 4 has a cell:

| Shape | Producer | Cell? |
|---|---|---|
| voters only, simple | any | yes |
| voters with the REPLACE source still present | D1 constraint 1 | yes |
| voters naming the target (retried) | deterministic intent id | yes (3.5) |
| voters excluding the target (fresh) | self excluded | yes |
| joint (`votersOutgoing` non-empty) | tests only today, F4 | yes (refused) |
| learners non-empty | `ADD_LEARNER` has no src caller; raw `changes` pass-through in tests (`raft-rs-operation-port.js:100-102`); a restored record can carry learners (`lib.rs:392-401`) | **no**: the port's create passes `learners: []` (`runtime-owner.js:404-410`); the design says "full ConfState" without saying whether learners in the answer are accepted, refused or dropped |
| single voter (RF = 1) | seed or RF=1 partition | yes (3.7) |
| an id UNRESERVED on the answerer | F17 residual | yes (refused) |
| a row-driven phantom voter | C1 on a PENDING/CREATING row | **no** (F-A2) |
| a zombie voter (committed, no process/row/DB) | C3 skipped after removal | **no** (F-A3) |
| a removed-then-readded identity in the history | C1 on a reappearing row | yes (H1) |
| two concurrent joins, t1 admitted before t2's read | A x2 | partly (F-A8) |
| the answerer is a deposed leader with a committed but older configuration | leader change | yes (3.2) |
| the answerer is a leader whose own bootstrap came from rows (pre-change group) | O3 | named, not decided |

Proposed cell: "learners non-empty in the answer" with one of three named
outcomes, and a corresponding W4 row.

### F-A10. Consumers of the read's outputs, reconciled against section 1 "Outputs"
**NEW SHAPE** (consumers exist that the model does not name).

Section 1 names the stamp, the target's ConfState, campaign observations and
the refusals. Consumers found in src that will act on the stamp or on the
membership it produces:

| Consumer | Reads | In the model? |
|---|---|---|
| dispatch request builder (`src/rebalancer/operation-workflow-dispatch-response-reconcile.js:417-430`) | `operation[REPLICA_IDS]`, `[PEER_ADDRESSES]` | yes (carrier) |
| row rehydration (`src/rebalancer/replica-operation-repository-row-methods.js:128-138`; `src/control-plane/replica-dispatch-readiness-capture.js:255-265`; `src/control-plane/replica-dispatch-operation-execution.js:301-312`) | `stepsHistory[0]` | **no**: the stamp is re-read from the row on every re-dispatch and after a coordinator change, so the stamp's serialized shape is a contract |
| in-memory/row merge fallback (`src/rebalancer/operation-workflow-owner-ports.js:615-640`) | `REPLICA_IDS` from a fallback operation when the authoritative lacks it | **no**: a second source of the stamp at dispatch |
| the deferred-topology hold for path B (`replica-dispatch-readiness-capture.js:52-73`; stamp written later at `initial-partition-provisioning.js:600-626`) | `BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED` | partly (row B); the B read must happen before the un-deferring update |
| the membership publication epoch gate at dispatch (`dispatch-response-reconcile.js:405-412`; `src/rebalancer/operation-workflow-dispatch-epoch-gate.js`) | node-set epoch (blind to replica changes, M10) | **no**: an event between read and CREATE that refuses the CREATE and forces a re-plan (a new read) |
| target validation (`runtime-metadata-methods.js:116-380`) | stamp, rows (classification, F-A4) | yes |
| learner promotion / `becomeFollower` -> `startElection` (`src/partition/partition-service-learner-promotion-methods.js:416-422,559`) | rows (in-flight ADD-like operations), local role | **no**: a third campaign trigger beside F6's two; also `startDurableRejoinLocalPartitionElections` (`src/bootstrap/node-joining-publication-activation.js:129-141`) and the non-deferred `startScheduling()` at port creation (`raft-rs-operation-port.js:306`) |
| planner surplus lanes | rows | **no** (F-A5) |
| REPLACE completion reread and membership-changed wake | `confState` via a second seam | **no** (F-A6) |
| diagnostics `replicaCount` (`split-accessor-base.js:643`) and the creation log (`creation.js:800-812`, `bootstrapReplicaIdCount`) | `replicaIds` | no (harmless, but they will report hints as membership) |
| durable rejoin restore planner (`src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:118-133`, `shouldRestoreDurableRejoinPartition`) | rows vs RF, active operations | **no**: decision 7 has a third outcome, "skip": a committed voter with a durable record is not restarted when rows exceed RF and no operation is active (silent quorum loss; liveness) |

### F-A11. Oracle independence: the planned oracle is the implementation's own value
**NEW MECHANISM** (the evidence plan must change, not the model cells).

- Evidence. The read answers from `readStatus().confState` of the leader
  (section 3.1). The oracle in section 1 is "a live group member's committed
  ConfState, read through the operation-only port (`readStatus().confState`),
  cross-checked against the durable `_raft_rs_applied_state`". The durable twin
  is the same core value written in the same application transaction
  (`src/raft/raft-rs-runtime-owner.js:835-860` with `putAppliedState`,
  `src/raft/raft-rs-durable-store.js:290-306`), so the cross-check detects a
  shaping bug in `status-observation.js` and nothing else. The existing anchor
  `test/raft/raft-rs-backend/bootstrap-committed-membership.test.js` already uses
  `committedMembership(harness.leader())` as both subject and oracle
  (`:139-154,420,452`). The harness admits peers by writing services rows
  (`test/raft/raft-rs-backend/partition-node-cluster.js:47-59`), so the
  "committed configuration" in every witness is downstream of rows via C1
  (F-A2). If the implementation reads the wrong member, a stale cached
  observation (`SHAPED_STATUS` memo, `runtime-owner.js:1082-1090`), or a
  configuration polluted by rows, the oracle agrees with it.
- Independent oracles to use instead.
  1. Log fold: on an independent read-only connection, read `_raft_rs_log`
     conf-change entries (types from `RAFT_RS_CONF_CHANGE_ENTRY_TYPES`,
     `src/raft/raft-rs-ready-loop-constants.js:10-13`), decode them with the
     binding's `decode_conf_change_entry` on a throwaway core, and fold them over
     the test's own genesis founders (never rows). The target's ConfState at each
     applied index must equal the fold at that index; this is the R2 design's
     invariant stated as a check.
  2. Cross-member agreement: at equal applied index, the durable applied
     ConfStates of at least two members in separate processes and DBs must agree;
     the target must agree with them, not with the answerer alone.
  3. The safety property itself for W1/W2: from every member's durable hard
     state and log, at most one leader per term (count `vote` grants per term,
     and leaders per term) and one `(index, term)` payload across all logs.
  4. The gate: the target's durable hard-state term and vote must not change
     while its applied index is below j (read on an independent connection).
- The mutation family "stamp from rows instead of the read" cannot turn a
  witness red under the current oracle when rows and the committed configuration
  agree (the harness makes them agree). Each W1/W2/W3 run needs a deliberate
  rows-vs-committed disagreement (a row omitted or a phantom row) so the oracle
  and the mutation are distinguishable.

### F-A12. The static census must count carriers, not only producers
**NEW SHAPE** (census).

- Evidence. Producers of the stamp today: `creation.js:752-771` (A) and
  `initial-partition-provisioning.js:600-626` (B, written after persistence under
  the deferred hold). Carriers: F-A10 rows 1-3. The partition branch of
  `buildOperationBootstrapTopology` (`creation.js:497-503,506-530`) and the
  message-group branch share one function; gating the read to
  `SERVICE_TYPE.PARTITION` leaves a row-reading branch in the same owner, which
  R11 forbids as an alternate path unless the partition branch is deleted rather
  than bypassed.
- Proposed evidence. The census asserts: exactly two origins (the read for
  joins, GENESIS for founders), one serialized shape, every carrier passes the
  object through unchanged (no re-derivation from rows), and no row read remains
  reachable from the partition branch.

### F-A13. Enumerations the evidence must import, and where they live
**NEW SHAPE** (hand-listing any of these makes the evidence drift).

| Universe | Owner |
|---|---|
| replica-handler message types | `src/constants/messages.js:1-7` (`MESSAGE_TYPE`), `src/rebalancer/replica-operation-constants.js:7-11` (`ReplicaOperationMessageType`); the dispatch at `src/node/replica-handler-lifecycle-methods.js:61-76` must stay exhaustive over it |
| stamp kinds (new: COMMITTED, GENESIS) and the read refusals (new) | must be exported from one constants module the creation owner, the handler and the port all import; the design names no owner file |
| port request fields (new `BOOTSTRAP_COMMITTED_MEMBERSHIP`) | `src/raft/raft-provider-contract-constants.js:21-50` (`RAFT_PARTITION_NODE_REQUEST`) |
| conf-change entry types and the change-type arms | `src/raft/raft-rs-ready-loop-constants.js:3-13`; `vendor/raft-rs-wasm/src/lib.rs` `ConfChangeType` match arms (as `real-partition-on-raft-rs.test.js:47-60` does) |
| membership operations and admission outcomes | `src/raft/raft-operation-port-constants.js:12,19,99` (`RAFT_OPERATION_OUTCOME`, `RAFT_MEMBERSHIP_OPERATION`, `RAFT_MEMBERSHIP_ADMISSION_OUTCOME`) |
| core roles, address statuses, runtime reasons | `src/raft/raft-rs-runtime-owner-constants.js:30,57,99` (`ROLE`, `PEER_ADDRESS_STATUS`, `RUNTIME_REASON`) |
| identity resolution states | `src/raft/raft-rs-peer-identity-constants.js:35` |
| group tuning (pre-vote, check-quorum off) | `src/raft/raft-rs-group-constants.js:13-18` |
| replica statuses and operation types | `src/rebalancer/replica-operation-progress.js:12,96` |
| voter raft roles | `src/raft/replica-voter-readiness.js:83` (`VOTER_RAFT_ROLES`) |
| partition raft roles | `src/partition/partition-service-shared.js:206` |
| startup join modes | `src/bootstrap/rejoin-hints-constants.js:4` |
| restorable rejoin statuses | `src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:28-31` |
| durable record tables and host writes | `src/raft/raft-rs-durable-store-constants.js` |
| service types | `SERVICE_TYPE` via `src/partition/partition-service-shared.js` |

---

## 2. Reconciled census

### 2.1 Bootstrap constructors and membership-stamp producers (every `new PartitionService` / `createPartitionService` / stamp writer in src)

| # | Path | Constructor or producer | Membership input today | In section 2.1? | Verdict |
|---|---|---|---|---|---|
| A | ADD/REPLACE creation stamp | `creation.js:752-771`; consumed via `replica-handler-create-methods.js:60-130,400-467` and the factory in `src/bootstrap/bootstrap-service-replica-registration-methods.js:106-132` (seed) or `src/bootstrap/node-joining-publication-activation.js:169-214` (joiner) | rows merged with the services owner, plus target | yes | matches; add the RESTART_CREATE re-entry (`create-methods.js:258-272`) as a restore cell |
| A-formation | joiner system partitions | as A | as A | yes | matches |
| A-retry | same target identity re-created after cleanup | `creation.js:690-705` intent id; `runtime-methods.js:133-158` DB deletion | committed configuration naming self, no record | **no** | F-A3 |
| B | table-create provisioning | `initial-partition-provisioning.js:558-626`; `provision-target-methods.js:290-355` | provisioner rows union plan | yes | genesis decision from rows: F-A1 |
| B-existing | `reconcileExistingInitialPartition` | `table-creation-service-existing-table-reconciliation.js:32-120` -> B | as B | yes (row B text) | as B |
| C | split/merge children | `managed-split-workflow.js:533,554`, `managed-merge-workflow.js:661` -> B | planned cohort | yes | as B |
| D-first | seed system partitions, first boot | `seed-partitions-phase.js:87-104,197-210` | constant list | yes | matches |
| D-restart | seed restart | same constructor; restore/create decided by `readOpeningRecord` only | record, or the constant list if the record is gone | **no** (row D says "a seed restart is a restore") | F-A1: no record = second genesis |
| E | durable rejoin | `node-joining-publication-activation.js:56-119`; planner `restore-planner.js:118-133,205-215` | record; ACTIVE rows when none | yes | add the "skip" outcome: F-A10 last row |
| F | snapshot-catchup replacement | `src/raft/snapshot-catchup.js:325-336,387`; `src/bootstrap/shared/snapshot-catchup-wiring.js:196-213` | installed DB's record (sender's registry) | yes | excluded; the "installed DB without a record" cell should be named |
| MG | message groups | `src/node/message-group-replica-options.js:104-140`; `creation.js:497-503` | rows | yes | out of scope; shared function with A: F-A12 |
| Carriers | dispatch and rehydration | `dispatch-response-reconcile.js:417-430`; `repository-row-methods.js:128-138`; `readiness-capture.js:255-265`; `dispatch-operation-execution.js:301-312`; `owner-ports.js:615-640` | the persisted stamp, or an in-memory fallback | **no** | F-A10, F-A12 |

No `src/worker` constructor reaches `PartitionService` at this head (the worker consensus path was deleted, memory worker-consensus-path-deleted).

### 2.2 Row-skew sources: section 2.2 reconciled

| Source | Site | Section 2.2 | Verdict |
|---|---|---|---|
| null stamp -> cache fallback | `creation.js:534-583`; `runtime-metadata-methods.js:236-289` | closed | agreed, provided the row branch is deleted (F-A12) |
| priority viability filter | `runtime-metadata-methods.js:229-240,248-253` | closed for membership | agreed; it still decides `existingReplicaCount` (F-A4) |
| row deleted before RemoveNode commits | `peer-cache-reconciliation.js:146-236` | closed | closed for the bootstrap, but it produces zombie voters the read returns (F-A3) |
| durable rejoin ACTIVE-only | `restore-planner.js:28-31,205` | closed by 3.6 | agreed; the "skip" outcome is new (F-A10) |
| existing-group provisioning | `initial-partition-provisioning.js:258-264` | closed when routed through the read | the routing itself is row-derived (F-A1) |
| phantom rows | rows union target | closed for new stamps | C1 admits PENDING/CREATING rows into the committed configuration on every leader (F-A2) |
| pre-change groups | O3 | not closed | agreed |
| **genesis from a provisioner or seed whose rows/DB lag or are lost** | F-A1 | absent | new |
| **the target's own classification (join vs founder) from rows** | F-A4 | absent | new |
| **row-driven reservation of post-j identities on the target** | F-A8 | absent | new |

---

## 3. Verdict

The model is not complete enough for the evidence author. Its state and event
dimensions cover the D1 skews it was written for (a missing or phantom voter in
a join stamp, joint configurations, unreserved identities, restart during
replay), but four mechanisms outside those dimensions can violate the frozen
claim or defeat the gate and have no cell: the GENESIS decision is itself made
from rows and a GENESIS stamp is accepted without checking that no group exists
(F-A1, a duplicate group under one partition id, including a seed restart with a
lost DB); row-driven admission remains the only way identities enter the
committed configuration, so the configuration the read returns and the target's
own later admissions are still row-shaped (F-A2); a committed voter identity can
be re-created with no durable record and vote twice in one term, which the
configuration gate cannot see (F-A3); and the target's join-versus-founder
classification is a second, row-derived authority that can disagree with the
stamp kind (F-A4). Two consumer families the owner explicitly asked to be proven
are absent (the planner's surplus lanes, F-A5; the REPLACE owner's second
`confState` seam, F-A6). Finally, the planned oracle is the implementation's own
value read through the same port and made to agree by the harness's row-driven
admission, so W1-W3 cannot distinguish the read from a rows stamp unless every
run plants a rows-versus-committed disagreement and the oracle is replaced by a
log fold over test-known founders plus cross-member agreement and the safety
property counted from durable hard states (F-A11). Amend sections 4.1-4.3 and
4.5 with the cells above before phase 4; the remaining findings (F-A7 to F-A10,
F-A12, F-A13) are cells and census rows the evidence author can add without a
model change.

---

## 4. Owner questions (follow-up, same head 4d9c2a790)

Owner adoption noted: O1 (read plus participation gate now), O2 (joiner-self
rule unchanged this release), O4 (rejoin without a durable record is a typed
refusal). The intended split: services/placement rows = discovery and desired
topology; committed Raft membership = consensus participation authority.
Answers are from the state/census perspective; timing, message ordering and
raft-rs step internals are deferred to challenger B by name.

### Q1. Call sites that currently turn services rows into Raft authority

| # | Site | Row input | Authority gained | Kind |
|---|---|---|---|---|
| 1 | Join bootstrap voters: `src/node/replica-handler-runtime-metadata-methods.js:229-289` (rows, viability filter, self appended) -> `src/partition/partition-service-raft-init-base.js:456` (`BOOTSTRAP_PEER_IDS`) -> `src/raft/raft-rs-operation-port.js:134-140` -> `create_node peers` (`src/raft/raft-rs-runtime-owner.js:404-410`) | services rows on the target node, plus the dispatched row stamp | voting and campaign authority: the ConfState itself | **the D1 skew; closed by the read** |
| 2 | Creation stamp: `src/rebalancer/rebalance-coordinator-operation-creation.js:506-587` | cache rows merged with the services owner | the stamp that feeds site 1 | closed by the read |
| 3 | Row-driven admission C1: `src/partition/partition-service-raft-peer-cache-reconciliation.js:295-357` (`:92-102` admits any row not FAILED/REMOVING/REMOVED), `:249-293` -> `admitPartitionRaftPeer` (`src/partition/partition-service-raft-membership-administration.js:120-134`); triggers `raft-init-base.js:581` and `src/partition/partition-service-core-base.js:840-870` | any services row of the partition, on the leader | a committed AddNode: voting authority for the row's replica | **stays**: it is the only admission path (F-A2) |
| 4 | Row-driven removal C3: `peer-cache-reconciliation.js:166-236` | a DELETE or REMOVED row | a committed RemoveNode (removal of authority) when the address still resolves | stays; usually skipped (F-A3) |
| 5 | Row-driven reservation: `peer-cache-reconciliation.js:317-333` -> `reservePartitionRaftPeerIdentity` (`membership-administration.js:17-26`) | row replica id | the ability to name a peer (address), not authority | discovery, stays |
| 6 | Durable rejoin without a record: `src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:205-215` (ACTIVE rows -> `replicaIds`) -> site 1's port path when `hasDurableRecord` is false (`src/raft/raft-rs-durable-store.js:467-471`) | ACTIVE rows | the ConfState | closed by O4 |
| 7 | Provisioning genesis: `src/query/sql-query-engine-provision-target-methods.js:290-355` (current rows union plan), decision at `src/query/sql-query-engine-initial-partition-provisioning.js:258-264` | provisioner rows | a founding ConfState, possibly a second one (F-A1) | **open** |
| 8 | Join/founder classification: `runtime-metadata-methods.js:298-345` (`existingReplicaCount`), `src/node/replica-handler-create-methods.js:441` (`isJoiningExistingGroup`), `core-base.js:309` (`deferElection`) | ACTIVE voter rows, the leader row, the fresh window (`src/node/replica-handler-transition-policy.js:75-84`) | whether election ticks start at creation (campaign authority in time) | **open** (F-A4) |
| 9 | Learner promotion: `src/partition/partition-service-learner-promotion-methods.js:416-422,559-584` (`becomeFollower` -> `startElection` -> `raft.startScheduling`, `raft-init-base.js:640-655`) | in-flight ADD-like operation rows, row statuses | election ticks start (campaign authority in time); the ConfState is untouched | **open** (a third F6 trigger) |
| 10 | Single-replica campaign: `raft-init-base.js:587-603` on `replicaIds.length === 1` | `replicaIds` (site 1's list, grown by rows at `peer-cache-reconciliation.js:330-333`) | an immediate campaign | named by the design (moved into the gate) |
| 11 | Write commit mode: `src/partition/partition-write-kernel.js:234-252` (`replicaIds.length <= 1` and a known remote leader -> REJECTED) | `replicaIds` | none gained; rows only refuse | safe direction, stays |
| 12 | Seed founders: `src/bootstrap/phases/seed-partitions-phase.js:87-104,197-210` | a constant, not rows | genesis; on restart with a lost DB, a second genesis (F-A1) | open |

Leadership and write authority proper come from the core's role
(`src/raft/raft-rs-status-observation.js:120-126`; write path
`src/partition/partition-service-write-metrics-base.js:702-712`), never from
rows. The `leader_node_id` row and `leaderAddress` (`runtime-metadata-methods.js:294-297,346-352`)
are discovery only (`syncFromLeader`, `create-methods.js:509-514`).

### Q2. Earliest point a new replica can campaign, vote, raise its term, lead, or accept a proposal

- **Campaign.** Four producers: (a) the port's `startScheduling()` at creation
  when election is not deferred (`src/raft/raft-rs-operation-port.js:221,306`);
  (b) the single-replica campaign at the end of `initialize`
  (`raft-init-base.js:587-603`); (c) the sole-voter resume campaign after a
  runtime reconstruction (`raft-rs-runtime-owner.js:449-478`); (d)
  `startElection()` (`raft-init-base.js:640-655`) from learner promotion
  (`learner-promotion-methods.js:416-422`), durable rejoin
  (`src/bootstrap/node-joining-publication-activation.js:129-141`) and the seed
  phase after all partitions are created. Each is gated by
  `campaignGroup`'s eligibility check: self in `voters`, not in `learners`,
  `promotable` (`raft-rs-runtime-owner.js:1093-1112`, refusal
  `NOT_ACTIVE_VOTER`). With O2 (self in the bootstrap) a joiner is eligible from
  its first tick. The design's gate adds `applied >= bootstrapIndex`.
- **Vote, raise term.** Not gated by the runtime: any delivered envelope whose
  group id and recipient match is stepped into the core
  (`src/raft/raft-rs-ingress.js:57-74,102-121`; no sender check), so a replica
  votes and adopts a higher term from its first drained inbound, i.e. as soon as
  the port exists (`raft-init-base.js:453-470`, before `initialize` returns).
  The D1 report measured a fresh replica's term follow the group's on its first
  campaign (case M) and non-member vote requests deposing leaders (case 2).
  Whether raft-rs grants a vote to or from an id outside its configuration at
  the step level is challenger B's question.
- **Lead.** Only through a campaign that wins, so the campaign gate bounds it.
- **Accept a proposal.** Only as leader (`write-metrics-base.js:702-712`;
  admission `membership-administration.js:120-134`); a follower's
  `proposeConfChange` is forwarded by raft-rs (challenger B for the forward
  path). Bounded by the campaign gate.

### Q3. Which of those can happen before committed membership is known

- Today (site 1): all of them, because the ConfState is the rows' and the
  replica is a voter of it from `create_node` (`runtime-owner.js:404-444`).
- Under the design with O2: campaign is blocked while `applied <
  bootstrapIndex` (section 3.5), so leading and accepting proposals are blocked.
  Voting and term adoption remain possible from the first inbound envelope,
  because nothing between the ingress and the core consults the participation
  gate (`raft-rs-ingress.js` checks only routing and field shape; the drain
  `RUNTIME_COMMAND.DRAIN_INBOUND`, `raft-rs-runtime-owner-constants.js:47-52`,
  "is not a tick"). A vote granted by a replica whose configuration is C_j is
  a vote counted by the requester over ITS configuration; whether that can
  complete an invalid quorum is a timing question (B). From the state side the
  cell to add is "target votes while applied < j": the model's decision 5
  covers campaign, tick and resume, not vote.

### Q4. Can a nonmember still make a legitimate leader step down

Yes, measured: D1 case 2 (`d1-skew-classification.md`, "Case 2"): a correctly
bootstrapped but unadmitted replica raised its term 1 -> 15 in 3 s and every
member stepped down at each new term; the group was leaderless in most samples.
Mechanism named there: `PRE_VOTE: false, CHECK_QUORUM: false`
(`src/raft/raft-rs-group-constants.js:13-18`), so a higher-term vote request
from any sender forces a step-down. The ingress admits any `from`
(`raft-rs-ingress.js:57-74`; R2 census C14). The design's O2 choice (self
excluded) would have removed the producer; with O2 rejected this release the
producer stays (design section 5, O2: "the churn of D1 case 2 stays").

### Q5. Does raft-rs reject such traffic, or must the runtime owner gate it

- raft-rs refuses to step some messages from ids it holds no progress for
  (leader side, `cannot step as peer not found`, recorded as a typed
  observation `recordInboundStepRefusal`, `raft-rs-runtime-owner.js:736-753`,
  surfaced as `inboundStepRefusals` in status, `status-observation.js:128-129`).
  D1 case 2 shows it does NOT refuse the vote request that raises the term. So
  raft-rs alone does not protect the leader; the runtime owner (or the ingress,
  which today has no sender rule) would have to gate by the committed
  configuration. Which raft-rs `step` arms refuse and which accept is
  challenger B's half; from the census, the only existing sender-side typed
  observation is the refusal record above, and no gate exists.

### Q6. How this works per path (state view)

| Path | Membership source today | Under O1/O2/O4 | State residual |
|---|---|---|---|
| ADD (A) | rows stamp union target cache, self included | stamp = C_j from the leader; self included (O2), gate until applied >= j | voting/term before j (Q3); admission still row-driven (F-A2); retried identity without a record (F-A3) |
| REPLACE (A) | as ADD; source stays (D1 constraint 1) | as ADD; source in C_j until RemoveNode | the planner's surplus lanes read RF+1 rows (F-A5); REPLACE completion rereads through a second seam (F-A6) |
| Formation (A-formation) | as ADD, from the seed coordinator | as ADD; the seed usually hosts the leader (local read) | seed system partitions all on one node at genesis; the join/founder classification (F-A4) decides tick start on joiners |
| Restart with a record | the record (`runtime-owner.js:292-300,404-424`) | unchanged; the gate index must be in the record (section 3.5) | restart during replay: covered; hard state present |
| Rejoin without a record (E) | ACTIVE rows (`restore-planner.js:205-215`) | O4: typed refusal, then ADD/REPLACE with a read | the planner's "skip" outcome (F-A10) leaves a committed voter unrestored; a seed restart with a lost DB has no such refusal today (F-A1) |
| RF = 1 | the sole voter's own record; a target from rows {s,t} | stamp {s}; t non-promotable (with O2 rejected: t is in its own bootstrap, so t is promotable and only the gate holds it) | after t leads, C1 on t admits whatever rows t sees (F-A2) |
| Genesis (B/C/D-first) | rows union plan, or the constant list | GENESIS stamp, index 0 | no group-existence check (F-A1) |
| Snapshot replacement (F) | the installed DB's record (`src/raft/snapshot-catchup.js:325-336`) | excluded (F5) | an installed DB without a record needs the O4 rule too |

### Q7. Joint configuration

- Production never enters one: the port emits only `{transition: 0, changes:
  [one]}` (`raft-rs-operation-port.js:103-123`); the raw `changes` pass-through
  (`:100-102`) has test callers only. A restored record can carry a joint
  ConfState only if one was written (`vendor/raft-rs-wasm/src/lib.rs:392-401`).
- Readers that already treat `votersOutgoing` as voters: `isSoleVoter`
  (`raft-rs-runtime-owner.js:449-452`) and the REPLACE owner's completion check
  (its design `:439,573`). Readers that ignore it: the status `peers` list
  (`status-observation.js:45-54`), hence `admitPartitionRaftPeer`'s
  ALREADY_MEMBER test (`membership-administration.js:126-128`) and C1/C3's
  address matching (`peer-cache-reconciliation.js:169,336`). So during a joint
  configuration C1 could re-propose an outgoing voter as an add, which raft-rs
  refuses (`Changer::simple` on a joint configuration, design F4) and the
  admission records REFUSED. The design's read refuses
  `MEMBERSHIP_IN_JOINT_TRANSITION`; the target refuses the same at validation.
  Replaying a joint enter/leave over a later bootstrap fails (F4), so the
  fail-closed outcome is a held group (`RECOVERY_REQUIRED`). No src path can
  produce the state; the cell is a refusal cell only.

### Q8. Can the read fail or be stale, and the fail-closed behaviour

- Fail: no local replica (`NOT_HOSTED`, the handler's `localServices` is filled
  by create, registration and replacement only:
  `src/node/replica-handler-create-methods.js:477`,
  `src/node/replica-handler-runtime-methods.js:322-346,357-359`); not the leader
  (`NOT_LEADER`); a redirect without an address when the answering member never
  reserved the leader (`status-observation.js:27-31,58-66`, F-A8); joint;
  unresolved identity; a port whose group is held (`readStatus` returns the
  held status, `raft-init-base.js:606-617` shows the shape). Delivery failure
  and timeouts are B's.
- Stale: any committed configuration is valid (F2) because rs-raft never
  compacts (`src/raft/raft-rs-durable-store.js:247`); the observation memo
  (`raft-rs-runtime-owner.js:1082-1090`) is keyed on the observation object the
  runtime replaced, so a shaped status is as fresh as the last `READ_STATUS`
  command; whether that command has run in the same turn is B's.
- Fail-closed: the creation throws before `persistNewOperation`
  (`creation.js:752` precedes `:815`), so no operation row exists and no
  dispatch carries a row stamp; the target refuses a missing or non-COMMITTED
  stamp (`STAMP_INVALID`) instead of resolving from its cache
  (`runtime-metadata-methods.js:236-289` today). The one path that still
  produces a group without a read is genesis (Q6, F-A1).

### Q9. Is there a cycle: membership to communicate, communication to read membership

No, because the port separates the two inputs by contract. Addressing is
`RESOLVE_PEER_ADDRESS` and `SEND_TO_PEER`; membership is `BOOTSTRAP_PEER_IDS`
or the durable record (`src/raft/raft-provider-contract-constants.js:21-50`).
`resolvePeerAddress` goes registry -> identity -> `buildPeerAddress`
(`raft-rs-operation-port.js:169-177`; `core-base.js:681-730`), which reads the
dispatched `peerAddresses` hints and the services cache, never the ConfState.
The read itself is routed by node id (`messageRouter.deliver(<node>/service/replica-handler,
..., {targetNodeId})`, `src/rebalancer/user-table-leader-placement-cure.js:395-400`)
using the `leader_node_id` row as a hint. So the coordinator needs rows to find
a node, the node needs nothing but its local port to answer, and the target
needs the answer's `identities` plus address hints to talk to the group. The
remaining dependency on rows is discovery only, in the intended split. The one
place membership and addressing still meet is C1 (site 3): a row both names an
address and grants a vote.

### Q10. The minimal discovery channel that breaks the cycle without granting authority

What the census shows already exists and grants nothing: (1) the nodes table
and the message router's node addressing (`deliver(..., {targetNodeId})`);
(2) the partitions row's `leader_node_id` as a routing hint only
(`runtime-metadata-methods.js:294-297`); (3) the services rows and dispatched
`peerAddresses` as an address book consumed through `buildPeerAddress`
(`core-base.js:681-730`) and `resolvePeerAddressFromCache`; (4) the identity
registry as the name-to-id map (`src/raft/raft-rs-peer-identity.js:111-125,154-163`).
None of these reaches `create_node`, `campaign` or `proposeConfChange` except
through site 3 (C1). The minimal channel is therefore rows as address book plus
the leader-node hint, with C1's admission trigger re-homed to an explicit
request (the R2 design's request owner) so that a row can no longer propose a
vote. That last step is a redesign and is not proposed here; the census only
shows that C1 is the single remaining site where discovery grants authority.

### Typed refusals O4 needs: which existing families fit

| Refusal needed | Fitting family (module) | How it stays distinguishable |
|---|---|---|
| Rejoin (E/F) without a durable record | The port's opening outcome: `RUNTIME_PHASE.DURABLE_RECORD_READ` with a new `RUNTIME_REASON` (`src/raft/raft-rs-runtime-owner-constants.js:80-133`), answered as `RAFT_OPERATION_OUTCOME.CORE_REFUSED` with `retryable: false, recoveryRequired: false` (`src/raft/raft-operation-port-constants.js:12-17`), surfaced by `consensusInitRefusedError` with `code = PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED` and the phase (`raft-init-base.js:93-100`; `src/partition/partition-service-constants.js:221-227`) | An UNREADABLE record is today a `HOST_FAILURE` at the same phase with `retryable: true` (`runtime-owner.js:292-300`, `groupHostFailure`): temporary. A MISSING record must be `CORE_REFUSED`, non-retryable, at the same phase. The legacy-DB refusal already shows the pattern (`LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED`, `src/partition/partition-legacy-consensus-state-constants.js:38-43`, thrown before the port at `raft-init-base.js:385-398`) |
| Membership unreadable at creation (no member answers) | The creation owner's typed error before persistence (`creation.js:752`), in the style of the retryable-prefix class the handler already uses for metadata misses (`runtime-metadata-methods.js:86-108`) but with its own name | Distinguished from `NOT_LEADER` (redirectable) and from `NOT_HOSTED` (the node has no replica) by reason; all three are temporary unavailability and re-plan; none is a bootstrap outcome |
| Not admitted yet (ordinary learner state) | `RAFT_MEMBERSHIP_ADMISSION_OUTCOME` (`raft-operation-port-constants.js:99-106`): `NOT_LEADER`, `QUEUED`, `DEFERRED`, `PROPOSED`, `ALREADY_MEMBER`; and the campaign refusal `RUNTIME_REASON.NOT_ACTIVE_VOTER` at `RUNTIME_PHASE.CAMPAIGN_ELIGIBILITY` (`runtime-owner.js:1101-1108`) | These are states, not errors; they must never be reported as a refusal of the bootstrap |
| Identity unresolved | `RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED` (`raft-operation-port-constants.js:34-38`) and `RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED` / `PEER_ADDRESS_STATUS.UNRESERVED` (`src/raft/raft-rs-peer-identity-constants.js:35`; `runtime-owner-constants.js:57-63`) | `PEER_ADDRESS_STATUS.UNAVAILABLE` is the temporary case (address not resolvable now); `UNRESERVED` is structural; the read's `MEMBERSHIP_IDENTITY_UNRESOLVED` should carry the identity-resolution value, not a new string |
| Permanent exclusion (removed replica) | The lifecycle owner's `RETIRED` state (`src/raft/raft-rs-replica-lifecycle-owner.js:8-15,87-102,119-147`), answered as `RUNTIME_REASON.CLOSED` (`runtime-owner-constants.js:118-119`), plus the leader's typed step refusal record (`runtime-owner.js:736-753`) | Distinct from all the above by being a durable local state (`state = 'retired'` row, `:48`) |
| Stamp invalid at the target | New; no family exists for "the dispatched request is not acceptable". The nearest is `ReplicaOperationResponseStatus.ERROR` (`src/rebalancer/replica-operation-constants.js:36-43`) which is untyped | Needs a reason enumeration in the same module as the stamp kinds (F-A13, no owner file named yet) |

Cannot answer from the census and deferred to challenger B by name: which
raft-rs `step` arms accept a vote request from an id outside the configuration
(Q4/Q5); whether a target can grant a vote that completes an invalid quorum
during the gate window (Q3); read freshness relative to the drain turn and the
delivery timeout (Q8).
