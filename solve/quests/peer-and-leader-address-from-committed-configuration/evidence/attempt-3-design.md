---
audience: evidence
recorded: 2026-11-02
quest: peer-and-leader-address-from-committed-configuration
---

# Attempt 3 design: every CDC forward target delivered at its committed peer address

Owned obligation recorded in the quest log (R17 (2), amended 2026-11-02, lead). Sequenced after C4 (attempt 2).
Line numbers are of `fcb043035`.

## 1. The dual rule today (R11)

One decision, "where does this replica deliver a CDC forward to a peer of its own group", has two rules:

| Path | Target selection | Delivery address |
| --- | --- | --- |
| Native (durable, terminal) | `observedNativeLeaderTarget` (live status) | the status leader address (committed node) |
| Durable via a cache-selected target | `buildCDCForwardTargets` rows, filtered by `durableCacheTargetConstraint` / `nativeCacheTargetEligible` | the **row's** `address`, then `assertCachedCdcForwardTarget` refuses it if the status reports a different resolved address for that peer (`message-group-forwarding-owner-routing-methods.js:112-125`) |
| Non-durable (strict and non-strict) | `buildCDCForwardTargets` rows: `cacheLeaderService`, `cacheForwardService`, recovery `forwardCandidates`, `service.leaderId`, `replicaIds` (`:429-477`) | the **row's** `address` when the row has one (`addTarget(serviceId, row[COLUMN.ADDRESS])`), else `resolveCommittedPeerAddress` (`message-group-forwarding-owner.js:575-586`, `-delivery-methods.js:602`, `-native-delivery-methods.js:180-181`) |

So a stale row can still choose where a non-durable forward lands, while the durable path refuses the same row. All
candidates are replicas of this group (`getMessageGroupServiceCandidates(cache, groupId)`), so every one of them has
exactly one committed address.

## 2. The one rule

Rows (and the partition routing snapshot) stay what A8 allows: **discovery and ordering of candidates**, never an
address. Every target's delivery address is `resolveCommittedPeerAddress(serviceId)` (status peer address resolved
by the port from the committed node; self excluded as today). Concretely:

1. `buildCDCForwardTargets.addTarget(serviceId)` takes no address argument. It resolves the committed address once;
   a typed refusal (`peer_not_in_configuration`, `peer_configuration_unavailable`) drops the candidate and is
   counted as a named per-target outcome (alongside `suppressedCount`), never replaced by the row.
2. `forwardToTargets`, the non-durable delivery loop (`-delivery-methods.js:598-610`) and
   `deliverDurableCdcForwardTarget` read `target.address` only; the `|| resolveCommittedPeerAddress` fallbacks go
   (the address is always present).
3. `assertCachedCdcForwardTarget` keeps its eligibility checks (target a non-learner voter, no contrary resolved
   leader) and its re-check that the status still resolves the peer to `target.address` (now a currency check of one
   fact, not a cross-check of two sources).
4. Suppression keys (`getForwardTargetSuppressionKeys`) keep `service:` and `address:`; the address is the committed
   one.
5. `resolveForwardTargetNodeId` already parses the committed address; unchanged.

Not changed: candidate ranking (`resolveMessageGroupLeaderServiceFromCache` etc.), the recovery routing contract and
`isStrictForwardNodeReady` (lease readiness, the Group A class; recorded there).

## 3. Reachability and refusals

- A follower with no usable own status (`status_unavailable`: runtime unhealthy, gate closed, identity unrecorded,
  port not open) gets no committed address for any peer, so cache-selected forwarding yields no targets and the
  owner answers its existing DEFER (`DEFER_STRICT_TARGET_UNKNOWN` with the topology repair, or the non-strict
  equivalent). Today such a replica could forward to a row address. This is the intended change (R10/R11); the
  witness must show the DEFER, not a delivery.
- A candidate row for a replica outside this replica's applied configuration (not yet admitted, already removed)
  is dropped typed; today it is delivered at the row's address.

## 4. Proof plan (red first)

- Red: a follower whose cache row for peer P names node `stale` while P's committed node is `n2`; a non-durable
  strict forward (control-plane system table) and a non-strict forward both deliver to `n2/message-group/P`
  (today: `stale/...`). Same for a recovery candidate.
- Red: a row for a replica outside the configuration yields no target and a typed outcome (today: delivered).
- Red: `status_unavailable` + rows present: DEFER, nothing delivered.
- Static: no read of `COLUMN.ADDRESS` / `.address` of a cache row in `message-group-forwarding-owner*.js` feeds a
  delivery; `buildCDCForwardTargets.addTarget` has one parameter.
- Witness updates expected: strict-CDC forward routing tests that assert row addresses
  (`message-group-service-strict-cdc-forward-routing.test.js`), `cdc-non-leader-propagation*` (port peers are
  already seeded as committed), the cdc-source-native-delivery coupled-pair witnesses (re-run, no change expected).
- Coupled pair: `cdc-source-native-delivery` (impact-contracts.json); lab cone as for attempts 1-2.

## 5. Blast radius (fcb043035)

Source: `message-group-forwarding-owner-routing-methods.js` (`buildCDCForwardTargets`, `assertCachedCdcForwardTarget`),
`message-group-forwarding-owner.js` (`forwardToTargets`), `-delivery-methods.js`, `-native-delivery-methods.js`.
Tests naming row addresses in forward targets: strict-CDC routing, cdc-non-leader-propagation (3 files), native
provisional-route / W7 / mixed-vector (address assertions use committed addresses already).
