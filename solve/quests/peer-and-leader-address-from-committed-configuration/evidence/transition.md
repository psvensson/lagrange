---
audience: evidence
recorded: 2026-11-02
quest: peer-and-leader-address-from-committed-configuration
---

# Transition record: peer and leader address from the committed configuration

Quest `peer-and-leader-address-from-committed-configuration` (epic `raft-rs-full-cutover`), instances C3
(message-group half), C4 and U11 of the projection-authority census
(`solve/epics/raft-rs-full-cutover/evidence/projection-authority-census-2026-11-02/CENSUS.md` on
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
