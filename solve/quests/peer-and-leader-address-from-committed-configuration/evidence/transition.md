---
audience: evidence
recorded: 2026-11-02
quest: peer-and-leader-address-from-committed-configuration
---

# Transition record: peer and leader address from the committed configuration

Quest `peer-and-leader-address-from-committed-configuration` (epic `raft-rs-full-cutover`), instances C3
(message-group half), C4 and U11 of the projection-authority census
(census `projection-authority-census-2026-11-02/CENSUS.md` under `solve/epics/raft-rs-full-cutover/evidence/` on the branch
`origin/work/projection-authority-census-20261102`, section 2 C3/C4, section 4 Group B, section 6 U11).
Base `df28ef54a` = `origin/work/learner-committed-admission-rebase-20261102` (PR #184 head: main `e4937c765`
plus the landed learner quest). The census's file:line for these instances were re-checked on this base and
hold unchanged (the census HEAD `b26d2c090` has byte-identical `src/` for these files). Template: the repaired
partition half, `docs/evidence/learner-host-from-committed-admission-2026-11/transition.md`.

## 1. Current chain (base)

| Decision | Site | Inputs today |
| --- | --- | --- |
| C3-mg raft peer address | `message-group-consensus-port.js:69-77` bound at `:129-130` | `buildPeerAddress(id, {allowBootstrapHints, consensusResolution})` (`message-group-service-peer-resolution.js:58-99`): services cache row first (`resolvePeerAddressFromCache` `:135-157`), then the hint list `peerAddresses` (`:100-128`, warn `logBootstrapHintFallback`); the port's second argument (committed node, `raft-rs-operation-port.js:305-312`) is dropped. |
| C3-mg founders | `message-group-consensus-port.js:99`, `seed-original-allocation-declaration.js:64-72` | GENESIS stamp passes `{}` founder nodes ("follow-up of C3"). |
| C3-mg FreshMG learner | `raft-rs-membership-transition.js:135-166`, `raft-rs-committed-membership-context.js:12-20` | managed context is six keys, no node: the learner's node is never committed. |
| C3-mg non-port consumers | forwarding `message-group-forwarding-owner.js:578`, `-delivery-methods.js:602`, `-native-delivery-methods.js:180`, `control-plane/replica-dispatch-readiness-capture.js:656`, `-target-methods.js:114` | `buildPeerAddress(id)` / `resolvePeerAddressFromCache(id)`: cache row, then live consensus status. |
| U11 forwarding leader | `message-group-forwarding-owner-target-methods.js:16-78` | pending publication, persisted publication, `message_groups` cache row `leader_node_id`, then `isLeader` hint. Consumed by the strict-CDC local-ingress decision (`-routing-methods.js:600`), the join-convergence target (`message-group-forwarding-owner.js:628-655`, over the hint list `peerAddresses`) and ingress-decision diagnostics. |
| C4 leader address | `partition-service-core-base.js:539-556` | cache row first (`resolvePeerAddressFromCache` `:595-618`), live raft status second (`resolveLiveRaftLeaderAddressForPeer`, suppressed unless it equals `this.leaderId`), `leaderAddressHint` / `resolveLeaderIdFromHint` seeding `leaderId`. |

## 2. Committed facts available

- Every replica records the committed node of each admitted peer at apply (`raft_rs_peer_identity.node_id`,
  `registry.committedNodeIdOf`), and the port hands it to the host resolver as the second argument.
- `READ_COMMITTED_MEMBERSHIP.nodeIds`, COMMITTED stamps carry `nodeIds`, GENESIS stamps carry `founderNodeIds`
  (recorded at bootstrap, `raft-rs-bootstrap-membership.js:144`).
- `raft.readStatus()` names the live leader (`leaderId`), its committed address (`leaderAddress`, resolved through
  the port, i.e. the committed node) and `leaderAddressStatus` (`resolved` / `unavailable` / `unreserved` /
  `no-leader`), and every configured peer's committed address.
- Missing: message-group founders' nodes (GENESIS `{}`), the FreshMG managed learner's node (six-key context).
  The workflow knows both: the seed allocation places every founder on the seed node; the FreshMG identity
  record carries `sourceNodeId`/`targetNodeId` for the two replicas a transition may name.

## 3. Transition after the change

| Element | Statement |
| --- | --- |
| Trigger | A raft envelope to a peer; a CDC/control-plane forward to the group leader; a partition write redirect. |
| Authoritative facts | The committed node of the peer (identity record, written once at apply from a committed context or stamp); the live raft status leader and its committed address. |
| Never an input | A `services` or `message_groups` cache row, a bootstrap hint list (`peerAddresses`), a leader-id hint, a publication memo. |
| Permitted action | Address = unified address on the committed node. No committed node: typed `peer_not_in_configuration` (recorded by the port as that peer's delivery outcome). No live leader: typed NO_LEADER / NOT_LEADER. |
| Durable commit point | The ADD conf change (context `{replicaIdentity, peerId, nodeId}` or the managed context with `nodeId`) or the GENESIS/COMMITTED stamp, applied in the application transaction. |
| Restart / lost answer | The identity record is durable; a restarted replica answers from it. Status is live; no answer is persisted. |
| Remaining obligations | Rows remain the A8 discovery trigger of a host-proposed ADD (`expectedPeersFromServicesCache`, which still supplies the node it commits; the partition analogue is owned by `replica-admission-from-committed-operation`). |

## 4. One shape (D-C3)

Admission context of a host-proposed ADD: `{replicaIdentity, peerId, nodeId}` (unchanged). Managed FreshMG
context: `{operationId, transitionIdentity, permitSequence, stage, replicaIdentity, peerId, nodeId}` for every
stage (ADD_LEARNER, PROMOTE, REMOVE); `nodeId` is the node of the replica the permit names, taken from the
identity record (`targetNodeId` or `sourceNodeId`). The applied context records `nodeId` with the identity in
the same transaction (`applyCommittedMembershipContext`). A context or retained learner origin without `nodeId`
does not decode (MALFORMED at apply; `INVALID` origin, i.e. `CORRUPT` at the committed learner-action read): no
decoder for the six-key shape.

## 5. Deletions

Attempt 1: `buildPeerAddress`, message-group `resolvePeerAddressFromCache`, `resolvePeerAddressFromHints`,
`logBootstrapHintFallback`, `bootstrapHintFallbackLogged`, the `allowBootstrapHints`/`consensusResolution`
options, the message-group `peerAddresses` option and its plumbing (`message-group-service-state.js:240`, seed and
join create phases, replica lifecycle, forwarding join-convergence target), `USING_BOOTSTRAP_PEER_HINT_...` and
`BOOTSTRAP_HINT`, `resolveLivePeerAddressFromConsensus` (folded into the one committed resolver),
`resolveCanonicalLeaderIdentityFromCache`/`...NodeIdFromCache` and the cache/publication/hint leader-identity
states. Attempt 2: partition `resolvePeerAddressFromCache`, `PEER_ADDRESS_FROM_CACHE`, the `this.leaderId`
cross-check of `resolveLiveRaftLeaderAddressForPeer`, `leaderAddressHint`, `resolveLeaderIdFromHint`.

## 6. Blast radius (files naming the surface on the base: src / test)

`buildPeerAddress` 6/6; `resolvePeerAddressFromCache` 4/1; `allowBootstrapHints` 6/3 (the control-plane kernel
ingress option of the same name is a different concern, not touched); `resolveCanonicalLeaderIdentityFromCache`
3/1; `resolveJoinConvergenceBootstrapForwardTarget` 3/1; `resolveLeaderAddress` 6/9; `transitionIdentity` (FreshMG
context fixtures) 10/15; `founderNodeIds` 5/6; `peerAddresses` in message-group/bootstrap/raft tests 48 (most name
the partition or rejoin hint lists, which are not this quest's).

## 7. Attempts

1. Message-group half: committed resolver binding, GENESIS founders, D-C3 codec, U11 forwarding leader from
   the live status, attempt-1 deletions. Verified independently before attempt 2.
2. C4: `resolveLeaderAddress()` from `raft.readStatus()` only, after merging the then-current head of
   `origin/work/replica-admission-committed-operation-20261102`.

## 8. Attempt 1 as built (message-group half, U11, D-C3)

1. **One committed address.** `src/raft/raft-rs-committed-peer-address.js` owns
   `committedPeerAddress(entityType, replicaIdentity, committedNodeId)` (typed `peer_not_in_configuration`) and
   `founderNodeIdsOfPlacement` (founding placement -> GENESIS `founderNodeIds`; the query provisioner's local copy
   is deleted). The partition binding `committedPartitionPeerAddress` delegates to it. The message-group
   `RESOLVE_PEER_ADDRESS` binding takes the port's two arguments; its only other clause is the replica's own
   address (a replica knows where it runs; no projection is read).
2. **Host-side reads.** `MessageGroupService.resolveCommittedPeerAddress(peerId)` answers a configured peer's
   address from this replica's raft status (whose peer addresses the port resolved from the committed node), or
   refuses `peer_not_in_configuration` / `peer_configuration_unavailable`. It replaces every non-port
   `buildPeerAddress` consumer (CDC forward, native durable forward, forward target node, control-plane
   `forwardToLeader`).
3. **Founders.** `MessageGroupService` takes `founderNodeIds` (the founding placement) and its GENESIS commits it;
   the seed allocation declares every message-group founder on the seed node (`seedFounderNodeIds`, the same
   placement partitions had); the self-hosted join create places only the replicas this node creates, on this
   node. (Attempt 1 first derived it from `assignment.peerAddresses`, which for a reused group is built from
   bootstrap-admission SERVICES rows in `bootstrap-join-admission-owner.js` `augmentAssignmentWithPeerAddresses`:
   a projection. The corrective attempt drops that; `create-message-group-phase.test.js` witnesses it.) The original-allocation admission no longer carries `peerAddresses`; the message-group GENESIS is still
   compared byte-for-byte with the declaration at native entry.
4. **D-C3.** The managed context is `{operationId, transitionIdentity, permitSequence, stage, replicaIdentity,
   peerId, nodeId}` for every stage; the managed transition request names `nodeId` instead of `peerAddress`; the
   native turn's address fence (`resolvePeerAddress(peerId) === peerAddress`) becomes a committed-node fence
   (`resolvePeerNodeId(replicaIdentity)` null or equal, else IDENTITY_MISMATCH); the rebalancer takes the node
   of the permit's replica from the FreshMG identity record (`membershipReplicaNodeId`), for the transition and
   for the learner-action query; `removalPeerAddress` is deleted. A six-key context or retained origin does not
   decode (MALFORMED at apply, INVALID -> CORRUPT at the learner-action read).
5. **U11.** `resolveCanonicalLeaderIdentity()` reads only the live raft status: `live_leader` (node of the
   committed leader address), `leader_unaddressed`, `no_leader`, `status_unavailable`; the publication-memo,
   `message_groups` cache-row and role-hint states are deleted. The join-convergence forward target is the live
   leader at its committed address (no hint list).
6. **Deleted.** `buildPeerAddress`, message-group `resolvePeerAddressFromCache`, `resolvePeerAddressFromHints`,
   `logBootstrapHintFallback`, `bootstrapHintFallbackLogged`, `allowBootstrapHints`/`consensusResolution`,
   `resolveLivePeerAddressFromConsensus`, `resolveCanonicalLeaderIdentityFromCache`/`...NodeIdFromCache`, the
   message-group `peerAddresses` option and its seed/join/lifecycle plumbing (and the dead partition seed-phase
   `peerAddresses`), `USING_BOOTSTRAP_PEER_HINT_...`, `BOOTSTRAP_HINT`, `PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT`.
   `expectedPeersFromServicesCache` stays (A8 trigger).
7. **Witnesses changed to the new contract** (old ones asserted cache-first or hint resolution): strict-CDC
   forward routing (cache relocation / hint diagnostics tests replaced by a committed-address test), role
   publication (publication-memo leader identity test removed; covered by quest test (f)), message-group service
   (move convergence now targets the live leader), address-manager peer-location authority (stale row ignored,
   committed node decides), FreshMG fixtures (`nodeId` in transitions and action contexts; the cluster harness
   commits founder nodes), seed allocation/admission fixtures (`founderNodeIds`), real-port message-group harnesses.

## 9. Corrective attempt after the verifier's rejection (2026-11-02)

- Three cdc-source-native-delivery witnesses (defer-repair, provisional-route, W7 multi-target route) are
  re-derived from a follower with no live leader (`no_leader`, a real election-time state): the fixture holds
  native traffic to the reopened follower, the defer -> single-flight repair -> provisional custody path runs,
  and the release is the follower hearing its leader, after which the owner forwards to the native leader at
  its committed address. The cache-hydration release assertions are gone; the paths stay in src.
- The quest test is registered under the contracts and coupled pairs cdc-source-native-delivery,
  message-group-committed-learner-origin and fresh-seed-original-publication-and-admission.
- Hardening: static guard (g) covers `resolveConsensusPeerAddress`, `committedPeerAddress` and
  `founderNodeIdsOfPlacement`; the join-convergence target uses one status read (the leader snapshot carries
  the leader's identity and committed address); the dead `context.nodeId !== undefined` guard is gone (every
  committed context carries the node); two stale comments corrected.
- Owned follow-up (attempt 3, after C4): forward targets selected from cache rows are delivered at the row's
  address on the non-durable path while the durable path cross-checks the committed address (R11 dual rule).

## 10. Attempt 2 as built (C4, with the pre-admission leader decision)

- **Leader address.** `resolveLeaderAddress()` (`partition-service-core-base.js`) answers only from this replica's
  own live raft status (`readOwnRaftStatus`: CORE_OK, this group, this identity): the leader's committed address,
  or a typed `PARTITION_LEADER_ADDRESS_REFUSAL` (NO_LEADER / LEADER_UNADDRESSED / STATUS_UNAVAILABLE). Callers
  (remote-query redirect, write forwarding, split and merge forwarding, promotion proof) map the refusal to their
  existing no-leader answers. `readLiveRaftLeaderId()` is the one leader-identity read; the learner-promotion
  gate seeds `leaderId` from it.
- **Pre-admission target (lead decision, candidate (a)).** One derivation in the committed-peer-address owner:
  `admissionLeaderTarget(entityType, stamp, status)` (`raft-rs-committed-peer-address.js`) answers the live
  leader once the target hears one, else the `leaderId` of the COMMITTED stamp the target was created from, at
  that stamp's committed node; a NOT_LEADER hint is kept only when it names a member of that stamp
  (`admissionLeaderHint`). On no usable hint, NOT_LEADER or a failed delivery, the target re-performs the
  creation owner's committed-membership read (`readCommittedMembershipStamp`, which gains an explicit
  `firstNodeId`: the stamp leader's committed node, so no cached row routes it) on the next learner-promotion
  cadence. The admission drive runs before the learner leader gate. The leader-side NOT_LEADER hint is the live
  status leader (U11 rule).
- **Deleted.** Partition `resolvePeerAddressFromCache`, `PEER_ADDRESS_FROM_CACHE`,
  `resolveLiveRaftLeaderAddressForPeer` (with its `this.leaderId` cross-check), `PEER_ADDRESS_FROM_LIVE_RAFT_LEADER`,
  `leaderAddressHint`, `resolveLeaderIdFromHint`, `resolveLeaderIdFromMetadata`, the dead cached-row helpers
  `getCachedSystemTableRow(s)`; the target's `this.leaderId = hint` seeding; the replica handler's
  `leaderAddress` computed from the cached leader row (`src/node/replica-handler-runtime-metadata-methods.js`) and
  its pass-through and dead `syncFromLeader` branch (`src/node/replica-handler-create-methods.js`).
- **Witnesses re-derived.** Fixtures that hand-seeded `leaderId` and injected the leader's services row now create
  the joiner from the leader's COMMITTED stamp (`partition-admitted-group-fixture.js`, committed-membership
  harness, `partition-peer-admission`, `transactions-query-routing`); tests asserting row/hint-derived leaders now
  assert the live-status contract; Stream B's (g)/(m)/(i) tests hold a real stamp and the deleted dead call.
  `dt6-learner-promotion-progress-proof` and `dt6-learner-promotion-proof-channel-wake` are red on the merged base
  `c35856473` already (their fixture relies on the cache-driven membership reconcile Stream B removed): Stream B's.
