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

## 6. Addendum (2026-11-02): red-test design for attempt 3 (design only; no tests written yet)

**Rule under test.** Every non-durable CDC forward target is delivered at its committed peer address
(`resolveCommittedPeerAddress(serviceId)`); a row-selected candidate whose row carries an address that differs from
that committed address is refused typed, never delivered at the row's address. Named refusal (new, owned by
`message-group-forwarding-owner-constants.js`): `CDC_FORWARD_TARGET_REFUSAL.ROW_ADDRESS_NOT_COMMITTED =
'cdc_forward_row_address_not_committed'`, counted per target beside `suppressedCount` and surfaced in the ingress
decision (`refusedTargets: [{serviceId, refusal}]`). A candidate the committed configuration does not hold refuses
`peer_not_in_configuration` (the resolver's own refusal). A row with no address, or with exactly the committed
address, is a plain candidate delivered at the committed address.

**Fixture.** One real `MessageGroupService` follower (the strict-CDC routing tests' construction: real router,
`reportingConsensusPort` whose status names the configured peers with their committed addresses, a real
`SystemTableCache`). Peer `P` committed on `n-committed`; its services row names `n-stale` and the address
`n-stale/message-group/P`. The router records every `deliver` address. Each witness asserts (a) the delivered
address is `n-committed/message-group/P` or nothing is delivered, (b) `n-stale/...` is never delivered to, (c) the
typed refusal is present in the decision.

| # | Non-durable target source (routing-methods / owner) | Setup | Expected (red on today's code: actual) |
| --- | --- | --- | --- |
| R1 | strict: `cacheLeaderService` (`buildCDCForwardTargets` strict branch, ~437) | system-table event (strict), no live leader target, the cache leader row is P at `n-stale` | refused `ROW_ADDRESS_NOT_COMMITTED`; no delivery to `n-stale` (today: delivered to `n-stale/...`) |
| R2 | strict: recovery `forwardCandidates` (~455, `resolveStrictCdcRecoveryRoutingContract`) | recovery contract REMOTE_TARGETS_AVAILABLE with candidate row P at `n-stale` | refused typed; delivered to none or to the committed address only (today: `n-stale/...`) |
| R3 | non-strict: `cacheForwardService` (~466) | user-table event, forward row P at `n-stale` | refused typed; the next target (leader id / replica ids) delivered at its committed address (today: `n-stale/...` first) |
| R4 | non-strict: `cacheLeaderService` (~470) | leader row P at `n-stale` | refused typed (today: `n-stale/...`) |
| R5 | non-strict: `service.leaderId` / `replicaIds` (~473-477) | no rows; leaderId P | delivered at `n-committed/...` (green today: guards the committed path stays) |
| R6 | any source, matching row | row P at exactly `n-committed/...` | delivered at `n-committed/...`, no refusal (green today: no false refusal) |
| R7 | any source, unconfigured replica | row for Q, Q absent from the status peers | refused `peer_not_in_configuration`; nothing delivered (today: delivered at Q's row address) |
| R8 | `status_unavailable` | rows present, port status not CORE_OK | no target, the existing DEFER (`DEFER_STRICT_TARGET_UNKNOWN` / non-strict defer); nothing delivered (today: delivered to a row address) |
| R9 | delivery sites | `forwardToTargets` (`message-group-forwarding-owner.js` ~575-586), `-delivery-methods.js:602` loop | static: neither reads a row address; `target.address` is always the committed one (`addTarget` takes no address argument) |
| R10 | durable path unchanged | `assertCachedCdcForwardTarget` with a matching committed address | still delivers; with a contradicting status address still throws the budget error (regression guard for the path that is already right) |

**Red-first record.** R1-R4, R7, R8 and the static R9 are expected red on the attempt-2 head with first failing
assertion "no delivery to n-stale/message-group/P" (or the missing refusal). R5, R6, R10 are green guards. The
witnesses go into one new quest test file (planned name: message-group-cdc-forward-committed-address, under the message-group tests),
registered under the `cdc-source-native-delivery` contract and coupled pair. The re-derived native-route witnesses
(defer-repair, provisional-route, W7) are re-run unchanged.
