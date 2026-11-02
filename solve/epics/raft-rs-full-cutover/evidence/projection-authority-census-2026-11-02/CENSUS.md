---
audience: evidence
recorded: 2026-11-02
---

# Projection-authority census: instances C3-C13 on b26d2c090 (2026-11-02)

Read-only source census (Stream C of the stability takeover). Worktree
`lagrange-census-20261102`, HEAD `b26d2c090` = `origin/work/learner-committed-admission-rebase-20261102`
= main `e4937c765` + `a3e2dfef7` (transplant of the learner committed-identity change) + `b26d2c090`
(PR #184 head). `src/` is byte-identical to the land branch head `203c99f6e`
(`git diff --stat land/learner-host-from-committed-admission-20261102b HEAD -- src/` is empty). No source
was changed; no test lane or harness was run. Line numbers are of this HEAD unless a different revision is
named. Test counts are `grep -rl <surface> test/ | wc -l` on this HEAD (files, not assertions).

## 0. Scope, class, inputs

**Class (unchanged from the 2026-11-01 analysis).** A serve-, admission-, routing-, provisioning-, planning-
or release-gating decision consumes a projection of committed state (the CDC-fed `SystemTableCache`, a memoised
readiness snapshot, a bootstrap hint list) as if it were the committed authority, and copes with projection lag
by a timer-bounded wait, a quieter alternate path, or a default that treats an absent input as satisfied.
Contract: `architecture/contracts/authority-and-recovery.md:110-117` ("A projection may trigger reconciliation
but cannot grant permission, discharge an obligation or declare completion"), `:119-128`, `:138-145`
("Permanent refusal is explicit and cannot disguise an endlessly retrying operation"), state table `:195-202`
(Volatile execution state "cannot upgrade durable authority"; Observation/presentation "Never an independent
completion oracle"). `architecture/runtime-contracts.md:187-188` ("`SystemTableCache` is the steady-state read
model ... It is not an authority"), `:192-193` ("CDC-propagated metadata decisions read from the cache unless the
boundary explicitly declares another owner-fed read model": the sentence a serve-gating repair must supersede
under R09), `:206-207` ("completing executor-owned topology phases from cache visibility alone"; "mixing cache
and SQL fallbacks inside one semantic decision path"). Steering R03, R05, R09, R10, R11, R17, R21
(`docs/steering/rules.md`).

**Prior analysis.** `docs/evidence/comparative-benchmark-evidence-repair-2026-11/systemic-analysis-serve-lane-2026-11-01.md`
(HEAD `b20f94dc7`; census C1-C13, nine-month history, etcd/CockroachDB/TiKV/FoundationDB comparison, section 4
design and deletion list, hypotheses H1/H3). The blocker numbers cited below (#9, #29, #33, #36, #37) refer to
`product-blocker-first-divergence-2026-11-01.md`, which is no longer in the tree: it is in the relocated bundle
`comparative-benchmark-evidence-repair--comparative-benchmark-evidence-repair-evidence-c959e0241-2026-11-01.tar.gz`
(sha256 `eaf4c6658612a812504507dffa26a594ff820217898f8df0ba28cf5f7f83b95f`, named in
`docs/evidence/comparative-benchmark-evidence-repair-2026-11/product-blocker-first-divergence-2026-11-01-summary.md`).
I did not open the bundle; the blocker numbers are quoted from the analysis.

**Repaired instances (not re-censused).** C2 and the partition half of C3: quest
`learner-host-from-committed-admission` (epic `raft-rs-full-cutover`), records complete only on branch
`land/learner-host-from-committed-admission-20261102b` (`solve/quests/learner-host-from-committed-admission/log.ndjson`,
12 entries, terminal `solved` "probe test-receipt metric=0 target=0; 128 paths";
`docs/evidence/learner-host-from-committed-admission-2026-11/transition.md`). On this HEAD the quest directory holds
a 2-entry log and a `quest.json` without the terminal and supersession entries, and `transition.md` is absent
(`git diff --stat land/... HEAD -- docs/evidence/learner-host-from-committed-admission-2026-11 solve/quests/learner-host-from-committed-admission`:
transition.md -221, receipt.json -33, log.ndjson -10, quest.json 20). What landed in `src/`: the partition and
message-group ADD conf changes commit `{replicaIdentity, peerId, nodeId}` as context
(`src/raft/raft-rs-committed-membership-context.js:21-36`, `src/raft/raft-rs-operation-port.js:135-172`); every
replica records `node_id` at apply (`raft-rs-operation-port.js:319-323`); `READ_COMMITTED_MEMBERSHIP` answers
`nodeIds` beside `identities` (`src/raft/raft-rs-committed-membership-read.js:84-90, 158-178`); the port hands
each peer's committed node to the host resolver (`raft-rs-operation-port.js:305-312`); the partition binds
`committedPartitionPeerAddress` (`src/partition/partition-committed-peer-address.js:20-28`, typed
`peer_not_in_configuration`, recorded by `src/raft/raft-rs-peer-delivery.js:147-150`). Deleted:
`src/raft/peer-address-resolver.js` (158 lines), partition `buildPeerAddress`/`resolveKnownPeerAddress`/`peerAddresses`
(`partition-service-core-base.js` -79 lines), `learner_address_unresolvable`, the re-assert wake.

**Owned elsewhere.** C1 and C10 (`replica-admission-from-committed-operation`, branch
`origin/work/replica-admission-committed-operation-20261102` exists; no quest directory on this HEAD). Described
only where another instance depends on them (section 4).

**Changes since the analysis on the instance files** (`git diff --stat b20f94dc7..HEAD`, all from `a3e2dfef7`):
`message-group-consensus-port.js` (+4: GENESIS stamp passes `{}` founder nodes "follow-up of C3"),
`message-group-service-raft-lifecycle.js` (+4: ADD passes `nodeId`), `partition-service-core-base.js` (-79),
`sql-query-engine-initial-partition-provisioning.js` (+3/-1) and `sql-query-engine-provision-target-methods.js`
(+21): GENESIS stamp carries `founderNodeIds` (`:415-425 founderNodeIdsOf`), `peer-address-resolver.js` deleted,
`raft-rs-committed-membership-read.js` (+24 `nodeIds`). Every other file named below is unchanged since
`b20f94dc7`; `git log --since=2026-10-30` over the 30 instance files lists only `a3e2dfef7`.

**Numbering caution.** Three unrelated "C-n" enumerations exist in the repository: this census and the analysis
(C1-C13 projection-authority instances); the live diagnosis
(`docs/evidence/comparative-benchmark-evidence-repair-2026-11/live-diagnosis-2026-11-01-summary.md`, C1-C16
observation classes); the R2 committed-membership design (`solve/epics/raft-rs-full-cutover/design-r2-committed-membership-2026-09-23.md`,
C9 = `resolveLiveRaftLeaderAddressForPeer`) and `solve/epics/raft-rs-full-cutover.md:1054` ("C1" = the host's
non-member vote refusal). Only the first is meant here.

**Method.** Each instance: the decision site, the projection it reads, the wait/fallback/default (quoted), the
committed fact and where it already exists, change since the analysis; precedent from `solve/quests`,
`solve/specs`, `solve/epics`, `docs/evidence`, `architecture` (`grep -rl` by symbol) and `git log -S<symbol> -- src/`;
the owner-level repair shape per analysis sections 3-4 (committed read at a stated epoch, typed unavailability,
deletion of alternate paths) with its deletion list and test-file counts. Quest status is the terminal entry of
`log.ndjson` where one exists; "unknown" where the log has none (most pre-solve-v2 quests).

## 1. Verdict table

| Inst. | Decision | Exists on HEAD | Changed since b20f94dc7 | Committed fact available | Precedent (quests / records / commits found) | Proposed quest | Group |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C3 (mg) | message-group raft peer address | yes: `message-group-service-peer-resolution.js:58-99`, bound at `message-group-consensus-port.js:69-77,129-130` | port and ADD changed (+4/+4); resolver unchanged | yes for ADD_PEER admissions (`committedNodeIdOf`, `nodeIds`); no for founders (GENESIS `{}`) and FreshMG ADD_LEARNER (six-key context) | 6 quests, 2 design records, CL-013, 12 commits | `peer-and-leader-address-from-committed-configuration` | B |
| C4 | leader address for write forwarding | yes: `partition-service-core-base.js:539-556` (cache first `:544`, live raft second `:548`) | core-base -79 (hint list deleted); `resolveLeaderAddress` and `resolvePeerAddressFromCache` kept "for C4 only" (`:586-590`) | yes: `raft.readStatus().leaderAddress` resolves through the port from the committed node (`raft-rs-status-observation.js:66-74` -> `raft-rs-operation-port.js:305-312`) and is already the fallback | 5 quests, R2 design "KEEP-PROJECTION; re-home", CL-017, 11 commits | same as C3 | B |
| C5 | serve lane / `serveEligible` for routing | yes: rules `projection-readiness-decision.js:63-90`; inputs cache rows `control-plane-readiness-service-node-methods.js:29-33,296-306,606-609`; fail-open `query-executor-partition-routing-snapshot.js:63-115`; bypass `query-executor-priority-recovery-bootstrap-routing.js:15-89`; defaults `membership-publication-priority-partition-readiness-data.js:66-77`, `unified-rebalancer-control-plane-readiness-methods.js:81-96` | no | yes: authoritative owner reads exist (`nodesOwner.listNodes`, `servicesOwner.listServices`, `controlPlanePublicationsOwner.listPublications`; `CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED` `control-plane-system-table-gateway-constants.js:97-103`) but only behind `allowAuthoritativeRefresh` / after a cache-first read | >30 quests, Q6 planning record (21 fixes, ~55 sites), CL-001/010/019/036/044, contract text `readiness-and-owner-contracts.md:13-24` | `serve-eligibility-committed-epoch-read` | A |
| C6 | CREATE TABLE provisioning cohort | yes: `sql-query-engine-provisioning-methods.js:176-207`; poll `sql-query-engine-provision-target-methods.js:143-275`; lowering `sql-query-engine-provisioning-admission-methods.js:13-33,264-280` | +21/+3 (founder nodes for GENESIS; fallback logic unchanged) | same as C5 | 8 quests, Q6 record row Q1 and slices S1a/S2/S3' (owner decision F10 open), ARCH-0016/0017, 5 commits | same as C5 | A |
| C7 | rebalancer critical-topology settle / available nodes / local-serve defer | yes: `unified-rebalancer-critical-topology-methods.js:45-48,66-83,162-171,440-450`; `unified-rebalancer-available-nodes.js:216-269`; `unified-rebalancer-local-serve-readiness.js:127-157` | no | same as C5 (leases current authoritatively while the projection said incomplete: analysis #9, #36) | 10 quests, CL-036 (guarded), CL-044 (open), Q6 record S7a and fence ratchets, 4 commits | same as C5 | A |
| C8 | voter-ready activation | yes: `replica-handler-voter-readiness-methods.js:194-243` (60 s poll), `:250-262`; local cache seed `replica-handler-create-status-methods.js:596-630` | no | yes: live raft role (`getTrackedReplicaRole` -> `service.getRole()`) and committed node (`committedNodeIdOf`); only the row `address` is projection | 9 quests, CL-035 (guarded), census-bounded-waits rows :211,:468, 4 commits | `voter-ready-from-committed-role-and-node` | standalone (after B) |
| C9 | CDC pipeline "ready" | yes: `cdc-pipeline-readiness-gate.js:5-12,82-99,149-...,315-333` | no | n/a: condition 3 asks the projection whether the projection works; conditions 1-2 are owner facts | 2 quests, CL-014 ("DELIBERATELY NOT CHANGED"), census-bounded-waits :431, 3 commits | `cdc-pipeline-readiness-without-cache-witness` | standalone (with D4) |
| C11 | in-flight topology operations source | yes: `unified-rebalancer-shared.js:211-214`; cache `critical-topology-methods.js:607-647`; authoritative revalidation `:389-436` | no | yes: `getOperationsByEntity(... OWNER_RPC_REQUIRED)` (`:399-406`), already used as the revalidation | 0 quests by symbol; CL-036 mention; 8 commits | fold into A (or `in-flight-operations-owner-read` first) | A |
| C12 | learner count check overflow budget | yes: `partition-service-learner-promotion-count-check-methods.js:139-150` (`getNodeReadinessSync` per learner node), rows `:62-66` via `partition-service-learner-promotion-methods.js:263-274` | no | partially: committed voter/learner count via `READ_COMMITTED_MEMBERSHIP`; the overflow bound travels with the ADD (`critical-spread-transition-authority-carry`, solved 2026-09-19) | 8 quests (1 solved, 2 superseded), design record, 0 dedicated commits found | after A; or fold | A (consumer) |
| C13 | resume of the participant-cutover pause | yes: pause `replica-handler-participant-cutover.js:303`, `replica-handler-participant-release.js:173,225`; cohort `:47-57` over `releaseMemberIds(facts.membership)`; re-drive `replica-handler-release-recovery.js:183-211` | no | yes, and it IS read: `facts.membership = await service.raft.readCommittedMembership({purpose})` (`partition-participant-transaction-pause.js:142`) on every attempt | 4 quests (2 solved), contract `:147-172`, 1 commit (`54dd2d7ce`) | `participant-release-permanent-refusal` | standalone |

H3 (C13): confirmed as a design gap with a corrected mechanism; refuted in its literal form. Section 3.

## 2. Per-instance records

### C3 (message-group half): raft transport peer address

**Current state.** The rs-raft port resolves a peer address by handing the host resolver the replica identity and
its committed node (`src/raft/raft-rs-operation-port.js:305-312`):

```
resolvePeerAddress: (raftPeerId) => {
  const identity = registry.resolveReplicaIdentity(raftPeerId);
  ...
  return resolvePeerAddress(identity.replicaIdentity,
    registry.committedNodeIdOf(identity.replicaIdentity));
},
```

The message-group binding takes one argument and drops the committed node
(`src/message-group/message-group-consensus-port.js:69-77`, bound at `:129-130`):

```
function resolveConsensusPeerAddress(service, replicaIdentity) {
  if (replicaIdentity === service.replicaId) {
    return service.unifiedAddress;
  }
  return service.buildPeerAddress(replicaIdentity, {
    allowBootstrapHints: true,
    consensusResolution: true,
  });
}
```

`buildPeerAddress` (`src/message-group/message-group-service-peer-resolution.js:58-99`) is three paths: cache
first ("Prefer cache-backed topology first so handoff/move metadata wins over bootstrap-time peer hints", `:78-84`,
`resolvePeerAddressFromCache` `:135-157` = `this.systemTableCache.get(TABLES.SERVICES, peerId)` `:139`, answering
`service.address` or `format(service.node_id, MESSAGE_GROUP, peerId)`), then `resolveLivePeerAddressFromConsensus`
(`:85-86`, skipped under `consensusResolution`), then bootstrap hints (`:90-97`, `resolvePeerAddressFromHints`
`:100-128` over `this.peerAddresses`, warn `logBootstrapHintFallback` `:164-179`,
`USING_BOOTSTRAP_PEER_HINT_BECAUSE_SERVICES_CACHE_HAS_NO_PEER_LOCATION`), else `throw new Error('Unable to resolve
unified peer address ...')` (`:91`, `:98`). The hint list is `options.peerAddresses`
(`message-group-service-state.js:240`), produced by `src/bootstrap/phases/seed-message-groups-phase.js:87-88,102,155`
(`originalSeedPeerAddresses`) and `src/bootstrap/phases/create-message-group-replica-lifecycle.js:108`; whether the
learner join (`src/message-group/message-group-learner-join.js:272-275`, `...host.serviceOptions`) passes one is
unknown. A second hint consumer is `src/message-group/message-group-forwarding-owner.js:630-642`.

Committed fact: for host-proposed ADDs, yes. `message-group-service-raft-lifecycle.js:149-154` passes
`nodeId: AddressManager.getInstance().getNodeId(peerAddress)` to `reserveAndAdmitGroupPeer`, so the ADD commits the
three-key admission context and every replica records the node (`raft-rs-operation-port.js:159-172, 319-323`),
readable by `registry.committedNodeIdOf` and `READ_COMMITTED_MEMBERSHIP.nodeIds`
(`raft-rs-committed-membership-read.js:84-90, 158-178`). Not committed: (a) founders: the message-group GENESIS
stamp passes an empty founder map (`message-group-consensus-port.js`, diff since `b20f94dc7`: "No founding
placement is committed for a message group: its peers are addressed by its own resolver (follow-up of C3)");
(b) the FreshMG managed ADD_LEARNER, whose context is the frozen six-key managed shape
(`raft-rs-committed-membership-context.js:12-20`; `learner_admission` format ruled untouched, transition.md
section 8.6 on the land branch). The admission trigger itself still enumerates peers from rows
(`expectedPeersFromServicesCache`, `message-group-service-raft-lifecycle.js:74-92`): an A8 "rows as address book"
trigger, permitted, but it also supplies the node that gets committed (`peerAddressOfServiceRow` `:88`). Observed
failure: analysis #29 (stale mg-1 target list 57 s after a removal).

**Precedent.** Design record `solve/epics/raft-rs-full-cutover/design-r3-r4-message-groups-worker-wasm-2026-09-23.md:186`
prescribed exactly the current binding (`RESOLVE_PEER_ADDRESS: (id) => this.buildPeerAddress(id, {allowBootstrapHints:
true})`): the binding is that design's output and must be superseded (R09), not patched around.
`formation-address-manager-peer-location-authority` (epic `formation-seed-decoupling`, fix, superseded 2026-09-18,
"the frontier closed with no leak to repair") accepted as holding that a peer-location decision comes from "an
explicit unified address, or its system-table cache": it codified the cache as a legitimate peer-location source,
the premise this class rejects. `executor-active-services-cache-handoff` (epic `topology-convergence-hardening`;
analysis: exhausted 2026-07-19) waited for the services row to align into the planning cache instead of reading the
admission. `partition-live-leader-address-routing` (epic `formation-complexity-consolidation`, 2026-07-19..09-06,
terminal unknown) names `buildPeerAddress` and "never a stale bootstrap hint" (see C4). `retained-seed-original-handoff`
and `zero-liferaft-active-runtime` (epic `raft-rs-full-cutover`, 2026-10, terminal unknown) touch
`allowBootstrapHints` / `resolveLivePeerAddressFromConsensus` without changing the source order. CL-013
(`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-013.md`, guarded 2026-06-11, "dispatched
bootstrap hints now merge" `:84`) strengthened the hint fallback as a fix. `learner-host-from-committed-admission`
(land branch log entries 1 and 7; transition.md section 8.6) names the message-group resolver "a named follow-up"
and records that the hint list and cache resolution for partitions were deleted end to end.
`git log -S allowBootstrapHints -- src/`: 62a1e525a (2026-02-09, born), 49453a3c2, dc9927ec7, d378c9083, 59be096ae,
8f284ad8a, e2797b6c8, 86b7b178c, 18dbdbe7f, aefe67ffa, d29c7d8c8 (2026-08-21), 54dd2d7ce (2026-10-27). Explicitly
rejected (must not return): cache-first ordering as a correctness rule; merged bootstrap hints; waiting for the
services row; any `learner_address_unresolvable`-style refusal that asks the learner to re-assert a row.

**Repair (owner level).** Bind the message-group `RESOLVE_PEER_ADDRESS` to the committed resolver with the port's
two arguments: `(replicaIdentity, committedNodeId) => format(committedNodeId, MESSAGE_GROUP, replicaIdentity)` or
throw `RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION` (generalise `partition-committed-peer-address.js` over
the entity type; the delivery outcome is already recorded by `raft-rs-peer-delivery.js:147-150`). Founders: the
message-group GENESIS stamp commits `founderNodeIds` from the seed allocation (the seed phase already derives the
founders' unified addresses at `seed-message-groups-phase.js:87-88`). FreshMG learner: a lead decision is needed
(D-C3): either the six-key managed context gains `nodeId` (changes the `learner_admission` codec the lead ruled
untouched, with no old-format decoder per the in-place-upgrade ruling of 2026-10-04) or the managed ADD_LEARNER
is followed by the admission context in the same entry; both change the raft-rs runtime owner's record. Deletions:
`buildPeerAddress`, `resolvePeerAddressFromCache`, `resolvePeerAddressFromHints`, `logBootstrapHintFallback`,
`bootstrapHintFallbackLogged`, the `allowBootstrapHints`/`consensusResolution` options, `peerAddresses` option and
plumbing (`message-group-service-state.js:240`, `seed-message-groups-phase.js:87-102,155`,
`create-message-group-replica-lifecycle.js:108`, `message-group-forwarding-owner.js:630-642`),
`MESSAGE_GROUP_SERVICE_LITERAL.USING_BOOTSTRAP_PEER_HINT_...` and `BOOTSTRAP_HINT`; `resolveLivePeerAddressFromConsensus`
if `buildPeerAddress` is its only consumer (unknown); `expectedPeersFromServicesCache` stays as the A8 trigger.
Test files naming the surfaces: `buildPeerAddress` 6, `allowBootstrapHints` 3, `committedPartitionPeerAddress` 3,
`founderNodeIds` 6, `nodeIds` 119 (broad), `resolveConsensusPeerAddress` 0, `resolvePeerAddressFromHints` 0,
`bootstrapHintFallbackLogged` 0, `expectedPeersFromServicesCache` 0 (unwitnessed production paths).

### C4: leader address for write forwarding

**Current state.** `src/partition/partition-service-core-base.js:539-556`:

```
resolveLeaderAddress() {
  const leaderReplicaId = this.normalizeLeaderReplicaId(this.leaderId);
  if (!leaderReplicaId) {
    return null;
  }
  const cacheAddress = this.resolvePeerAddressFromCache(leaderReplicaId);
  if (cacheAddress) {
    return cacheAddress;
  }
  const liveRaftLeaderAddress =
    resolveLiveRaftLeaderAddressForPeer(this, leaderReplicaId);
  if (liveRaftLeaderAddress) {
    return liveRaftLeaderAddress;
  }
  throw new Error(
    `Unable to resolve unified peer address for ${leaderReplicaId}`,
  );
}
```

Projection: `resolvePeerAddressFromCache` `:595-618` (`this.systemTableCache.get(TABLES.SERVICES, peerId)` `:602`,
`isLivePartitionServiceRow`, debug `PEER_ADDRESS_FROM_CACHE` `:611`); its header `:586-590` records that it is
kept "for C4 only ... named there". Authority as fallback: `resolveLiveRaftLeaderAddressForPeer`
(`src/partition/partition-service-raft-peer-cache-reconciliation.js:35-70`) reads
`partitionService.raft?.readStatus?.().leaderAddress` `:36`, but returns null unless the status leader equals
`this.leaderId` `:45-50`, so a stale `leaderId` suppresses the authoritative answer. Third input: `leaderAddressHint`
(`core-base.js:94-97`; `partition-service-raft-init-base.js:220-232 resolveLeaderIdFromHint`) seeds `leaderId`
from a bootstrap hint. Callers: `partition-service-remote-query-methods.js:88` (write redirect),
`partition-service-write-metrics-base.js:519` (write forwarding), `partition-service-learner-promotion-proof-methods.js:337`
(proof request target), `partition-service-source-replication-start-methods.js:66`,
`partition-service-merge-replication-methods.js:210`. Committed fact: `readStatus().leaderAddress` is
`leaderObservation` -> `resolvePeerObservation(group, lead)` (`src/raft/raft-rs-status-observation.js:66-74`), which
goes through the port's `resolvePeerAddress` and therefore the committed node (`raft-rs-operation-port.js:305-312`).
The inversion the analysis named (authority as the fallback) is unchanged.

**Precedent.** `partition-live-leader-address-routing` (epic `formation-complexity-consolidation`, 2026-07-19,
terminal unknown): "routing uses only a validated live Raft address for the matching partition replica, never a
stale bootstrap hint": the direction, delivered as the fallback helper rather than the only path.
`replica-projection-stale-leader-route-resync` (epic `topology-convergence-hardening`, 2026-08-04; analysis:
"sealed, inherited ... open residual"): re-syncs the projection after the wedge instead of removing the cache-first
read. `write-routing-repair-under-control-plane-moves` (legacy, 2026-07-04): NO_HANDLER recovery on a stale
placement. `seed-join-gate-authoritative-refresh` (legacy, 2026-07-15): a bounded authoritative re-read on a stale
leader-metadata miss (the cache+SQL mix forbidden by `runtime-contracts.md:207`). CL-017
(`closure-ledger/CL-017.md`, guarded 2026-07-02): writes "can no longer be routed at a stale leader claim" `:117`.
Design record `design-r2-committed-membership-2026-09-23.md:142-144`: its "C9 `resolveLiveRaftLeaderAddressForPeer`
... consumes the port's `leaderAddress` ... KEEP-PROJECTION; re-home" and `:298-301` "Stays: ...
`resolveLiveRaftLeaderAddressForPeer`": the design kept the live-status helper but did not rule on the cache-first
order. `git log -S resolveLeaderAddress -- src/`: 5b9c56b90 (2026-01-30, born), 3957150e1, 62a1e525a, 196c7ef85,
8942e8675, e2797b6c8, ce7be3c74, 8e64e19f0, 24c0b1edc (2026-08-10 proof), 1aea11baf, 54dd2d7ce. Rejected: cache
first; bounded authoritative re-read; hint-derived leader identity.

**Repair.** `resolveLeaderAddress()` answers from `raft.readStatus()` only: `{leaderId, leaderAddress,
leaderAddressStatus}`; no leader -> the existing typed `PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER`
(`src/partition/partition-write-kernel.js:50`) or a `NO_LEADER` outcome from `PEER_ADDRESS_STATUS.NO_LEADER`;
unreserved leader -> typed. Delete `resolvePeerAddressFromCache` (last consumer), `PEER_ADDRESS_FROM_CACHE`,
the `this.leaderId` cross-check in `resolveLiveRaftLeaderAddressForPeer:45-50` (or the helper, folded into the
status read), `leaderAddressHint` and `resolveLeaderIdFromHint`. `normalizeLeaderReplicaId` stays only if `leaderId`
can still arrive as an address (unknown). Message-group analogue to repair with it:
`message-group-forwarding-owner-target-methods.js:42 resolveCanonicalLeaderIdentityFromCache` (uncatalogued U11,
section 5). Test files: `resolveLeaderAddress` 9, `resolvePeerAddressFromCache` 1,
`resolveLiveRaftLeaderAddressForPeer` 0, `leaderAddressHint` 0.

### C5: serve lane / `serveEligible` consumed by routing

**Current state.** Lane rules `src/control-plane/projection-readiness-decision.js:63-90`
(`SERVE_NOT_ELIGIBLE: evidence.runtimeServeEligible !== true` `:66`; publication stream `:68-85`;
`PRIORITY_RECOVERY_ACTIVE: evidence.priorityRecoveryActive === true` `:86-89`); state
`projection-readiness-state.js:71-78` (`serveEligible: decision.lanes.serve.ready === true` `:75`). Evidence
`projection-readiness-evidence.js:702-709` (`runtimeServeEligible` from `source.runtimeServeEligible`, the
`SERVE_ELIGIBLE` dimension, `projectionReadiness.serveEligible`) and `:764-766` (`priorityRecoveryActive`). Inputs
are cache rows: `control-plane-readiness-service-node-methods.js:29-33` (`readTrustCacheRows` =
`service.systemTableCache.getAll(tableName)`), `:296-306` (`getAllNodeReadinessSync`: NODES, SERVICES,
NODE_ENDPOINTS from the cache), `:606-609` (`buildNodeReadinessSyncCurrent` -> `getNodeRow`,
`control-plane-readiness-node-service-rows.js:114-128`, cache), `:581-595` (`getNodeReadinessSync` ->
`readinessPlanningSnapshotOwner.readSync` memo). Authoritative rows only on request:
`control-plane-readiness-node-service-rows.js:29-53` (`options.allowAuthoritativeRefresh === true` ->
`nodesOwner.listNodes`, else `listNodesFromCache`, else `getNodeRows()`), `:83-112` (same for services). Memo reuse:
`control-plane-readiness-snapshot-store.js:157-177` (`allowStaleOnCacheChange !== true` `:172`),
`node-methods.js:410-437` (`:429 options.allowStaleOnCacheChange === true && snapshotInvalidated` returns the
cached snapshot). Publication epoch: `membership-publication-coordinator-reads.js:162-181` cache first
(`listPublicationsFromCache`), authoritative `listPublications` second; `:233,271,320` latest publication rows from
`systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS)`.

Consumers and their quieter paths. Routing filter `src/query/query-executor-partition-routing-snapshot.js:60-62`;
system-table fail-open `:63-115` ("user-approved liveness carve-out"; `evidenceAbsentReasonCodes` inline set `:81-84`
duplicating `readiness-denial-classification.js:20-23`; engages only for evidence-absent denial, dormant under
`priority_recovery_active`). Priority bootstrap bypass `src/query/query-executor-priority-recovery-bootstrap-routing.js:15-33`
(allowed reasons include `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, failed dimensions include `SERVE_ELIGIBLE`),
`:50-67` write grace, `:72-89` read lane, used by `query-executor-partition-service-resolution.js:165`. Default-true:
`membership-publication-priority-partition-readiness-data.js:66-77`

```
return clusterHealthy === true &&
  controlPlaneWritable !== false &&
  repairEligible !== false &&
  serveEligible !== false;
```

and `unified-rebalancer-control-plane-readiness-methods.js:81-96` (seven `!== false` dimensions). Committed fact:
the `nodes` leases and `control_plane_publications` epoch have authoritative owners and a required-authoritative
strategy (`CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED`, `control-plane-system-table-gateway-constants.js:97-103`,
used today by `message-group-forwarding-owner-delivery-methods.js:151,166,200` and
`admin-service-discovery-readiness-context-methods.js:432`); no serve decision uses it. Unchanged since the
analysis.

**Precedent.** The owning record is `solve/epics/core-architecture-convergence/readiness-observation-currency.md`
(2026-10-03, "Readiness observation currency - verified plan (Q6 family)", epic `core-architecture-convergence`):
verdict SYSTEMIC (`:32-46`), 21 prior fixes "moved not closed" (`:66-103`: placeholder -> carve-out (3fda9b056) ->
fail-open (334bbca2d) -> discarded builds -> the 09-04 stall read as `node_ready_lease_incomplete`), 11 parallel
currency mechanisms (`:116-132`, including `allowStaleOnCacheChange` with about 15 callers and the fail-open), a
consumer census of about 55 sites (`:156-260`; row Q9 = the fail-open with the note that its inline comment is
wrong, Q18 = publication planning bypassing the owner with `allowStaleOnCacheChange:true`), deletion/supersession
table (`:397-422`: delete the `planning_snapshot_refresh_pending` arm and the inline set; supersede
`allowStaleOnCacheChange`/`maxCachedAgeMs` with an R09 record for the sealed CL-033 5 s bound), slices S0-S8
(`:423-645`), fence ratchets (`:658-668`), gate "no slice starts without owner decision" (`:669-675`), open owner
decision F10 (`:690`). Status: planning record; no quest sealed from it. `getNodeReadinessSync` call sites: 27 in
22 files at `ec63fbb00`; 25 in 21 files on this HEAD. Quests: `readiness-formation-liveness-circularity-closure`
(epic `publication-readiness-churn-liveness-closure`; 334bbca2d 2026-08-15 fail-open),
`formation-ledger-spread-voter-ready-readiness-closure` (same epic; 3fda9b056 carve-out; analysis: exhausted
2026-08-30), `readiness-planning-deferral-bounded` (epic `release-0-2`), `projection-readiness-*` (7 quests, legacy /
`publication-readiness-churn-liveness-closure`), `single-readiness-owner` (legacy),
`control-plane-readiness-trust-cutover` (epic `owner-boundary-hardening-and-unification`, 2026-07-10: introduced the
trust view), `lone-seed-formation-admission-livelock-closure`, `application-write-formation-authority`,
`fresh-formation-user-table-routability` (epic `topology-convergence-hardening`, product, unsealed; statement names
`serveEligible true` and none of six reason codes), `rolling-restart-core-stability` (EXHAUSTED by operator decision;
`solve/epics/topology-convergence-hardening.md`: "must not be reopened"). Closure ledger: CL-001 (narrowed; `:601-602`
`processAlive !== false`), CL-010 (guarded; `recoveryOpen !== false` "defaults TRUE" `:36`), CL-019 (guarded;
`allowStaleOnCacheChange` `:75`), CL-036 (guarded), CL-044 (open). Contract text to supersede (R09):
`architecture/readiness-and-owner-contracts.md:13-24` ("Routing and benchmark admission use `serveEligible`";
"Self-readiness may preserve `serveEligible` through one timed-out `node_state_reporter` attempt") and
`runtime-contracts.md:192-193`. `git log -S evidenceAbsentReasonCodes -- src/`: 334bbca2d only. Rejected: carve-outs,
fail-open, `!== false` defaults, memo-key repairs, timers, "cache-as-authority" (regression-policy.md, "Recover
Historical Precedent").

**Repair.** One `readServeEligibility(nodeId)` on the control-plane readiness owner answering `{decision, epoch}`
from an `AUTHORITATIVE_REQUIRED` read of `nodes` (leases) and `control_plane_publications` (epoch) at the publication
epoch, or `UNAVAILABLE{reason, epoch, retryAfterMs}`; the projection snapshot becomes a memo keyed by that epoch and a
stale memo answers `UNAVAILABLE_STALE{epoch}`; routing, provisioning (C6), the rebalancer (C7, C11, C12) and
publication planning consume the typed answer. Deletions: the fail-open block `routing-snapshot.js:63-115` and its
inline set; `readiness-denial-classification.js` (shared with C7); the priority bootstrap bypass module and the
`ALLOW_PRIORITY_RECOVERY_BOOTSTRAP` / `PRIORITY_RECOVERY_BOOTSTRAP` read-authority lane; the thirteen `!== false`
readiness defaults; `allowStaleOnCacheChange` and `maxCachedAgeMs` (with the R09 supersession of CL-033 the Q6
record requires); the `listNodesFromCache` / `listServicesFromCache` / `listPublicationsFromCache` fallbacks inside
the decision path and `getAllNodeReadinessSync`'s cache reads for decisions (R11). Test files: `serveEligible` 86,
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` 61, `getNodeReadinessSync` 139, `planning_snapshot_refresh_pending` 17,
`runtimeServeEligible` 7, `allowStaleOnCacheChange` 5, `priority_recovery_active` 4, `PRIORITY_RECOVERY_BOOTSTRAP` 3,
`repairEligible !== false` 3, `serveEligible !== false` 2, `isEvidenceAbsentReadinessDenialSnapshot` 2,
`evidenceAbsentReasonCodes` 0, `systemTableLeaderFailOpen` 0, `isPriorityRecoveryRouting` 0.

### C6: CREATE TABLE provisioning cohort

**Current state.** `src/query/sql-query-engine-provisioning-methods.js:176-207`:

```
const trustView = readinessService.getProvisioningNodeTrustViewSync();
...
  .filter((entry) => entry?.serveEligible === true)          // :180 strict
...
    entry?.repairEligible === true &&
    entry?.serveEligible !== true &&                           // :189-190 degraded
...
if (
  selectedNodeIds.length < desiredReplicaCount &&
  degradedFallbackNodeIds.length > 0
) {
  selectedNodeIds = this.orderProvisionTargetNodeIds([...selectedNodeIds, ...degradedFallbackNodeIds]);
  usedDegradedFallback = true;                                 // :198-207
}
```

The trust view is `control-plane-readiness-service-node-methods.js:362-399` over `readTrustCacheRows` (NODES,
SERVICES, CONTROL_PLANE_PUBLICATIONS, `:365-370`); the trust decision is `src/control-plane/node-trust-state.js:264-314`
(SERVE only when `freshness FRESH && canonicalServe` `:281-290`; REPAIR_ONLY on FRESH or GRACE `:291-301`). Poll:
`sql-query-engine-provision-target-methods.js:143-275` (`Math.max(maxWaitMs, TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS)`
`:157`; constant 10000 at `sql-query-engine-shared.js:170`; `waitForCondition` `:201-231` classified
`TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT` `:211`, which `shared.js:153-157` makes retryable; warn
`TABLE_PARTITION_TARGET_NODE_FALLBACK_USED` `:256-265`; reason `table_partition_target_node_fallback_used`
`:289-292`, `shared.js:166-169`). Initial provisioning: `sql-query-engine-initial-partition-provisioning.js:202-214`
(fallback minimum), `:242`, `:423`, `:528` (FALLBACK_USED warns with `targetReplicaCount = Math.max(1, ...)` at
`:415-418, 520-523`). Transient lowering: `sql-query-engine-provisioning-admission-methods.js:13-33`

```
// Classifying them transient lowers the provisioning fallback minimum so a
// CREATE TABLE that still has SOME admitted targets proceeds under-planned
// (the rebalancer fills in afterwards) instead of failing the client.
// OWNED RESIDUAL: when EVERY target is hold-deferred the create still fails
// fast with insufficient-targets ... (ARCH-0016/0017), not delivered by this set.
```

and `:264-280 resolveProvisioningShortfallFallbackMinimum` returning `1` (`:279`). Committed fact: same as C5.
Changes since the analysis: only the GENESIS founder-node plumbing (`provision-target-methods.js:415-425`,
`initial-partition-provisioning.js`); the fallback and poll are unchanged.

**Precedent.** `git log -S usedDegradedFallback -- src/`: 8942e8675 (2026-03-05, born), e2797b6c8, 0f8d8c6ef,
7d1f78128, 54dd2d7ce. `-S TRANSIENT_PROVISIONING_SHORTFALL_REASONS`: be4107464 (2026-06-02, born, "improved
modelling"). 4b9a8642e (2026-07-11) centralised the trust view (`control-plane-readiness-trust-cutover`). Quests:
`provisioning-admission-ledger-hold-transient-wait` (legacy, 2026-07-05: "provisioning admission absorbs the
transient"), `formation-ledger-quorum-spread-first` (legacy: "under-planned"), `routed-mutation-silent-ledger-write-loss`
(legacy: `TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS`), `movielens-affinity-placement-demo` (ARCH-0016/0017),
`formation-control-plane-move-interlock`, `write-path-internal-pacing` (ARCH-0016), `application-write-formation-authority`,
`projection-readiness-evidence-amplification-v4` ("degraded fallback"). Q6 record row Q1 (`readiness-observation-currency.md:233`:
provisioning "dropped by `serveEligible===true`", placeholder-negative) and slices S1a ("the trust view names
PENDING"), S2 ("provisioning decides once, after the last await, on one cohort answer"), S3' ("schema provisioning
completes under-replicated; the rebalancer converges", prerequisite owner decision F10, `:542`). Census row
`census-bounded-waits-2026-10-04.md:505`. Rejected: degraded fallback, transient-minimum lowering, the poll, timeout
increases; the DDL-pacing follow-up (ARCH-0016/0017) is the recorded owned residual, undelivered.

**Repair.** Provisioning consumes the C5 cohort answer once, after its last await (`{nodes, epoch}`), or answers
`PROVISIONING_UNAVAILABLE{epoch, reasons, retryAfterMs}` mapped to SQLSTATE `57P03` (the analysis names
`SQLSTATE_BY_ENGINE_ERROR_CODE` in `src/runtime/pgwire-result-mapper.js`; current line numbers not re-verified).
Delete `degradedFallbackNodeIds`/`usedDegradedFallback`, the FALLBACK_USED log and reason,
`TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS` and the `waitForCondition` poll, `TRANSIENT_PROVISIONING_SHORTFALL_REASONS`,
`AGGREGATE_TRANSIENT_PROVISIONING_SHORTFALL_REASONS`, `hasOnlyTransientProvisioningShortfall`,
`resolveProvisioningShortfallFallbackMinimum`, the `Math.max(1, ...)` under-planning; `getProvisioningNodeTrustViewSync`
becomes the epoch read. Owner decision F10 (client contract) is a prerequisite. Test files: `usedDegradedFallback` 3,
`getProvisioningNodeTrustViewSync` 5, `resolveProvisioningShortfallFallbackMinimum` 1,
`table_partition_target_node_fallback_used` 0, `TABLE_PARTITION_TARGET_NODE_FALLBACK_USED` 0,
`TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS` 0, `TRANSIENT_PROVISIONING_SHORTFALL_REASONS` 0.

### C7: rebalancer critical-topology settle, available nodes, local-serve defer

**Current state.** `src/rebalancer/unified-rebalancer-critical-topology-methods.js:440-450`
`getCriticalSystemTopologySettlingBlocker` reads NODES from the cache (`readCachedRows` `:45-48` =
`rebalancer.systemTableCache.getAll(tableName)`); `isCriticalNodeReady` `:66-83`:

```
const readiness = ... getNodeReadinessSync(nodeId, {allowStaleOnCacheChange: false}) ...
const membershipReady = rebalancer.isReadinessDimensionSatisfied(readiness, context.readinessDecisionDimension);
const startupLeaseClear =
  context.bypassPriorityStartupReadiness &&
  nodeId === rebalancer.nodeId &&
  isNodeReadyLeaseExplicitlyCleared(nodeRow, {requireActiveStatus: true});
return startupLeaseClear || membershipReady;
```

blocker reasons `:162-171` (`node_ready_lease_incomplete` when `unreadyNodeIds.length > 0`, constant
`unified-rebalancer-shared.js:203`); in-flight blocker `:244-259` (C11); endpoint visibility `:365-387` with an
authoritative revalidation. Available nodes `unified-rebalancer-available-nodes.js:216-269`:
`this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, ...)` `:218`, readiness `:232-235`, startup-authority
carve `:236-243`, formation carve-out `:250-265` ("a node whose readiness denial is exclusively evidence-absent ...
stays placement-eligible. Cold formation otherwise deadlocks", `isEvidenceAbsentReadinessDenialSnapshot`,
`src/control-plane/readiness-denial-classification.js:44-48` over the two-code set `:20-23`). Local serve:
`unified-rebalancer-local-serve-readiness.js:127-157` returns a blocker -> `DEFER_PLANNING` when the local
readiness reasons include `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` (`:33-34`), consumed by
`rebalancer-planning-gate-methods.js:485-508`. The 75 s and 120 s in the analysis are observed deferral
durations (blocker #9, #23, #36), not constants; no constant with either value exists in `src/rebalancer` or
`src/constants` (unknown how the observed durations compose; the defer is re-evaluated per planning cycle).
Committed fact: as C5; the blocker summary records "Ruled out: ready-lease flap: leases current at 19:51:47; the
rebalancer reads a stale projection". Unchanged since the analysis.

**Precedent.** `git log -S node_ready_lease_incomplete -- src/`: 46b65f8ab (2026-03-18, "wip stabilizing node
join under load scenario", also `getCriticalSystemLocalServeReadinessBlocker`), e2797b6c8.
`-S isEvidenceAbsentReadinessDenialSnapshot`: 3fda9b056 (2026-08-15, `formation-ledger-spread-voter-ready-readiness-closure`).
CL-036 (guarded 2026-06-14): "Control-Plane Publications Spread Recovery Must Not Be Gated On A Node-Readiness That
Is Itself Gated On Publications Recovery" (circular formation/recovery dependency; `node_ready_lease_incomplete`
deferrals 39 -> 0 in that gate `:18`; "GUARDED ON MECHANISM; topline masked"). CL-044 (open, record-before-code):
joiner READY-lease barrier hold; "(b) no `NODE_READY_LEASE_INCOMPLETE` planning deferral for barrier-holding joiners"
`:48`. Quests: `formation-ledger-post-spread-voter-visibility-latency` (legacy; analysis: exhausted, durable voter
visibility design parked), `formation-priority-spread-authoritative-handoff-closure` and
`-publication-closure` (epic `topology-convergence-hardening`; analysis: exhausted after 7 attempts, "zero metric
movement"), `formation-ledger-spread-voter-ready-readiness-closure` (exhausted), `formation-health-verdicts`,
`formation-calibration-run`, `single-readiness-owner`, `release-0-2-five-node-convergence`,
`rolling-restart-core-stability` (EXHAUSTED, do not reopen), `comparative-benchmark-evidence-repair` (solved; the
analysis). Q6 record slice S7a ("safety carve-outs as typed PENDING decisions", `:579-583`) and fence ratchets
`:658-668` listing `isEvidenceAbsentReadinessDenialSnapshot` and `allowStaleOnCacheChange` as one-way fences.
Live diagnosis class C14 (joiner heartbeats 20 s-4 min stale -> leases expire). Rejected: carve-outs, startup
bypass, deferral timers, retuning.

**Repair.** Same epoch read as C5; the settle blocker and available-node filter consume `{decision, epoch}` per node;
`node_ready_lease_incomplete` is stated only from the authoritative lease at the epoch and a stale memo answers
`UNAVAILABLE_STALE{epoch}` (a typed defer naming the epoch, not a cycle count). Delete the formation carve-out and
`readiness-denial-classification.js`, the startup lease bypass (`shouldBypassLocalPriorityControlPlaneStartupReadiness`;
other consumers unknown), `readCachedRows` for the decision, and the local-serve defer on projection reasons.
Test files: `node_ready_lease_incomplete` 9, `getCriticalSystemLocalServeReadinessBlocker` 7,
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` 61, `isEvidenceAbsentReadinessDenialSnapshot` 2.

### C8: voter-ready activation

**Current state.** `src/node/replica-handler-voter-readiness-methods.js:194-243 waitForVoterReadyActivation`:
deadline `this.syncTimeoutMs` (`REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS: TIME_MS.MINUTE`,
`src/node/replica-handler-constants.js:20`), poll `VOTER_READY_CHECK_INTERVAL_MS = 250`
(`src/node/replica-handler-transition-policy.js:26`):

```
while (Date.now() <= deadline) {
  ...
  if (this.isReplicaVoterReady(replicaId)) {
    this.seedLocalReplicaVoterRaftRole(replicaId);                 // :214
    this.getTrackedService(replicaId)?.reassertDurableRaftRole?.(); // :222
    ...
    return;
  }
  await new Promise((resolve) => { setTimeout(resolve, VOTER_READY_CHECK_INTERVAL_MS); });
}
reportVoterReadyActivationSpent(...);
throw new Error(`Replica ${replicaId} did not become voter-ready within ${this.syncTimeoutMs}ms`);
```

`isReplicaVoterReady` `:250-262`: the tracked role (`getTrackedReplicaRole`, `replica-handler-runtime-methods.js:669-681`
-> `service.getRole()`: the live raft role, authoritative) AND `this.systemTableCache.get(SERVICES, replicaId)` with
a non-empty `address` `:255-259` (projection). `seedLocalReplicaVoterRaftRole`
(`src/node/replica-handler-create-status-methods.js:596-630`) writes `raft_role` into the local cache
(`applySystemTableChange(SERVICES, 'upsert', {service_id, raft_role}, {causeId: 'local-voter-ready:...'})`
`:620-628`) and marks the row local-only `:629`: a projection written from a local decision. A second cache read
gates whether the wait applies at all (`:108-141`, the operation row). Caller `replica-handler-create-methods.js:445`.
Committed fact: the raft role (live status) and the replica's committed node (`committedNodeIdOf`), so the address
needs no row. Unchanged since the analysis.

**Precedent.** `git log -S waitForVoterReadyActivation -- src/`: 62a1e525a (2026-02-09, born), e2797b6c8,
18dbdbe7f, a075c0faf. 6ae04d3ea (2026-06-22) and 1b68c5652 (2026-06-24) retimed the promotion delay against this
poll (analysis). CL-035 (guarded 2026-06-14): "A Replica's Voter-Ready Raft Promotion Must Be Visible To The REPLACE
Remove-Safety Gate On Its Own Node" -> `seedLocalReplicaVoterRaftRole` (`:252`): the remedy was a local cache write
(cache-as-authority). `formation-ledger-post-spread-voter-visibility-latency` (legacy; exhausted): run-27 "the
cluster read a raft LEADER as a learner forever" -> `reassertDurableRaftRole` level-trigger.
`formation-promoted-voter-not-voter-ready-routable-60s` (legacy; analysis: park-and-pivot 2026-07-09).
`formation-voter-surplus-promotion-deferral-livelock` (legacy, 2026-07-04). `voter-readiness-visibility-single-owner-table`
and children `voter-readiness-owner-migration-*` (epic `self-hosting-circularity-generic-treatment`, 2026-07-13:
"one declared, single-owner decision table"). `invariant-replica-voter-ready-visible-to-remove-safety-gate`
(superseded by migration). `zero-liferaft-active-runtime` (SYNC_TIMEOUT_MS). Census rows
`census-bounded-waits-2026-10-04.md:211` ("0-4/run") and `:468`. Rejected: retiming the two polls against each
other, the local cache seed, the level-triggered re-assert, timeout increases.

**Repair.** Voter-ready = `raft.readStatus().role` is a voter role (authoritative) and the address is
`committedPartitionPeerAddress(replicaId, committedNodeIdOf(replicaId))`; the create workflow advances on the
role-change event the handler already observes (which wake carries it: unknown); unavailability is typed. Delete the
60 s poll, `VOTER_READY_CHECK_INTERVAL_MS`, the row read in `isReplicaVoterReady`, `seedLocalReplicaVoterRaftRole`
(and `markServiceRowLocalOnly` if orphaned), the `reassertDurableRaftRole` level-trigger (the durable row write stays
with the row owner). The CL-035 invariant (the remove-safety gate sees the promotion) must be re-satisfied from the
committed configuration, not from the row: name it as the coupled interaction. Test files: `SYNC_TIMEOUT_MS` 6,
`waitForVoterReadyActivation` 4, `seedLocalReplicaVoterRaftRole` 4, `isReplicaVoterReady` 2,
`reassertDurableRaftRole` 2, `VOTER_READY_CHECK_INTERVAL_MS` 0.

### C9: CDC pipeline "ready"

**Current state.** `src/cdc/cdc-pipeline-readiness-gate.js:5-12`: "3. Pipeline has delivered at least one event to
SystemTableCache". Constructor `:82-99`: `_cacheAlreadyHydrated()` (`:315-333`, `this.systemTableCache.getAll(tableName)`
`:318`) sets `_pipelineProven`, else a one-shot `onCacheChange` listener sets it. `waitForReady` `:149-...`:

```
const timeout = timeoutMs || CDC_PIPELINE_READINESS_TIMEOUT_MS;
const interval = pollIntervalMs || CDC_PIPELINE_READINESS_POLL_INTERVAL_MS;
...
while (true) {
  const result = this.evaluate(context);
  if (result.ready) { ... return result; }
```

constants `src/constants/cdc-lifecycle-constants.js:22-23` (100 ms poll; 30 s timeout) and `:69-73`
(`PIPELINE_PROVEN`). Consumers: bootstrap phases `src/bootstrap/phases/seed-cache-hydration-phase.js:207` and
`src/bootstrap/phases/query-system-state-phase.js:238` (await it), `src/rebalancer/cluster-readiness-signal.js:97,158`
-> `rebalancer-planning-gate-methods.js:263` (planning gate), `unified-rebalancer-lifecycle-base.js:311-313`
(`clusterReadinessConfirmed`). Committed fact: not applicable to condition 3 (it asks the projection whether the
projection works); conditions 1-2 (subscriptions registered; propagation group leader) are owner facts available
synchronously. Unchanged since the analysis.

**Precedent.** `git log -S CDC_PIPELINE_READINESS_TIMEOUT_MS -- src/`: abb7e1f33 (2026-02-21, born), dc9927ec7,
54dd2d7ce. CL-014 (guarded 2026-06-11): "`CDCPipelineReadinessGate.pipelineProven` is satisfied VACUOUSLY by ..."
`:73` and "DELIBERATELY NOT CHANGED" `:99`. Quest records `cutover-seed-parity` (evidence-cdc-quiescence,
round-8 blocker catchup-sleep), `formation-sim-production-replica-composition`, `retained-seed-original-handoff`.
Census row `census-bounded-waits-2026-10-04.md:431` (`poll_max`, `throw_typed`, warn). No explicitly rejected
remedy recorded; CL-014 left the condition in place knowingly.

**Repair.** Delete condition 3 (`_pipelineProven`, `_cacheAlreadyHydrated`, the listener) and the 30 s poll;
readiness = conditions 1-2 answered synchronously by `evaluate`, with `unmetConditions` as the typed unavailable
state and no timer; the seed and join phases and the planning gate consume that state. Owner: cdc; sequence with the
D4 handoff decision (analysis section 4). Test files: `CDCPipelineReadinessGate` 10, `pipelineProven` 3,
`CDC_PIPELINE_READINESS_TIMEOUT_MS` 2, `_cacheAlreadyHydrated` 0.

### C11: in-flight topology operations source

**Current state.** `src/rebalancer/unified-rebalancer-shared.js:211-214`:

```
const TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE: 'authoritative',
});
```

Cache path `unified-rebalancer-critical-topology-methods.js:607-647` (`collectCriticalSystemInFlightReplicaOperations`:
`readAllSharedRows(this.systemTableCache, TABLES.REPLICA_OPERATIONS)` `:623-626`, `source: CACHE` `:646`) ->
`buildInFlightTopologyBlocker` `:244-259`. Authoritative path `revalidateInFlightTopologyBlocker` `:389-436`
(`rebalanceCoordinator.getOperationsByEntity(..., {visibilityReadMode: OWNER_RPC_REQUIRED})` `:399-406`, `source:
AUTHORITATIVE` `:433-434`); on a read error it keeps the cache blocker (`warnTopologyRevalidationFailure ... return
blocker` `:407-410`). The repository's cache reads `replica-operation-repository-row-methods.js:428-449` feed the
same rows. Join-side analogue `src/bootstrap/join-readiness-replica-operation-methods.js:68-70` (section 5, U23).
Committed fact: the owner RPC read exists and is already the revalidation. Unchanged since the analysis.

**Precedent.** `git log -S TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE -- src/`: 28f413983 (2026-03-30, born),
8f284ad8a, e2797b6c8, 86b7b178c, fb0193300, 42b1a428d, 6215b982f, fe68d7d08 (2026-07-18, planning-owner complexity
quest). No quest, spec or evidence names the symbol; `topology_operations_in_flight` appears in CL-036 only.
Rejected remedies: none recorded.

**Repair.** One source: the blocker is computed from the owner read or answers `UNAVAILABLE{reason}`; delete the
CACHE source, the constant, the cache read in `collectCriticalSystemInFlightReplicaOperations`, and the "keep the
cache blocker on error" branch. Test files: `topology_operations_in_flight` 4, `TOPOLOGY_OPERATIONS_IN_FLIGHT` 1,
`TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE` 0, `collectCriticalSystemInFlightReplicaOperations` 0.

### C12: learner count check overflow budget

**Current state.** `src/partition/partition-service-learner-promotion-count-check-methods.js:139-150`:

```
for (const nodeId of activeLearnerNodeIds) {
  const readiness = readinessService && typeof readinessService.getNodeReadinessSync === 'function' ?
      readinessService.getNodeReadinessSync(nodeId) : null;
  if (readiness && typeof readiness === 'object') { readinessByNodeId[nodeId] = readiness; }
}
const learnerPromotion = buildPriorityRecoveryLearnerPromotion({activeLearnerNodeIds, readinessByNodeId, recoveryActiveNodeIds: ...});
```

(no options: the memo may answer). Learner nodes come from cached service rows (`:62-66`,
`getPartitionServiceRowsForPromotion`, `partition-service-learner-promotion-methods.js:263-274`,
`filterSharedRows(this.systemTableCache, TABLES.SERVICES, ...)`); the planning snapshot `:49-52`. The module header
`:1-18` states the defect: the refusal `would_exceed_target_replica_count` with `maxAllowedVotersAfterPromotion 4`
"because the priority-recovery overflow budget evaluated on the learner's node is 0 where the planner's grants had
2", and that the module only makes the inputs observable ("quest learner-promotion-guard-inputs-observed").
Committed fact: partially. The voter/learner count is in the committed configuration (`READ_COMMITTED_MEMBERSHIP`),
and the overflow bound is a planner decision that `critical-spread-transition-authority-carry` (solved 2026-09-19)
attached to the ADD operation; whether the count check still derives the bound from `readinessByNodeId` or only logs
it is unknown (not traced into `learner-promotion-count-check.js`). Unchanged since the analysis.

**Precedent.** `learner-promotion-guard-inputs-observed` (epic `formation-seed-decoupling`, fix, solved 2026-09-19,
23 paths: observability only). `critical-spread-overflow-disagreement-replay` (superseded 2026-09-19 by owner
decision: "simulator quests narrow and never change src"). `critical-spread-overflow-budget-audit` (process,
superseded: round 3 rejected on defects D1-D3). `critical-spread-transition-authority-carry` (fix, solved
2026-09-19, 27 paths). Design `solve/epics/formation-seed-decoupling/design-critical-spread-transition-authority.md`
(mint the authorization at the cure policy, attach it to the move, the receiving partition keeps only local safety;
decision 3 `:141`). Also named by `formation-ledger-post-spread-voter-visibility-latency`,
`formation-voter-surplus-promotion-deferral-livelock`, `formation-ledger-self-move-blocks-cluster-ops`,
`movielens-priority-surrogate-single-owner-arbitration`, `movielens-replace-bootstrap-cohort-authority`. No commit
found by `-S` for a count-check symbol (not searched beyond the quests). Rejected: re-deriving the overflow budget
from the learner node's readiness view; synthetic replay inputs.

**Repair.** The count check reads the committed configuration for the voter count and the ADD operation's carried
authorization for the bound; delete `readinessByNodeId` (the `getNodeReadinessSync` loop) and the service-row
learner census for this decision. Smallest after the C5 epoch read exists (its readiness input disappears with it).
Test files: `maxAllowedVotersAfterPromotion` 6, `getNodeReadinessSync` 139 (broad).

### C13: resume of the participant-cutover pause

**Current state.** The pause is raised at `src/node/replica-handler-participant-cutover.js:303` inside
`runCutoverAttempt` (`:286-334`) before the facts are read, and by any release request
(`src/node/replica-handler-participant-release.js:173, 225`). Facts: `src/partition/partition-participant-transaction-pause.js:131-175`
`readParticipantReleaseFactsAssessment`:

```
const membership = await service.raft.readCommittedMembership({purpose});   // :142
const status = service.raft.readStatus();                                   // :143
```

-> `observedReleaseFacts` `:116-128` (`membership` committed; `peers: status.peers` `:122`; `confChangePending`
`:121`). Cohort `cutover.js:47-57`:

```
function cohortOf(handler, facts) {
  const members = releaseMemberIds(facts.membership);
  if (members === null) return null;
  const routes = members.map((replicaId) => {
    if (replicaId === facts.generation.replicaId) return {replicaId, nodeId: handler.nodeId};
    const peer = facts.peers.find((item) => item.replicaIdentity === replicaId);
    const nodeId = releaseNodeOfAddress(peer?.address);
    return nodeId === null ? null : {replicaId, nodeId};
  });
  return routes.includes(null) ? null : routes;
}
```

`releaseMemberIds` (`src/partition/partition-participant-release-contract.js:87-96`) = `[...voters, ...learners]`
of the committed configuration mapped to identities; null while a joint configuration is pending
(`votersOutgoing`/`learnersNext` non-empty) or an identity is missing. A null route answers
`UNAVAILABLE{COMMITTED_REPLICA_ROUTES}` (`:316-319`). The census asks each member's node (`readCohort` `:59`); a node
not hosting the replica answers `UNAVAILABLE{HOSTED_REPLICA}` (`participant-release.js:383-386`); `unavailableCensus`
`:71-73` -> `normalizeMemberRefusal` (`:320-332`). Recovery `src/node/replica-handler-release-recovery.js:183-211`:

```
const answer = await runParticipantCutover(handler, {partitionId, targetBuildDigest: build.digest,
  trigger: TRIGGER.EXISTING_ORIGIN, deadlineAtMs: now() + BOUND.DRAIN_DEADLINE_MS});
report(partitionId, answer);
if (answer.outcome !== OUTCOME.CUT_OVER) enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);   // :210
```

`DRAIN_DEADLINE_MS: 30000`, `RECOVERY_RETRY_MS: 1000`, `PAUSE_RETRY_AFTER_MS: 100`
(`src/partition/partition-participant-transaction-cutover-constants.js:44, 50`). The only non-retrying outcomes are
`OPERATOR_REQUIRED` for a missing origin or unmeasured build (`:193-203`); a repeated `UNAVAILABLE{hosted_replica}`
is re-driven every second without bound, its log line deduplicated for `DRAIN_DEADLINE_MS` (`:157-166`). Writes
answer `partition_write_cutover_paused` (`src/partition/partition-write-kernel.js:60`; `src/constants/errors.js:46-48`
"not proposed, retried once the pause lifts"). Committed fact: yes, and it is the fact read. Unchanged since the
analysis.

**Precedent.** `git log -S releaseMemberIds -- src/`: 54dd2d7ce (2026-10-27, TX1 release). Quests (all epic
`raft-rs-full-cutover`): `replicated-transaction-decision-and-apply` and `tx1-single-path-alpha` (TX1 pause/release
owners), `participant-release-held-recovery-continuation` (product, solved 2026-10-26: one bounded continuation while
the runtime is host-held; constraints "one-recovery-and-release-owner" (no second release algorithm, timer, election
driver, ledger or status interpretation) and "wake-is-not-authority"), `participant-release-owner-cycle-removal`
(fix, solved 2026-10-26), `participant-release-completion-owner` (fix, 2026-10-21..27, terminal unknown),
`cutover-transition-authority-review` (fix, solved: transitions classified by trigger, facts, commit point,
lost-answer). Contract `authority-and-recovery.md:147-172` ("Participant release observes a held runtime through one
continuation"; "Without a leader, any canonical held observation retains one partition debt"; runtime bindings
`:49-58`). Rejected: a second release algorithm or timer; a wake as authority.

**Repair.** (i) A member named by the committed configuration whose host answers `hosted_replica` past the owner's
deadline becomes a typed, permanent `RELEASE_BLOCKED{member, membershipGenerationIndex, missingFact}` (contract
`:143-144`), reported once and routed to the owner that can change the fact: the committed configuration (the
rebalancer's FAILED-replica cure, which REMOVEs a configured peer that no node hosts); the refusal names the event
that causes reconsideration (`:140-141`), a membership generation change. (ii) The recovery owner stops re-driving
on an identical `UNAVAILABLE{hosted_replica}` and wakes on a committed-configuration change instead of
`RECOVERY_RETRY_MS`. (iii) The pause is raised only after the cohort resolves, or is released when it cannot, so
writes are not refused for a release that cannot proceed. Deletions: the unconditional `enqueue(RECOVERY_RETRY_MS)`
on every non-CUT_OVER answer (`:210`); the signature deduplication as a throttle (`:157-166`), replaced by the typed
state. Test files: `CUTOVER_PAUSED` 15, `readParticipantReleaseFacts` 4, `participantCutoverPause` 4,
`RECOVERY_RETRY_MS` 3, `releaseMemberIds` 2, `hosted_replica`/`HOSTED_REPLICA` 0, `runParticipantCutover` 0,
`COMMITTED_REPLICA_ROUTES` 0.

## 3. H3 for C13

H3 (analysis section 4): "the release cohort census includes the removed `control_plane_publications-p1-r2`, so
`hosted_replica` can never clear; confirm by reading `facts.membership` of the paused partition's release record
against the committed configuration."

Reading, without running anything: there is no stored release record whose membership could go stale. Every attempt
re-reads `facts.membership` from `service.raft.readCommittedMembership({purpose: RETIREMENT})`
(`partition-participant-transaction-pause.js:142`, called from `cutover.js:304-305`) and derives the cohort from it
on the spot (`cutover.js:315`, `release-contract.js:87-96`). The release identity binds the configuration key and
membership generation of that read (`cutover.js:307-310`), and a census member whose facts disagree with it is
`STALE` (`release-contract.js:122-135`).

- Literal form REFUTED by construction: a member removed from the committed configuration is absent from
  `releaseMemberIds` on the next attempt and is not awaited.
- Mechanism CONFIRMED by construction: a member still named by the committed configuration whose replica no node
  hosts is awaited on every attempt, answers `UNAVAILABLE{hosted_replica}` (`participant-release.js:383-386`), and
  the recovery re-drives it every `RECOVERY_RETRY_MS` (1 s) without a permanent outcome (`release-recovery.js:210`),
  while the pause raised at `cutover.js:303` keeps refusing writes (`partition-write-kernel.js:60`). The authority is
  read correctly (R10); the consequence of its answer has no owner (contract `:138-145`): the blocked release
  names no event that can cause reconsideration and never becomes a permanent, typed refusal.
- Whether `control_plane_publications-p1-r2` was still in the committed configuration at the 22-minute observation
  (analysis #33, #37) cannot be established here: the blocker record is in the relocated bundle and no log was read.
  If it was, the gap above is the cause; if it was not, the cohort could not have included it and the cause is
  elsewhere (unknown).

A second structural observation: `raiseParticipantCutoverPause` precedes the facts read and the cohort resolution
(`cutover.js:303` before `:304-319`), so an unresolvable cohort (`COMMITTED_REPLICA_ROUTES`) leaves the leader paused
until the next attempt.

## 4. Grouping, epics, dependency on C1/C10, sequence

**Group A: one decision, several consumers (repair together).** C5 (routing filter, fail-open, bypass, defaults),
C6 (provisioning strict/degraded cohort, poll, lowering), C7 (settle blocker, available nodes, local-serve defer),
C11 (same settle blocker's in-flight source) and C12's readiness input all consume one fact: per-node serve
eligibility derived from `nodes` leases and the `control_plane_publications` epoch. They share the producer
(`control-plane-readiness-service-node-methods.js`), the memo (`snapshot-store.js`), the evidence-absent predicate
(`readiness-denial-classification.js`) and the `!== false` idiom. Quest `serve-eligibility-committed-epoch-read`
as the analysis proposed, extended with C11 and C12's input, and with two R09 supersessions
(`runtime-contracts.md:192-193`, `readiness-and-owner-contracts.md:13-24`) plus the CL-033 bound named by the Q6
record. Prerequisite owner decisions: F10 (`readiness-observation-currency.md:690`, client contract for an
under-replicated CREATE TABLE) and the Q6 record's own gate (`:669-675`: no slice starts without an owner decision).

**Group B: one fact, two consumers.** C3 (message-group transport) and C4 (leader address) both need "the address of
a configured peer", which the committed node answers; the partition already binds it, the port already hands it over,
and `resolveLeaderAddress` already has it as its fallback. Quest `peer-and-leader-address-from-committed-configuration`
(owners: partition, message-group, raft), including the message-group forwarding leader (U11). Prerequisite lead
decision D-C3 (FreshMG learner context; section 2, C3).

**Standalone.** C8 (node/replica handler; depends on the committed node that already exists for partitions and on
re-proving CL-035 from the committed configuration), C9 (cdc; sequence with D4), C13 (node + partition release
contract; depends on the FAILED-replica cure owner for the reconsideration event, not on C1/C10).

**Dependency on C1/C10.** `fresh-formation-user-table-routability` (the scenario carrier, epic
`topology-convergence-hardening`, unsealed) stays red until `replica-admission-from-committed-operation` lands (the
learner quest's `doneWhen-supersession` constraint on the land branch says so); Group A's instance witnesses are
red-first independently of it. C6 shares the `CACHE_VISIBILITY_TIMEOUT` classification with C1's wait
(`sql-query-engine-shared.js:153-157`): deleting it in Group A touches C1's answer path. C3-mg, C4, C8, C9, C11 and
C13 have no dependency on C1/C10 for their instance proofs.

**Epics.** `solve/epics/topology-convergence-hardening.md` has `authorizes: []` and no `legacy: true`; under
`scripts/solve/guards.js:239-252` a quest there may touch only its own quest directory and the epic's files, so it
cannot land `src/` changes; its own summary records `rolling-restart-core-stability` as EXHAUSTED and "must not be
reopened". `solve/epics/raft-rs-full-cutover.md` authorizes `architecture, docs, examples, package.json,
package-lock.json, scripts, src, test, .github, solve/oracle` and is the epic of the learner quest, TX1 and the
participant-release quests. `solve/epics/core-architecture-convergence.md` authorizes the `src/` subdirectories
(control-plane, query, rebalancer, node, partition, raft, cdc, message-group, ...) and holds the Q6 planning record.
`solve/epics/formation-seed-decoupling.md` authorizes control-plane, bootstrap, rebalancer, message-group, raft, cdc
(not query, node, partition). Recommendation: Group B, C8, C9 and C13 under `raft-rs-full-cutover` (consensus facts,
TX1 lineage, same epic as the repaired C2/C3); Group A under `core-architecture-convergence` (its Q6 record is the
owner plan; authorizes every directory Group A touches), or under `raft-rs-full-cutover` if the owner prefers one
epic for the whole class (the owner report of 2026-11-02 named the three successor quests without an epic).

**Recommended sequence.**
1. C11 as a first, tiny unit (optional): delete the dual source; proves the rebalancer's owner-read path in isolation.
2. Group B (C3-mg + C4): the fact exists; smallest owner pair; removes the stale message-group target list (#29) and
   the inverted leader resolution; needs D-C3 for the FreshMG learner.
3. C13 in parallel with 2 (independent owners).
4. C1/C10 land (parallel stream).
5. Group A (C5 + C6 + C7 + C11 + C12 input) with F10 and the R09 supersessions; scenario proof on
   `fresh-formation-user-table-routability` after 4.
6. C8 after 2 (uses the committed node for the address; re-proves CL-035).
7. C9 with the D4 handoff decision.

## 5. `systemTableCache.get` / `getAll` call sites in `src/` (169 sites, 83 files)

Class codes: DEC = feeds a gating decision (flagged by instance id, or `U-n` uncatalogued per R17); PRES =
presentation; DIAG = diagnostics or divergence emission; DISC = discovery, address book or bootstrap handoff (A8:
rows as address book, permitted as a trigger); RM = owner-declared read-model lookup that does not gate serving,
admission or membership on projection lag (table policy, latency groups, definitions); WRITE = a cached row used
as a write-path input (`runtime-contracts.md:205` names copying owner-managed fields from the cache into write paths
as forbidden); INFRA = gateway or read-strategy implementation (the strategy is the caller's). The enclosing
function is the nearest preceding definition. Counts: DEC 73, DIAG 13, DISC 26, INFRA 5, PRES 23, RM 24, WRITE 5. Classification of "unverified" rows
rests on the function name and file header only.

| Site | Enclosing function | Class | Instance / flag |
| --- | --- | --- | --- |
| `src/admin/admin-control-snapshot-local-build-base.js:461` | `buildLocalControlSnapshotForCacheOwner` | PRES |  |
| `src/admin/admin-control-snapshot-local-build-base.js:462` | `buildLocalControlSnapshotForCacheOwner` | PRES |  |
| `src/admin/admin-control-snapshot-local-build-base.js:463` | `buildLocalControlSnapshotForCacheOwner` | PRES |  |
| `src/admin/admin-control-snapshot-local-build-base.js:491` | `buildLocalControlSnapshotForCacheOwner` | PRES |  |
| `src/admin/admin-control-snapshot-local-build-base.js:492` | `buildLocalControlSnapshotForCacheOwner` | PRES |  |
| `src/admin/admin-control-snapshot-local-build-base.js:493` | `buildLocalControlSnapshotForCacheOwner` | PRES |  |
| `src/admin/admin-control-snapshot-local-build-base.js:496` | `buildLocalControlSnapshotForCacheOwner` | PRES |  |
| `src/admin/admin-control-snapshot-local-diagnostics-methods.js:228` | `buildLocalCdcDiagnostics` | PRES |  |
| `src/admin/admin-control-snapshot-local-diagnostics-methods.js:339` | `buildLocalPartitionDiagnostics` | PRES |  |
| `src/admin/admin-control-snapshot-local-diagnostics-methods.js:340` | `buildLocalPartitionDiagnostics` | PRES |  |
| `src/admin/admin-control-snapshot-local-diagnostics-methods.js:341` | `buildLocalPartitionDiagnostics` | PRES |  |
| `src/admin/admin-control-snapshot-local-diagnostics-methods.js:491` | `buildLocalSqlDiagnostics` | PRES |  |
| `src/admin/admin-control-snapshot-local-diagnostics-methods.js:492` | `buildLocalSqlDiagnostics` | PRES |  |
| `src/admin/admin-control-snapshot-local-diagnostics-methods.js:493` | `buildLocalSqlDiagnostics` | PRES |  |
| `src/admin/admin-control-snapshot-node-view-projection.js:651` | `evaluateAuthoritativeControlSnapshotRepair` | DIAG | authoritative snapshot repair evaluation |
| `src/admin/admin-control-snapshot-node-view-projection.js:652` | `evaluateAuthoritativeControlSnapshotRepair` | DIAG |  |
| `src/admin/admin-control-snapshot-node-view-projection.js:653` | `evaluateAuthoritativeControlSnapshotRepair` | DIAG |  |
| `src/admin/admin-control-snapshot-node-view-projection.js:654` | `evaluateAuthoritativeControlSnapshotRepair` | DIAG |  |
| `src/admin/admin-control-snapshot-node-view-projection.js:655` | `evaluateAuthoritativeControlSnapshotRepair` | DIAG |  |
| `src/admin/admin-control-snapshot-node-view-projection.js:678` | `evaluateAuthoritativeControlSnapshotRepair` | DIAG |  |
| `src/admin/admin-preflight-snapshot.js:378` | `resolvePreflightSnapshotNodeAddress` | PRES |  |
| `src/admin/admin-preflight-snapshot.js:486` | `buildPreflightControlPlanePartitionEntry` | PRES |  |
| `src/admin/admin-preflight-snapshot.js:500` | `partitionRow` | PRES |  |
| `src/admin/admin-preflight-snapshot.js:662` | `buildPreflightRowCountsSummary` | PRES |  |
| `src/admin/admin-preflight-snapshot.js:671` | `buildPreflightRowCountsSummary` | PRES |  |
| `src/admin/admin-service-discovery-readiness-context-methods.js:90` | `buildServiceDiscoveryReadinessContext` | DISC | service discovery context |
| `src/admin/admin-service-discovery-readiness-context-methods.js:91` | `buildServiceDiscoveryReadinessContext` | DISC |  |
| `src/admin/admin-service-discovery-readiness-context-methods.js:92` | `buildServiceDiscoveryReadinessContext` | DISC |  |
| `src/admin/admin-service-discovery-readiness-context-methods.js:93` | `buildServiceDiscoveryReadinessContext` | DISC |  |
| `src/admin/admin-service-discovery-readiness-context-methods.js:94` | `buildServiceDiscoveryReadinessContext` | DISC |  |
| `src/admin/admin-service-discovery-readiness-methods.js:172` | `resolveDiscoveryMetadataNodeCoverage` | DISC | service discovery answer (A8) |
| `src/admin/admin-service-discovery-readiness-methods.js:173` | `resolveDiscoveryMetadataNodeCoverage` | DISC |  |
| `src/admin/admin-service-discovery-readiness-methods.js:174` | `resolveDiscoveryMetadataNodeCoverage` | DISC |  |
| `src/admin/admin-service-discovery-readiness-methods.js:175` | `resolveDiscoveryMetadataNodeCoverage` | DISC |  |
| `src/admin/admin-service-discovery-repair-cache-methods.js:514` | `resolveAuthoritativeDiscoveryRepairTables` | DIAG | cache vs authority repair |
| `src/admin/admin-service-discovery.js:477` | `buildLocalServiceDiscoverySnapshot` | DISC | service discovery snapshot |
| `src/admin/admin-service-discovery.js:479` | `buildLocalServiceDiscoverySnapshot` | DISC |  |
| `src/admin/admin-service-discovery.js:482` | `buildLocalServiceDiscoverySnapshot` | DISC |  |
| `src/admin/admin-websocket-api-base.js:638` | `buildCacheDump` | PRES |  |
| `src/admin/admin-websocket-local-observation-methods.js:78` | `tryExecuteLocalSystemTableObservationQuery` | PRES |  |
| `src/bootstrap/bootstrap-topology-snapshot.js:65` | `buildBootstrapTopologySnapshotEnvelope` | DISC | bootstrap handoff (A8) |
| `src/bootstrap/critical-placement-formation-observer.js:60` | `readTableRows` | DIAG | formation observer |
| `src/bootstrap/join-readiness-mesh-connectivity-methods.js:215` | `resolveMeshConnectivityNodeRows` | DEC | U25 join mesh connectivity node rows |
| `src/bootstrap/join-readiness-replica-operation-methods.js:68` | `collectCanonicalInFlightReplicaOperationDetails` | DEC | U23 join readiness in-flight operations from cache (join-side analogue of C11) |
| `src/bootstrap/join-readiness-replica-operation-methods.js:70` | `collectCanonicalInFlightReplicaOperationDetails` | DEC | U23 |
| `src/bootstrap/join-readiness-replica-operation-methods.js:320` | `resolveCanonicalDiscoveryCriticalPartitionIds` | DEC | U23 critical partition ids |
| `src/bootstrap/join-readiness-snapshot-methods.js:517` | `resolveCanonicalJoinActiveNodeAuthority` | DEC | U24 join active-node authority from cached nodes (Q6 record row Q20) |
| `src/bootstrap/join-schema-version-resolver.js:174` | `rows` | DEC | U27 schema version at join from cached tables; unverified |
| `src/bootstrap/owners/bootstrap-cluster-view-owner.js:105` | `getReadyNodes` | DEC | U21 join admission view (Q6 record row Q20) |
| `src/bootstrap/owners/bootstrap-cluster-view-owner.js:106` | `getReadyNodes` | DEC | U21 |
| `src/bootstrap/owners/bootstrap-cluster-view-owner.js:171` | `getTablePolicies` | RM | table policies |
| `src/bootstrap/owners/bootstrap-cluster-view-owner.js:238` | `getClusterState` | DEC | U21 cluster state |
| `src/bootstrap/owners/bootstrap-join-admission-owner.js:287` | `resolveSupportEnvelopeConflict` | DEC | U22 join admission conflict resolution from cached node row |
| `src/bootstrap/owners/bootstrap-join-admission-owner.js:368` | `logIdempotentNodeRejoin` | DIAG | rejoin log |
| `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js:128` | `getPublishedBootstrapAuthoritativeTableRows` | DISC | bootstrap handoff to joiners (A8) |
| `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js:290` | `getLatestObservedBootstrapPartitionSnapshotRow` | DISC | bootstrap handoff to joiners (A8) |
| `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js:306` | `getCachedPartitionRow` | DISC | bootstrap handoff to joiners (A8) |
| `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js:351` | `getLatencyTopologyHints` | DISC | bootstrap handoff to joiners (A8) |
| `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js:352` | `getLatencyTopologyHints` | DISC | bootstrap handoff to joiners (A8) |
| `src/bootstrap/owners/bootstrap-topology-snapshot-owner-published-views.js:354` | `getLatencyTopologyHints` | DISC | bootstrap handoff to joiners (A8) |
| `src/bootstrap/owners/join-message-group-runtime-owner.js:34` | `assertReplicaStartupOwnership` | DEC | U20 startup ownership assertion from the cached services row |
| `src/bootstrap/owners/move-replica-assignment-reservation-persistence.js:80` | `isMoveReplicaAssignmentRow` | DEC | U18 storage reservation persistence judged from cached replica_operations (epic storage-reservation-reconcile-synchronous-sweep) |
| `src/bootstrap/owners/service-leader-readiness-owner.js:274` | `getLeaderReadinessPartitionSetsForTables` | DEC | U19 seed join gate leader readiness from cached partitions (quest seed-join-gate-authoritative-refresh: bounded authoritative re-read on miss = cache+SQL mix) |
| `src/bootstrap/owners/service-leader-readiness-owner.js:662` | `getSystemPartitionLeaders` | DEC | U19 |
| `src/bootstrap/phases/query-system-state-phase-snapshot-helpers.js:142` | `?` | RM | bootstrap hydration |
| `src/bootstrap/phases/query-system-state-phase.js:182` | `phaseQuerySystemState` | RM | bootstrap hydration |
| `src/bootstrap/phases/seed-cache-hydration-phase.js:484` | `verifyCacheHydration` | DIAG | C9-adjacent hydration verification |
| `src/bootstrap/rejoin-hints.js:131` | `readCachedClusterId` | DISC | rejoin hints (A8) |
| `src/bootstrap/rejoin-hints.js:142` | `buildRejoinHintsSnapshot` | DISC | rejoin hints (A8) |
| `src/bootstrap/shared/control-plane-setup.js:451` | `createInstallableServiceArtifactResolver` | RM |  |
| `src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:48` | `readJoinCacheRows` | DEC | U26 rejoin restore planning from cached rows |
| `src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:67` | `readJoinCacheRows` | DEC | U26 |
| `src/bootstrap/system-partition-classification.js:379` | `getPartitionRowFromCache` | RM | partition classification lookup |
| `src/cdc/cdc-pipeline-readiness-gate.js:318` | `_cacheAlreadyHydrated` | DEC | C9 _cacheAlreadyHydrated |
| `src/control-plane/control-plane-readiness-node-service-rows.js:111` | `readAllNodeServiceRows` | DEC | C5 services rows (cache fallback of readAllNodeServiceRows) |
| `src/control-plane/control-plane-readiness-node-service-rows.js:127` | `getNodeRow` | DEC | C5 getNodeRow |
| `src/control-plane/control-plane-readiness-node-service-rows.js:141` | `getNodeRows` | DEC | C5 getNodeRows |
| `src/control-plane/control-plane-readiness-node-service-rows.js:156` | `getNodeServiceRows` | DEC | C5 getNodeServiceRows |
| `src/control-plane/control-plane-readiness-service-node-methods.js:31` | `readTrustCacheRows` | DEC | C5/C6 readTrustCacheRows (provisioning trust view) |
| `src/control-plane/control-plane-readiness-service-node-methods.js:299` | `getAllNodeReadinessSync` | DEC | C5 getAllNodeReadinessSync |
| `src/control-plane/control-plane-readiness-service-node-methods.js:303` | `getAllNodeReadinessSync` | DEC | C5 getAllNodeReadinessSync |
| `src/control-plane/control-plane-system-table-gateway-read-strategies.js:139` | `executeCacheRead` | INFRA |  |
| `src/control-plane/formation-release-handoff-publication.js:441` | `isFormationReleaseHandoffContract` | DEC | U15 formation release handoff contract judged from a cached publication row (C5/C7 formation family) |
| `src/control-plane/membership-publication-coordinator-planning.js:192` | `readPublicationPlanningSnapshotSync` | DEC | C5 publication planning snapshot (Q6 record row Q18) |
| `src/control-plane/membership-publication-coordinator-planning.js:197` | `readPublicationPlanningSnapshotSync` | DEC | C5 (Q18) |
| `src/control-plane/membership-publication-coordinator-planning.js:207` | `readPublicationPlanningSnapshotSync` | DEC | C5 (Q18) |
| `src/control-plane/membership-publication-coordinator-reads.js:204` | `readTableRows` | DEC | C5 publication epoch rows from cache |
| `src/control-plane/membership-publication-coordinator-reads.js:211` | `readTableRows` | DEC | C5 |
| `src/control-plane/membership-publication-coordinator-reads.js:233` | `getLatestPublicationRowSync` | DEC | C5 latest publication row (epoch) from cache |
| `src/control-plane/membership-publication-coordinator-reads.js:271` | `getLatestPublishedPublicationRowSync` | DEC | C5 latest published row from cache |
| `src/control-plane/membership-publication-coordinator-reads.js:320` | `getLatestMembershipPublicationEpochStatusForNodeSync` | DEC | C5 membership publication epoch status from cache |
| `src/control-plane/owners/endpoint-incarnation-currentness.js:76` | `readCurrentEndpointRows` | DEC | C5 endpoint rows feeding readiness (node-methods.js:262,306) |
| `src/control-plane/owners/system-metadata-owner-base.js:259` | `result` | INFRA |  |
| `src/control-plane/owners/system-metadata-owner-base.js:265` | `result` | INFRA |  |
| `src/control-plane/owners/system-metadata-owner-base.js:278` | `listCachedRows` | INFRA |  |
| `src/control-plane/owners/system-metadata-owner-base.js:294` | `filterCachedRows` | INFRA |  |
| `src/control-plane/readiness-planning-formation-source.js:34` | `readSharedNodeRows` | DEC | C5 planning source rows |
| `src/control-plane/replica-dispatch-service-dispatch-observation-methods.js:336` | `getSystemTableRowFromCache` | DIAG | dispatch observation; whether it gates dispatch: unknown |
| `src/control-plane/replica-dispatch-service-dispatch-observation-methods.js:346` | `getSystemTableRowsFromCache` | DIAG | dispatch observation; unknown |
| `src/debug-runtime/debug-coordinator.js:170` | `hydrateFromSystemMetadata` | PRES | debug sessions |
| `src/debug/debug-session-resolver.js:171` | `readSessionRows` | PRES |  |
| `src/index-management/index-service.js:223` | `_hasCachedTableConfig` | RM | table config presence |
| `src/live-query/live-query-startup-wiring.js:38` | `resolvePartitionRow` | RM | startup partition lookup |
| `src/message-group/message-group-forwarding-owner-target-methods.js:42` | `resolveCanonicalLeaderIdentityFromCache` | DEC | U11 message-group forwarding target = canonical leader from cache (message-group analogue of C4) |
| `src/message-group/message-group-service-peer-resolution.js:139` | `resolvePeerAddressFromCache` | DEC | C3 (message group) resolvePeerAddressFromCache |
| `src/node/node-reintegration-service.js:620` | `getNodes` | DEC | U5 node reintegration decides over cached NODES (Q6 record row Q20: missing service = SATISFIED) |
| `src/node/replica-handler-create-status-methods.js:606` | `seedLocalReplicaVoterRaftRole` | WRITE | C8 seedLocalReplicaVoterRaftRole writes raft_role into the local cache (:620-628) |
| `src/node/replica-handler-runtime-metadata-methods.js:161` | `resolveReplicaContext` | DEC | U3 replica context waits SYNC_TIMEOUT_MS (60 s) for partition/table rows (census-bounded-waits-2026-10-04.md:467) |
| `src/node/replica-handler-runtime-metadata-methods.js:171` | `resolveReplicaContext` | DEC | U3 (same wait) |
| `src/node/replica-handler-runtime-metadata-methods.js:228` | `isViableJoinService` | DISC | isViableJoinService: leader-service discovery kept by learner quest as discovery (A8) |
| `src/node/replica-handler-runtime-methods.js:296` | `getLocalReplica` | RM | local replica lookup |
| `src/node/replica-handler-status-methods.js:126` | `updateReplicaStatus` | WRITE | U1 status mutation composed from the cached row (runtime-contracts.md:205 pattern); unverified |
| `src/node/replica-handler-voter-readiness-methods.js:124` | `assignReplicaHandlerVoterReadinessMethods` | DEC | C8 gate: operation row read from cache decides whether the voter-ready wait applies |
| `src/node/replica-handler-voter-readiness-methods.js:255` | `isReplicaVoterReady` | DEC | C8 isReplicaVoterReady requires the cached services row address |
| `src/node/replica-recovery-service.js:631` | `getPartitions` | DISC | restart scan inventory (contract :130-136 legitimate trigger) |
| `src/node/replica-recovery-service.js:645` | `getMessageGroups` | DISC | restart scan inventory |
| `src/node/replica-state-machine-lifecycle-observation.js:266` | `resolveReplicaCreateGroupId` | RM | group id lookup |
| `src/node/replica-state-machine-recovery.js:395` | `resolveSnapshotDurableVersion` | DEC | U2 snapshot durable version from the cached services row; unverified |
| `src/node/replica-state-machine-transition.js:724` | `buildUpdateCdcData` | WRITE | U4 CDC update payload composed from the cached row; unverified |
| `src/node/runtime-service-handler.js:420` | `recoverLocalReplicaForRemoval` | DEC | U6 removal recovery reads the cached row (runtime-contracts.md:164 forbids cache hit/absence as cleanup authority); unverified |
| `src/node/runtime-service-handler.js:616` | `resolveServiceDefinition` | RM | service definition lookup |
| `src/partition/partition-service-core-base.js:602` | `resolvePeerAddressFromCache` | DEC | C4 resolvePeerAddressFromCache (only consumer: resolveLeaderAddress :544) |
| `src/partition/partition-service-learner-promotion-methods.js:104` | `resolvePromotionReplicationTarget` | DEC | C12-adjacent: promotion replication target from cached partition row |
| `src/partition/partition-service-merge-replication-state.js:141` | `resolveMergeDescriptorEpochEvidenceForService` | DEC | U12 (merge) |
| `src/partition/partition-service-merge-replication-state.js:208` | `resolveLocalTableDescriptorForService` | DEC | U12 (merge) |
| `src/partition/partition-service-merge-replication-state.js:209` | `resolveLocalTableDescriptorForService` | DEC | U12 (merge) |
| `src/partition/partition-service-metadata-delivery-methods.js:69` | `seedLocalCanonicalLeaderNodeId` | WRITE | U13 local seed/clear of leader_node_id in the cache (C4-adjacent canonical leader projection) |
| `src/partition/partition-service-metadata-delivery-methods.js:127` | `clearLocalCanonicalLeaderNodeIdIfOwned` | WRITE | U13 |
| `src/partition/partition-service-metadata-delivery-methods.js:357` | `handleCanonicalLeaderRowCacheChange` | DEC | U13 canonical leader row change handling |
| `src/partition/partition-service-raft-init-base.js:132` | `getCachedSystemTableRow` | RM | U14 init-time cached row helper; remaining consumers after the learner quest deleted the init-loop cache admission: unknown |
| `src/partition/partition-service-raft-init-base.js:152` | `getCachedSystemTableRows` | RM | U14 |
| `src/partition/partition-service-split-replication-state.js:126` | `resolveSplitDescriptorEpochEvidenceForService` | DEC | U12 split descriptor epoch evidence from cached table/partition rows (epic split-merge-transition-integrity); unverified |
| `src/partition/partition-service-split-replication-state.js:127` | `resolveSplitDescriptorEpochEvidenceForService` | DEC | U12 |
| `src/partition/partition-service-split-replication-state.js:136` | `targetPartitionDescriptors` | DEC | U12 |
| `src/policy/table-policy-service.js:178` | `lookupCachedTable` | RM |  |
| `src/policy/table-policy-service.js:209` | `lookupCachedPartition` | RM |  |
| `src/policy/table-policy-service.js:603` | `lookupCachedMessageGroup` | RM |  |
| `src/raft/snapshot-catchup.js:133` | `readCachedPublicationRows` | DEC | U17 snapshot catch-up reads control_plane_publications from cache; unverified |
| `src/raft/snapshot-catchup.js:150` | `readCachedClusterId` | RM | cluster id |
| `src/rebalancer/cluster-readiness-signal.js:158` | `_checkCacheHydrated` | DEC | C9 cache-hydrated condition of the planning gate |
| `src/rebalancer/entity-size-resolution.js:54` | `resolveEntitySizeBytes` | DEC | U7 planning input (entity size) from cached partition row; low exposure |
| `src/rebalancer/operation-ledger-quorum-concentration.js:77` | `readTargetReplicaCount` | DEC | U9 ledger quorum-concentration hold reads target replica count from cache (quest operation-ledger-quorum-authoritative-release lineage) |
| `src/rebalancer/priority-publication-safety-rows.js:186` | `getCachedCriticalPartitionRow` | DEC | C7 family: priority publication safety reads the cached critical partition row |
| `src/rebalancer/replica-operation-repository-observation-methods.js:231` | `readAllServiceRows` | DEC | U10 operation actuals observed from cached services rows (runtime-contracts.md:206; quest executor-active-services-cache-handoff lineage); unverified |
| `src/rebalancer/replica-operation-repository-observation-methods.js:242` | `readAllServiceRows` | DEC | U10 |
| `src/rebalancer/replica-operation-repository-observation-methods.js:598` | `emitReplicaStatusDivergence` | DIAG | divergence emission |
| `src/rebalancer/replica-operation-repository-row-methods.js:428` | `getReplicaOperationRowFromCache` | DEC | C11 CACHE source of replica_operations rows |
| `src/rebalancer/replica-operation-repository-row-methods.js:431` | `getReplicaOperationRowFromCache` | DEC | C11 |
| `src/rebalancer/replica-operation-repository-row-methods.js:449` | `filterReplicaOperationRowsFromCache` | DEC | C11 |
| `src/rebalancer/storage-capacity-accounting-service.js:204` | `getSystemTableRows` | DEC | U8 storage capacity admission input (Q6 record row R20) |
| `src/rebalancer/storage-capacity-accounting-service.js:229` | `getSystemTableRowsSync` | DEC | U8 |
| `src/rebalancer/unified-rebalancer-available-nodes.js:328` | `getStartupAuthorityNodeIdSet` | DEC | C7 startup authority node set |
| `src/rebalancer/unified-rebalancer-available-nodes.js:341` | `isFormationCohortSpreadCureTarget` | DEC | C7 isFormationCohortSpreadCureTarget |
| `src/rebalancer/unified-rebalancer-critical-topology-methods.js:46` | `readCachedRows` | DEC | C7 readCachedRows feeds the settle blocker (:444) |
| `src/rebalancer/unified-rebalancer-follow-up-move.js:460` | `isPriorityRecoveryFollowUpTargetKnownLocallyNotReady` | DEC | C7 family: follow-up target readiness from cached node row |
| `src/rebalancer/unified-rebalancer-priority-readiness.js:583` | `evaluateCriticalSystemEndpointVisibility` | DEC | C7 endpoint visibility blocker (authoritative revalidation exists :365-387) |
| `src/rebalancer/unified-rebalancer-replica-state.js:222` | `getNodeReadinessSkipReason` | DEC | C7 family: readiness skip reason from cached node row |
| `src/runtime/runtime-endpoint-publication-wiring.js:58` | `resolveLogicalServiceId` | RM | logical service id |
| `src/topology/cdc-group-propagation-routing.js:68` | `observedServiceRoute` | DEC | U16 CDC fan-out routing by cached node row (C10-adjacent remote subscriber routing) |
| `src/topology/cdc-group-propagation-routing.js:141` | `buildGroupedContext` | DEC | U16 |
| `src/topology/latency-group-manager.js:227` | `runAssignmentCycle` | RM |  |
| `src/topology/latency-group-manager.js:242` | `runAssignmentCycle` | RM |  |
| `src/topology/latency-group-manager.js:243` | `runAssignmentCycle` | RM |  |
| `src/topology/latency-measurement-service.js:477` | `getExistingEdgeRow` | RM |  |
| `src/topology/latency-tree-service.js:261` | `getActiveGroupIds` | RM |  |
| `src/topology/latency-tree-service.js:282` | `resolveLocalGroupId` | RM |  |
| `src/topology/latency-tree-service.js:299` | `buildAdjacency` | RM |  |
| `src/transport/node-address-resolution.js:401` | `getAuthoritativeNodeRow` | DISC | node -> host:port layer below the committed node id; note :401 is named getAuthoritativeNodeRow but reads the cache |
| `src/transport/node-address-resolution.js:418` | `getCacheEndpointRows` | DISC | node -> host:port layer below the committed node id; note :401 is named getAuthoritativeNodeRow but reads the cache |

Not in this table but of the same shape: `systemTableCache.filter(...)` call sites (for example
`unified-rebalancer-available-nodes.js:218`, `message-group-service-raft-lifecycle.js:76`,
`partition-service-learner-promotion-methods.js:264` via `filterSharedRows`, `replica-handler-voter-readiness-methods.js:156`)
and `readAllSharedRows` / `getShared` wrappers (`critical-topology-methods.js:623`,
`control-plane-readiness-node-service-rows.js:124`); they are cited in section 2 where they feed an instance.

## 6. Uncatalogued findings (R17)

Flagged in section 5 and recorded here for their owners; none is fixed or absorbed by this census.

| Flag | Site | Decision | Owner area | Nearest prior record |
| --- | --- | --- | --- | --- |
| U1 | `replica-handler-status-methods.js:126` | status mutation composed from the cached row | node | none found |
| U2 | `replica-state-machine-recovery.js:395` | snapshot durable version from the cached services row | node | none found |
| U3 | `replica-handler-runtime-metadata-methods.js:161,171` | replica context waits 60 s for cached partition/table rows | node | `census-bounded-waits-2026-10-04.md:467` |
| U4 | `replica-state-machine-transition.js:724` | CDC update payload from the cached row | node | none found |
| U5 | `node-reintegration-service.js:620` | reintegration over cached NODES | node | Q6 record row Q20 |
| U6 | `runtime-service-handler.js:420` | removal recovery from the cached row | node | `runtime-contracts.md:164` |
| U7 | `entity-size-resolution.js:54` | planning size input | rebalancer | none found |
| U8 | `storage-capacity-accounting-service.js:204,229` | storage admission input | rebalancer | Q6 record row R20 |
| U9 | `operation-ledger-quorum-concentration.js:77` | ledger quorum hold reads target count | rebalancer | quest `operation-ledger-quorum-authoritative-release` |
| U10 | `replica-operation-repository-observation-methods.js:231,242` | operation actuals from cached services rows | rebalancer | quest `executor-active-services-cache-handoff`; `runtime-contracts.md:206` |
| U11 | `message-group-forwarding-owner-target-methods.js:42` | forwarding target = leader from cache | message-group | C4 analogue; none found |
| U12 | `partition-service-split-replication-state.js:126,127,136`, `partition-service-merge-replication-state.js:141,208,209` | split/merge descriptor epoch evidence from cached rows | partition | epic `split-merge-transition-integrity` |
| U13 | `partition-service-metadata-delivery-methods.js:69,127,357` | local seed/clear of `leader_node_id` in the cache | partition | C4-adjacent; none found |
| U14 | `partition-service-raft-init-base.js:132,152` | init-time cached row helpers; remaining consumers unknown | partition | learner quest deleted the init-loop cache admission |
| U15 | `formation-release-handoff-publication.js:441` | formation release handoff from a cached publication row | control-plane | `formation-release-handoff-closure*` quests |
| U16 | `cdc-group-propagation-routing.js:68,141` | CDC fan-out routing by cached node row | topology/cdc | C10-adjacent |
| U17 | `snapshot-catchup.js:133` | snapshot catch-up reads cached publications | raft | none found |
| U18 | `move-replica-assignment-reservation-persistence.js:80` | reservation persistence from cached replica_operations | bootstrap/rebalancer | epic `storage-reservation-reconcile-synchronous-sweep` |
| U19 | `service-leader-readiness-owner.js:274,662` | seed join gate leader readiness from cached partitions | bootstrap | quest `seed-join-gate-authoritative-refresh` (cache+SQL mix) |
| U20 | `join-message-group-runtime-owner.js:34` | startup ownership assertion from the cached services row | bootstrap | none found |
| U21 | `bootstrap-cluster-view-owner.js:105,106,238` | join admission view | bootstrap | Q6 record row Q20 |
| U22 | `bootstrap-join-admission-owner.js:287` | join admission conflict from cached node row | bootstrap | none found |
| U23 | `join-readiness-replica-operation-methods.js:68,70,320` | join readiness in-flight operations from cache | bootstrap | C11 analogue |
| U24 | `join-readiness-snapshot-methods.js:517` | join active-node authority from cached nodes | bootstrap | Q6 record row Q20 |
| U25 | `join-readiness-mesh-connectivity-methods.js:215` | join mesh connectivity node rows | bootstrap | none found |
| U26 | `durable-rejoin-partition-restore-planner.js:48,67` | rejoin restore planning from cached rows | bootstrap | none found |
| U27 | `join-schema-version-resolver.js:174` | schema version at join from cached tables | bootstrap | none found |

Adjacent findings outside the `get`/`getAll` grep: the message-group admission trigger enumerates peers from rows
(`message-group-service-raft-lifecycle.js:74-92`, `systemTableCache.filter`) and supplies the node that gets
committed (the message-group analogue of C1's admission trigger, owned by the parallel stream for partitions);
`transport/node-address-resolution.js:401` is named `getAuthoritativeNodeRow` but reads the cache.

## 7. Unknowns

- Whether `control_plane_publications-p1-r2` was in the committed configuration at the 2026-11-01 observation
  (section 3).
- The composition of the observed 75 s / 120 s deferrals (C7): no constant found.
- Whether the C12 count check still derives the overflow bound from `readinessByNodeId` or only logs it.
- Whether the message-group learner join passes `peerAddresses` through `host.serviceOptions` (C3).
- Remaining consumers of `resolveLivePeerAddressFromConsensus`, `shouldBypassLocalPriorityControlPlaneStartupReadiness`,
  `normalizeLeaderReplicaId` (address-shaped `leaderId`) and `partition-service-raft-init-base.js:132,152`.
- Which handler wake carries the raft role change the C8 repair would consume.
- Current line numbers of `SQLSTATE_BY_ENGINE_ERROR_CODE` in `src/runtime/pgwire-result-mapper.js` (C6 typed
  answer).
- Terminal status of the pre-solve-v2 quests marked "terminal unknown" (their logs carry no terminal entry).
- The content of the relocated blocker record beyond what the analysis quotes.

## 8. Audit results on this document (2026-11-02)

- `npm run audit:doc-audience`: "Documentation path boundary holds."
- `npm run audit:documentation-current`: one violation, not in this document and not fixed here (R16/R17):
  `architecture/contracts/authority-and-recovery.md:295: referenced repository path is missing:
  solve/quests/learner-host-from-committed-admission/evidence/transition.md`. On the land branch
  (`203c99f6e`) the same line references `docs/evidence/learner-host-from-committed-admission-2026-11/transition.md`,
  which exists there. The transplant onto main (`a3e2dfef7` / `b26d2c090`) rewrote the reference to a
  `solve/quests/.../evidence/transition.md` path that exists on neither branch (the land branch's quest evidence
  directory holds only `receipt.json`) and did not carry the `docs/evidence/learner-host-from-committed-admission-2026-11/`
  directory. Finding for the owner of `work/learner-committed-admission-rebase-20261102` / PR #184: restore the
  transition record and point the binding at it.
