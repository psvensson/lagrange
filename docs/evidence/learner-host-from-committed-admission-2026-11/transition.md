---
audience: evidence
recorded: 2026-11-02
quest: learner-host-from-committed-admission
---

# Transition record: learner promotion proof from the committed configuration and the leader's admission

Quest `learner-host-from-committed-admission` (epic `raft-rs-full-cutover`), 2026-11-01. Worktree
`lagrange-learner-host-20261101`, base `f70f43a29` (`src/` identical to origin/main `62d537313` and the 0.4.0 image).
Contract-first record (`solver-quests.md`, "Contract-first owner work"). Line numbers are of the base.

**Status:** sections 1-7 were written first and the work stopped on the stated stop condition (the host cannot
be committed without a schema change of the runtime owner's identity record). The lead then chose Option A;
section 8 records the change as built. Sections 1-4 remain the contract.

## 1. Transition

| Element | Statement |
| --- | --- |
| Trigger | A learner's `LEARNER_PROMOTION_PROOF` request `{partitionId, replicaId, membershipEpoch}` reaches the replica it believes leads (`partition-service-learner-promotion-proof-methods.js:197-241` sends, `:69-125` answers). |
| Authoritative facts | (1) This replica's live raft role and term (`raft.readStatus()`). (2) The committed configuration: `READ_COMMITTED_MEMBERSHIP` answered by the raft-rs runtime owner (`raft-rs-committed-membership-read.js:107-156`): `voters`, `learners`, `identities: peerId -> replicaIdentity`. (3) The leader's own replication progress for the learner's raft peer (raft-rs `Progress[id].matched`, shaped by `raft-rs-status-observation.js:76-97`). (4) The membership epoch both sides bind (unchanged: `resolveLearnerPromotionMembershipEpoch`). (5) Only where a message must be *sent* (the replication nudge, transport): the learner's host, as recorded when the leader admitted it. |
| Never an input | Any `systemTableCache` row (`SERVICES` + `isLivePartitionServiceRow`), the bootstrap `peerAddresses` hint list, a learner-supplied index or host. |
| Permitted actions | GRANT (`progress_proven`) iff leader at a known term, learner's raft peer id in the committed `voters` or `learners` under exactly the requested replica identity, epochs equal, matched >= commit index. Otherwise one named refusal: `NOT_LEADER` (checked first, before any other read), `NOT_IN_CONFIGURATION` (absent from the committed configuration or bound to another identity), `EPOCH_*`, `TERM_UNAVAILABLE`, `PROGRESS_BEHIND` (then one nudge to the admitted host), `REQUEST_INVALID/request_shape`. |
| Durable commit point | The admission: the leader's ADD conf change committed in the group log (that is what puts the peer in the committed configuration), and the record of the admitted identity *with its host* written with the existing durable identity write (`raft_rs_peer_identity`), so it survives restart. See section 5: this second half is the conflict. |
| Restart / lost answer | The proof is stateless and never persisted on either side (`learner-promotion-progress.js` header). A lost answer is re-requested on the learner's cadence. A restarted leader re-reads its committed configuration (durable log + applied state) and its admission records (durable identity store); it grants or refuses from those. A learner in neither refuses `NOT_IN_CONFIGURATION`; a replica that no longer leads refuses `NOT_LEADER`, and the learner re-discovers the leader. Leadership transfer: the new leader must hold the same facts, so the host must be a fact of the committed log, not of one replica's local reservation (section 5, point 3). |
| Deleted for this decision | `buildPeerAddress` call in the proof handler (`proof-methods.js:88-97`); `LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE` (`learner-promotion-progress.js:98`); the learner's re-assert-on-that-cause wake (`partition-service-learner-promotion-wake-methods.js:178-209`, `replica-state-machine.js:566`); the cache path `resolvePeerAddressFromCache` and the cache-overrides-list rule inside `resolveKnownPeerAddress` (`partition-service-core-base.js:544-608, 666-690`) as the transport resolver bound to the port (`partition-service-raft-init-base.js:466-467`). |
| Remaining obligations / owners | C3 transport address for learners and voters (`RESOLVE_PEER_ADDRESS`, raft-rs runtime owner + partition host): consumes the same admitted-host fact; unknown identity is a typed refusal recorded as that peer's delivery outcome (`raft-rs-peer-delivery.js:144-150` already records ADDRESS_RESOLUTION). C3 message-group resolver (`message-group-service-peer-resolution.js:58-156`): same fact, same owner pair, named follow-up. C4 leader address for write forwarding (`partition-service-core-base.js:614-631`, cache first): out of scope, named. Snapshot catch-up derives the follower node from the resolved address (`snapshot-catchup.js:177-184`): consumes C3's answer, no own decision. |

## 2. Why the proof decision needs no host (finding)

The proof handler resolves an address for two reasons only: to look up `followerProgress[learnerAddress]` and to
nudge `probePeerProgress(learnerAddress)`. Both are artefacts of the status shape, not of the decision:

- `followerProgressSnapshot` (`raft-rs-status-observation.js:76-97`) keys raft-rs progress (by peer id) by the
  address the *same* cache-backed resolver returns, and drops a peer whose address does not resolve. So even a
  handler that knew the host would find no progress for the learner while the cache misses its row.
- `probePeerProgress` (`raft-rs-runtime-owner.js:1662-1690`) maps the address back to a configured peer id by
  resolving every configured id through the same resolver (`configuredPeerAt`, `:1624-1633`).

The etcd shape (`Progress[id].Match` against the leader's commit) decides from the committed configuration and
progress keyed by identity; the host is needed only to send. So C2 (decide) is separable from C3 (send), and only
C3 needs the host.

## 3. Common invariant (etcd / TiKV), applied

etcd: the ConfChange `Context` carries the member's peer URLs; every member applying the entry learns the address
from the log; promotion reads leader-side `Progress[id].Match`. TiKV/PD: the ConfChange carries `Peer{id, store_id}`;
store addresses come from PD's committed store records. In both, the committed entry carries the facts every later
leader needs; no member resolves a peer from a side cache, and a stale view is a typed error.

## 4. Single authority after the change

One fact per peer: `{replicaIdentity, raftPeerId, host}` committed with its admission and applied on every replica of
the group; read back through the raft-rs runtime owner (`READ_COMMITTED_MEMBERSHIP` identities and the port's
transport resolver), never re-derived from rows. Rows stay discovery (A8): the row-driven reconciliation may still
*trigger* an admission (`partition-service-raft-peer-cache-reconciliation.js:302-346`), but after the admission
commits, the row is never consulted to decide or to address.

## 5. The exact conflict (stop condition)

1. **The identity record has no host and no free field for one.** `raft_rs_peer_identity` is
   `(replica_identity TEXT PRIMARY KEY, raft_peer_id TEXT NOT NULL UNIQUE, learner_admission TEXT)`
   (`src/raft/raft-rs-peer-identity-constants.js:9-43`). `learner_admission` is the committed ADD_LEARNER *origin*
   of the FreshMG message-group workflow: an exact-key codec `{groupId, index, term, context}` whose context is the
   exact six managed keys `{operationId, transitionIdentity, permitSequence, stage, replicaIdentity, peerId}`
   (`raft-rs-committed-membership-context.js:12-20, 41-48, 146-241`), written only inside the application transaction
   with `WHERE learner_admission IS NULL` (`constants.js:35-37`), and read as RECORDED/ABSENT/UNVOUCHED coverage by
   the committed learner-action read (`raft-rs-committed-membership-read.js:204-274`). Putting a host there would
   make every partition identity decode `INVALID` (`CORRUPT` refusals) and conflate two facts in one column.
2. **The partition admission carries no context.** `admitPartitionRaftPeer` -> `admitGroupPeer` -> `proposeConfChange
   ({type: ADD_PEER, replicaIdentity, peerAddress})` (`raft-rs-group-membership-admission.js:121-126`); the port's
   `normalizedConfChange` keeps only `{changeType, nodeId}` and drops `peerAddress` (`raft-rs-operation-port.js:130-158`).
   The leader holds the host for the duration of that call and records it nowhere but a debug log line
   (`recordAdmission`, `:100-115`).
3. **A local admission record would not survive a leader change.** Reservation rows are written by whichever replica
   reserves (`raft-rs-peer-identity.js:168-229`), not replicated. In the live run leadership of `replica_operations-p1`
   moved to node 3 (first-divergence #20); a successor leader never admitted the learners its predecessor admitted, so
   it would hold no host for them. Only a fact committed in the log (etcd's ConfChange context) reaches every leader.
4. **Snapshots carry the identity record with exact keys.** `peerReservations` are `{replicaIdentity, peerId,
   learnerAdmission?}` exact-key (`snapshot-checkpoint-constants.js:49`, `snapshot-checkpoint-format.js:120-149`), and
   install/store compare them field by field (`snapshot-install.js:401-412`, `snapshot-checkpoint-store.js:466-476`).
   A host field changes the snapshot checkpoint format.

Therefore: host in the admission record => new column of `raft_rs_peer_identity` + snapshot checkpoint format;
host in the committed configuration => a context on the partition ADD conf change (codec change in
`raft-rs-committed-membership-context.js`, whose ADD_NODE stage today means the managed PROMOTE) recorded at apply
on every replica => the same new column. Every route that meets the brief's "durable, read back through the runtime
owner, survives restart" is a schema change of the runtime owner's identity record. Per the brief: stopped, no cache
read added, no `src/` change made.

## 6. Decision needed (owner / lead)

- **Option A (the brief's design, made committed):** add `node_id` to `raft_rs_peer_identity` (precedent: the
  `learner_admission` ALTER migration, `constants.js:32-34`), carry `{replicaIdentity, peerId, nodeId}` as the context
  of the partition ADD conf change, record it at apply on every replica in the application transaction, extend the
  snapshot checkpoint's `peerReservations` with it, answer `identities` with hosts from `READ_COMMITTED_MEMBERSHIP`,
  and bind the port's transport resolver to it (C2 + C3 together, one fact). In-place upgrade of existing groups is
  already declared unsupported (rs-raft closeout rulings 2026-10-04), so no dual-shape decoder is needed.
- **Option B (narrowed, no schema change):** decide the proof from the committed configuration + progress keyed by
  replica identity (a read-surface extension of `raft-rs-status-observation.js`, nudge by peer id), deleting the
  cause and the wake; C3 transport keeps its cache resolver as a named residual of the class (the quest statement's
  "cache paths for transport are deleted" would then be amended). Fixes the 6-25 s proof refusals; leaves a leader
  that misses a learner's row unable to *send* to it.

## 7. Red tests (written, red for the right reason on the base)

`test/partition/learner-promotion-proof-committed-admission.test.js` (single file, `node --test`):

| Test | First failing assertion on the base |
| --- | --- |
| (a) admitted, caught-up learner, no services row -> granted | `the committed configuration and the admission decide, not the cache`: expected `granted`, actual `refused` (cause `learner_address_unresolvable`) |
| (b) stale row (node-9) -> nudge reaches the admitted host | `the nudge goes to the host the leader admitted, never the stale row`: expected `["node-3/partition/replace-replica-804a4438"]`, actual `["node-9/..."]` |
| (c) absent from configuration, live row present -> NOT_IN_CONFIGURATION | expected `not_in_configuration`, actual `progress_behind` |
| (d) follower -> NOT_LEADER first | expected `not_leader`, actual `request_invalid` (address resolution runs before the leadership check) |
| (f) static census | `src/` files naming `learner_address_unresolvable`: `node/replica-state-machine.js`, `partition/partition-service-learner-promotion-proof-methods.js`, `raft/learner-promotion-progress.js`; the proof handler calls `buildPeerAddress`; the port's `RESOLVE_PEER_ADDRESS` is bound to `buildPeerAddress` |

Not yet written, because their fixture *is* the undecided durable shape: (e) restarted leader re-reads the admission
record from the durable identity store (Option A: a `RaftRsPeerIdentityRegistry` over the same database); (g) the
port's transport resolver answers an admitted learner from the committed fact with no row and refuses an unknown
identity typed (Option A only; under Option B it is the named residual).

Witnesses that change with the deletion (to be updated in the change, not now):
`test/partition/partition-service-learner-promotion-wake.test.js:287-330`,
`test/convergence/dt6-learner-promotion-proof-channel-wake.test.js:146, 630-700, 1020-1085` (the `withholdRow`
fixture asserts the refusal as intended behaviour), `test/node/replica-local-only-row-convergence.test.js:467`.

## 8. Lead decision 2026-11-01: Option A, and how it was built

The lead chose Option A (quest log). Shape as built, against the brief's nine steps:

1. **Conf-change context.** An ADD through `proposeConfChange` (`ADD_PEER`, `ADD_LEARNER`) must name a `nodeId`
   (refusal `membership-change-without-node-id`) and commits the admission context
   `{replicaIdentity, peerId, nodeId}` (`raft-rs-committed-membership-context.js`
   `encodeCommittedAdmissionContext` / `committedAdmissionContext`, an exact three-key shape distinct from the
   six-key managed context, which is untouched). `normalizedConfChange` (`raft-rs-operation-port.js`) no longer
   drops what the admission knows. Every replica applying the entry records the node in the same application
   transaction (`applyCommittedMembershipContext`), including entries folded into a joiner's bootstrap.
   The node is the unified address's node component, i.e. the logical node identity the transport already
   routes by; no host string or port is committed (the listener-port model maps node to host:port below this
   layer and is unchanged).
2. **Identity record.** `raft_rs_peer_identity.node_id` (ALTER precedent of `learner_admission`), written once
   from a committed fact (`recordCommittedNodeId`: same value is a no-op, another value a conflict, never a
   replacement); read by `committedNodeIdOf`. The peer-id derivation stays placement-independent.
3. **Snapshots.** `peerReservations` are `{replicaIdentity, peerId, nodeId?, learnerAdmission?}`: each recorded
   fact present exactly when recorded (the canonical descriptor JSON forbids null, so an unrecorded node is an
   absent key, like `learnerAdmission`), exact key set, compared field by field at install and store; no
   decoder for the old shape.
4. **Read.** `READ_COMMITTED_MEMBERSHIP` answers `nodeIds: {peerId: nodeId|null}` beside `identities`
   (a sibling map rather than changing `identities`' value type, which 27 test files and 9 src consumers read
   as a string). COMMITTED stamps carry it (exact field set), GENESIS stamps carry `founderNodeIds`
   (producers: initial table provisioning from its planned placement, the seed allocation (every partition
   founder on the seed node); message groups and WASM services pass an explicit empty record, their address
   owners being the named follow-up). Bootstraps record both into the identity record.
5. **Proof (C2).** `handleLearnerPromotionProofRequest` (now async): request shape; `NOT_LEADER` before any
   other read; the partition's one committed-membership reader (`readPartitionCommittedMembership`,
   `partition-service-raft-membership-administration.js`, a witness `READ_COMMITTED_MEMBERSHIP`; the T7 caller
   census is unchanged) must name the learner as voter or learner under exactly its
   identity, else `NOT_IN_CONFIGURATION` (an unreadable configuration answers `CONFIGURATION_UNAVAILABLE` with
   the read's reason as cause: a named state, not a third authority); then the predicate over
   `followerProgress[replicaIdentity]`. Status shaping keys progress by replica identity and never drops a peer
   for an unresolvable address; the probe names a replica identity and `configuredPeerOf` maps by id.
6. **Transport (C3).** The port hands the host resolver each peer's committed node
   (`resolvePeerAddress(replicaIdentity, committedNodeId)`); the partition binds `committedPartitionPeerAddress`
   (`src/partition/partition-committed-peer-address.js`), which formats the unified address on that node or
   throws `peer_not_in_configuration`, recorded by `raft-rs-peer-delivery.js` as the peer's own
   `address_resolution` delivery failure. Snapshot catch-up consumes the same answer (its follower node is parsed
   from the committed address). The message-group resolver stays a named follow-up: its FreshMG learner
   admission commits the frozen six-key managed context, which cannot carry the node without changing the
   `learner_admission` format the lead ruled untouched (its ADD_PEER admissions do commit the node now).
7. **Deleted.** `learner_address_unresolvable` (3 files); the learner re-assert wake
   (`reactToLearnerPromotionRefusalCause`) and `ReplicaStateMachine.reconcileLocalOnlyServiceRowsNow`;
   partition `buildPeerAddress` / `resolveKnownPeerAddress` / the hint list `peerAddresses`; the init loop's
   cache-address admission of bootstrap peers (`isBootstrapPeerAdmissible`): configured peers are members;
   the row-driven stale-address REMOVE/re-ADD (it proposed `REMOVE_PEER` without a replica identity, which
   the port already refused `membership-change-without-replica-identity`: dead in production); the
   reconciliation's membership test by address (now by replica identity). A retiring row still retires a
   configured peer only where its address equals the peer's address, which is now the committed node's
   address (a row contradicting the committed node is no evidence), and the removal names the replica
   identity. The unused peer-address resolver module under the raft directory (`peer-address-resolver`, its constants module and its two test files) is deleted.
   `resolvePeerAddressFromCache` remains for C4 only (leader address for write forwarding,
   out of scope, named).
8. **Witnesses** updated to the new contract: `partition-service-learner-promotion-wake.test.js` (no refusal
   re-asserts a row), `dt6-learner-promotion-proof-channel-wake.test.js` (withheld row: `not_in_configuration`
   until admitted; new cpp drive: an admitted learner whose leader cache lost its row is granted within the
   bound, never refused), `dt6-learner-promotion-progress-proof.test.js`, `replica-local-only-row-convergence`
   (no on-demand kick), `learner-promotion-progress-proof-contract`, the committed-membership census/static
   enumerations (`nodeIds`), partition admission/retirement/reconciliation tests, the address-authority
   witness, and every raft-rs backend fixture that proposes an ADD (now with a node), reads progress or probes
   (by replica identity), or forges a stamp (with `nodeIds`/`founderNodeIds`).
9. **Quest tests.** `test/partition/learner-promotion-proof-committed-admission.test.js` (a)-(g): (a)-(d), (f)
   red on the base as recorded in section 7; (e) restarted leader and (g) transport from the committed fact
   import `partition-committed-peer-address.js`, which does not exist on the base (red at load); all green on
   the change.

## 10. Lab-cone failures of the last run (2026-11-02, `2efddc37d`) and their dispositions

Receipts: `test-output/reports/test-results-<host>.ndjson` of that lab run (copied to the controller worktree),
the lab console kept with the run; each disposition was re-checked locally on the base (`f70f43a29`) and the change.

| Test file | Host | Disposition |
| --- | --- | --- |
| `test/partition/partition-admission-redrive-wakes.test.js` | tv-dator | fixed (`e532dacba`: founders carry their committed nodes) |
| `test/scripts/solve-footprint-accounting.test.js` | lenovo-laptop | base-red (fails identically on the base) |
| `test/bootstrap/fresh-join-registration-runtime-replacement.integration.test.js` | adams-gamla | flaky (8/8 locally on the change and the base) |
| `test/bootstrap/retained-seed-original-handoff.integration.test.js` | lenovo-laptop | slow-host (R1 hit its 180 s budget; R1 takes 55-61 s locally on both base and change) |
| `test/bootstrap/node-bootstrap-consistency.property.test.js` | lenovo-laptop | flaky (green on local re-run of the change; green on the base) |
| `test/integration/membership-consistency.integration.test.js` | adams-gamla | base-red/flaky (timeouts in a different subtest per run on the base too) |
| `test/integration/public-binding-cell-invocation-seam.integration.test.js` | carinas-windows | base-red (0/3 on the base) |
| `test/integration/critical-replica-placement-causal-trace.integration.test.js` | tv-dator | base-red (same timeout on the base) |
| `test/integration/three-node-seed-rebalance.integration.test.js` | controller | flaky (after-end `timeout!` subtest; 1 of 3 base runs and 1 of 3 change runs) |

Note (independent verifier, 2026-11-02): on the base the verifier observed `three-node-seed-rebalance` fail on its
substantive assertion `moves at least one partition replica off seed node` (12.7 s), not on the after-end timeout the
row records; the disposition stays flaky-on-change/base-red.

## 11. Refusal set (verifier F3 wording)

The refusals that REPLACE address resolution in the proof handler are `NOT_LEADER`, `NOT_IN_CONFIGURATION` and
`CONFIGURATION_UNAVAILABLE`. `REQUEST_INVALID` (request shape, response binding), `TERM_UNAVAILABLE`, `EPOCH_*` and
`PROGRESS_BEHIND` remain as before.
