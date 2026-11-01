# Systemic analysis: projection-gated serving decisions (serve lane never opens), 2026-11-01

Read-only investigation in worktree `lagrange-benchmark-repair-20261101`, HEAD `b20f94dc7`; `src/` is identical to the
image that ran the blocker (`product-blocker-first-divergence-2026-11-01.md` §0). Nothing staged or committed. Line
numbers are of this HEAD. Owner rule applied: systematic unless proven local; research prior occurrences; no legacy
or fallback logic.

## 1. The defect class

**Definition.** A correctness- or serving-gating decision (admit, promote, route, provision, plan, answer a write)
consumes a projection of committed state (the CDC-fed `SystemTableCache`, a memoised readiness snapshot, the
rebalancer's topology view) *as if it were the committed authority*, and copes with projection lag by one of: a
timer-bounded wait, a degraded/fail-open alternate path, or a `!== false` / `|| default` that treats an absent
input as satisfied. Contract: `architecture/contracts/authority-and-recovery.md:110-116` ("a projection may trigger
reconciliation but cannot grant permission, discharge an obligation or declare completion"), `:119-122` ("recovery
must not depend on the condition it restores"), `:143-144` ("permanent refusal is explicit"), state table `:202`
(observation/presentation: "never an independent completion oracle"). Steering: R10 (`docs/steering/rules.md:82-87`),
R11 (`:89-95`), R03 (`:28-34`), R05 (`:45-50`). `architecture/runtime-contracts.md:187-188` names the cache "the
steady-state read model ... not an authority", and `:206-207` forbids "mixing cache and SQL fallbacks inside one
semantic decision path" and "completing executor-owned topology phases from cache visibility alone". Committed-read
owner decisions (2026-09-25/26): `solve/epics/raft-rs-full-cutover/design-committed-membership-bootstrap-read-2026-09-25.md:329-350`
(O1 current-committed read; O2 self excluded; O4 rejoin without record refused) and
`quest-records/replace-source-removal-owner/committed-read-amendment-1-2026-09-26.md:9-14` frozen claim: "No projected
row set grants consensus authority before committed membership establishes it"; its disposition A8 keeps "rows as
address book" as *discovery*, and its Q1 answer leaves the provisioner's cache-derived decision as residual CR-F1.
Today's chain is the address-book and provisioner residuals of that decision plus the serving gate it never covered.

**Census of consumers in `src/` (every row is one instance of the class).** "Auth." = the committed fact exists.

| # | Decision gated | Projection read (file:line) | Wait / fallback / default | Auth. exists | R10 | R11 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Answer to a routed system-table write (its `visibilityState`) | `src/cdc/cdc-integration-service-cache-visibility-wait.js:123-349` `waitForCacheUpdate`; callers `cdc-integration-service-mutation-operations.js:277,473`, `cdc-integration-service-mutations.js:40,237`, `src/query/sql-query-engine-partition-routing-readiness.js:282,294,391` | 1000 ms (`src/cdc/cdc-constants.js:32`) split 750 wait + 250 repair (`:155-165`); bootstrap bypass `:126-128`; authoritative repair fallback `:213-225, 350-402` (2 attempts, `OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK` `cdc-integration-service-cache-visibility-authority.js:21-28`); `allowPendingVisibility` quieter answer `:238-253, 280-286`; timeout classified retryable `src/query/sql-query-engine-shared.js:153-157` | yes: the write committed (`result.originHlc`, log position in `CDC_COMMITTED_RECEIPT_FIELDS` `src/cdc/cdc-delivery-outcome.js:50-52`) | no | no (3 alternate paths) |
| C2 | Leader grants/refuses a learner promotion proof | `src/partition/partition-service-learner-promotion-proof-methods.js:85-95` -> `partition-service-core-base.js:544-608` (`peerAddresses` list, cache overrides list `:587-589`) -> `:666-690` `systemTableCache.get(SERVICES, peerId)` + `isLivePartitionServiceRow` (`src/constants/service.js:34-37`) | no wait; refusal `learner_address_unresolvable`; learner retries 1 s + re-asserts its durable row (`partition-service-learner-promotion-wake-methods.js:178-209`), producing the UNIQUE failures (blocker #17) | yes: the leader admitted the learner with `peerAddress` (`partition-service-raft-peer-cache-reconciliation.js:340`; `src/raft/raft-rs-group-membership-admission.js:100-134, 204-223` records it in memory) and the committed configuration names it (`src/raft/raft-rs-committed-membership-read.js:103-156`) | no | no (3 resolution paths) |
| C3 | Raft transport peer address (partitions and message groups) | `src/raft/peer-address-resolver.js:60-70, 136-160`; `src/message-group/message-group-service-peer-resolution.js:135-156` | throw on miss; stale mg-1 target list 57 s after removal (blocker #29) | partially (committed membership has ids, not hosts) | no | no |
| C4 | Leader address for write forwarding | `partition-service-core-base.js:614-631` cache FIRST, live raft `leaderAddress` SECOND | authoritative is the fallback (inverted) | yes (`raft.readStatus().leaderAddress`) | no | no |
| C5 | Serve lane / `serveEligible` consumed by routing | lane rules `src/control-plane/projection-readiness-decision.js:63-91`; state `projection-readiness-state.js:72-76`; routing filter `src/query/query-executor-partition-routing-snapshot.js:60-62`; inputs are cache rows: `control-plane-readiness-service-node-methods.js:29-33, 362-399` (`readTrustCacheRows`), `control-plane-readiness-node-service-rows.js:27-50` (authoritative only with `allowAuthoritativeRefresh`), memo reuse `control-plane-readiness-snapshot-store.js:160-177`, `node-methods.js:420-437` | system-table fail-open to canonical leader `routing-snapshot.js:63-115` (evidence-absent reasons only); priority bypass `query-executor-priority-recovery-bootstrap-routing.js:15-33`; `!== false` default-true `membership-publication-priority-partition-readiness-data.js:63-77`, `unified-rebalancer-control-plane-readiness-methods.js:85-96` | yes: `nodes` rows with current leases and committed `control_plane_publications` epoch | no | no |
| C6 | CREATE TABLE provisioning cohort | `src/query/sql-query-engine-provisioning-methods.js:176-200` strict = trust view `serveEligible === true`; trust decision `src/control-plane/node-trust-state.js:258-310` | 10 s poll `sql-query-engine-shared.js:165-170`; degraded fallback to `repairEligible` nodes (`sql-query-engine-provision-target-methods.js:258,291`, `sql-query-engine-initial-partition-provisioning.js:242,423,528`); transient-shortfall minimum lowered to 1 "proceeds under-planned, the rebalancer fills in afterwards" (`sql-query-engine-provisioning-admission-methods.js:13-33, 262-279`) | yes (same as C5) | no | no |
| C7 | Rebalancer critical-topology settle / planning | `src/rebalancer/unified-rebalancer-critical-topology-methods.js:66-82, 165` (`node_ready_lease_incomplete`); `unified-rebalancer-available-nodes.js:218-250` (cache NODES filtered by readiness; formation carve-out); `unified-rebalancer-local-serve-readiness.js:127-150` (defer 75 s on `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`) | delays 75 s / 120 s; startup bypass | yes: leases were current authoritatively while the projection said incomplete (blocker #9, #36) | no | no |
| C8 | Voter-ready activation | `src/node/replica-handler-voter-readiness-methods.js:215-245` polls cache-visible role, 60 s `SYNC_TIMEOUT_MS` | timer; `reassertDurableRaftRole` | yes (raft role) | no | no |
| C9 | CDC pipeline "ready" | `src/cdc/cdc-pipeline-readiness-gate.js:1-60` (condition 3: one event seen in the cache) | `CDC_PIPELINE_READINESS_TIMEOUT_MS` | n/a | no | - |
| C10 | Advance the CDC obligation cursor (local cache is one subscriber) | `src/partition/partition-cdc-obligation-delivery.js:491-533` (`cdc_committed_acceptance_unknown`, deferRetry, order kept `:500-502`), `:574-586`, backoff `:408-470`; subscriber `src/bootstrap/shared/partition-cdc-propagation-subscriber.js:182-192` | unbounded retry with exponential delay; no typed owner of "no receipt" | direction right (committed receipt required), consequence unowned | - | no |
| C11 | In-flight topology operations source | `unified-rebalancer-shared.js:211-214` `CACHE` or `AUTHORITATIVE` | dual source | yes | no | no |
| C12 | Learner count check overflow budget | `partition-service-learner-promotion-count-check-methods.js:145` (`getNodeReadinessSync`) | - | partially | no | - |
| C13 | Resume of the participant-cutover pause | pause raised `src/node/replica-handler-participant-cutover.js:303`, `replica-handler-participant-release.js:173,225`; resume needs cohort `CUT_OVER` `participant-cutover.js:112-139` over `releaseMemberIds(facts.membership)` `:48`; a removed member answers `hosted_replica` unavailable `participant-release.js:383-387`; re-drive forever `replica-handler-release-recovery.js:171-227`; writes refused `partition-write-kernel.js:60`, `src/constants/errors.js:43-46` | retry timer, no permanent-refusal path (22 min, blocker #33, #37) | yes: committed membership at the release epoch | no | no |

Consequence chain today: C10 lag -> C1 bound spent (#8) -> C2 refusals 6-25 s per spread step (#14-15) -> C7 deferral (#23)
-> C5 lane closed (#24) -> C6 `provisionable=0`, then degraded fallback (#27-28) -> routing filters active services (#34-35);
C13 removes the only release path (#33). Every link is the same class; no link is local.

## 2. History: the class before today (dated timeline, repository evidence only)

| Date | Commit / quest | What changed | Instance addressed | Why it did not prevent 2026-11-01 |
| --- | --- | --- | --- | --- |
| 2026-01-30 | `5b9c56b90` | `CACHE_WAIT_TIMEOUT_MS` introduced ("stabilising node join") | C1 born | the wait itself is the class |
| 2026-03-05 | `8942e8675` | degraded provisioning target fallback (`usedDegradedFallback`) | C6 born | fallback, not authority |
| 2026-06-22 | `6ae04d3ea` | formation-fast learner-promotion delay for critical joiners (30 s > 10 s voter-ready poll) | C8 | retimes two projection waits against each other |
| 2026-06-24 | `1b68c5652` | REPLACE-target fast promotion predicate (flag) | C8 | third timer predicate |
| 2026-06-27 | `1a9da79b4` | edge-gate rebalancer re-init on readiness transitions (PRIORITY_CONTROL_PLANE_RECOVERY_PENDING oscillation fan-out) | C5/C7 flap | damps the symptom of a flapping projection |
| 2026-07-05 | `formation-ledger-post-spread-voter-visibility-latency` (exhausted) | hold's actuals saw `totalVoters=2` after moves completed; "durable voter visibility" design parked | C7 | parked |
| 2026-07-09 | `formation-promoted-voter-not-voter-ready-routable-60s` (park-and-pivot) | promoted voter not routable in 60 s | C5/C8 | parked |
| 2026-07-11 | `4b9a8642e` | centralize provisioning node trust (`node-trust-state.js`, trust view from cache rows) | C6 | one owner for the *projection*, not for the committed read |
| 2026-07-18..20 | `formation-priority-spread-authoritative-{handoff,publication}-closure` (both exhausted after 7 attempts) | "complete authoritative cache row exact replacement" theory | C5/C7 | "ladder-exhausted with zero metric movement" |
| 2026-07-19 | `executor-active-services-cache-handoff` (exhausted: symptom absent on HEAD) | REPLACE retains source until the target's SERVICES row is aligned into the planning cache; names "peer-address-resolution participant failures" | C2/C3 (same symptom as #14) | waits for the cache instead of reading the admission |
| 2026-07-25 | `movielens-pre-schema-priority-spread-admission-authority` (exhausted) | admission consumes the authoritative spread summary as mandatory data | C5 | the summary is still built from `serviceRows` projection (`current-priority-placement-observation.js:218-240`) |
| 2026-08-04 | `replica-projection-stale-leader-route-resync` (sealed, inherited) | projection writes wedged behind stale leader metadata | C4 | open residual |
| 2026-08-10 | `24c0b1edc` `learner-promotion-progress-proof` | promotion only on leader proof (authority direction right) | C2 born: the proof handler resolves the learner by cache address | the proof reads committed progress but the address from the cache |
| 2026-08-15 | `334bbca2d` `readiness-formation-liveness-circularity-closure` | system-table routing FAILS OPEN to the canonical raft leader when all candidates are denied for evidence-absent reasons; `planning_snapshot_refresh_pending` typed as evidence-absent | C5 | a carve-out: today the denial is "substantive" (`priority_recovery_active`) so the fail-open stays dormant and the lane never opens |
| 2026-08-15 | `formation-ledger-spread-voter-ready-readiness-closure` (exhausted 08-30) | extend the evidence-absent carve-out class to another consumer | C7 | more carve-outs |
| 2026-08-30 | `ce0e4942d` `learner-promotion-proof-channel-wake` | typed `learner_address_unresolvable`; learner re-asserts its durable row on that cause | C2 | accepts the lag; the re-assert hits UNIQUE (#17) |
| 2026-08-31 | `readiness-planning-deferral-bounded` | PARTITION_SERVICE_NOT_FOUND on a fully present partition because every candidate was denied by a deferred all-false contract; floored generation reuse | C5 | memo-key repair inside the projection |
| 2026-09-03/04 | `projection-readiness-*-v2`, `projection-readiness-planning-consumption-owner`, `single-readiness-owner` | one readiness owner per process; per-node generation key | C5 | one owner of the projection, still fed by the cache |
| 2026-09-23/24 | `solve/epics/raft-rs-full-cutover/investigation-{formation-lane,cutover-seed}-regressions` | rs-raft: system-table writes commit asynchronously, 5-60x slower during formation; 6,400 idle timer fires/s; "the shared enabler" | timing regime | every bound calibrated on liferaft's synchronous commit now expires |
| 2026-09-25/26 | committed-read design, O1/O2/O4 | consensus membership from the committed read; rows demoted to discovery (A8); provisioner residual CR-F1 | consensus authority only | today's chain is exactly the discovery and provisioner residuals |
| 2026-09-30 | `1aea11baf` | rs-raft cutover landed (0.2.6) | - | - |
| 2026-10-04 | `census-bounded-waits-2026-10-04.md` | 180 bounded waits; `CACHE_WAIT_TIMEOUT_MS` expiry "undetermined (unlogged at base)"; owner: "every earlier case of a fully spent timeout hid a real bug" | visibility only | behaviour after expiry unchanged by design |
| 2026-10-27 | `54dd2d7ce`, `252103a13` | 0.2.6 release: CDC causal confirmation (`cdc_committed_acceptance_unknown` enters production), provisioning admission +103 lines | C10 born, C6 widened | committed receipts required but the local cache is a remote-style subscriber |
| 2026-10-28/29 | `08ac497cd`, `3b737ce7e` | hydration causal fences; "wait out readiness deferral on reads" | C1/C5 | more waits |

Pattern: 20 interventions over nine months, each inside one consumer's projection (a timer, a carve-out, a fail-open,
a wake, a memo key). None moved a decision onto the committed fact. The cutover (async commit, receipt-gated CDC)
changed the lag distribution, and the whole calibrated set expired together on a fresh three-node formation.

## 3. How similar systems solve it

- **etcd.** Membership is a Raft ConfChange whose `Context` carries the member's peer URLs; the leader adds the
  transport peer from the committed entry, never from a side cache. Learners are promoted when
  `raft.Status().Progress[id].Match` is close to the leader's applied index (leader-side committed progress, no
  address lookup). Reads that gate decisions use ReadIndex (linearizable); watch streams only notify.
- **CockroachDB.** The range descriptor (committed in the range itself) carries `ReplicaDescriptor{NodeID, StoreID,
  ReplicaID}`; node liveness is a replicated KV record; epoch-based range leases tie serving rights to liveness
  epochs. The DistSender's range cache is a hint: `NotLeaseHolderError` / `RangeKeyMismatchError` evict and retry to
  authority. No decision is made from gossip alone.
- **TiKV / PD.** Region epoch `{conf_ver, version}` is checked on every request; `EpochNotMatch` is a typed error
  that refreshes the client's region cache and retries. PD is the single placement authority; the ConfChange carries
  `Peer{id, store_id}`; PD promotes learners from committed region heartbeats. Stale cache never decides; it errors.
- **FoundationDB.** After a recovery the new transaction system serves only once the recovery transaction commits;
  clients holding stale proxy/shard maps receive typed errors (`wrong_shard_server`, `future_version`,
  `process_behind`) and refresh.
- **Spanner / Paxos groups.** Leader leases; a replica without the lease refuses (typed) rather than serving.

**Common invariant.** (a) Decisions that grant permission, change membership, promote, lease or place are made from
committed state (ReadIndex, leader lease, epoch-checked record), and *the committed entry carries the facts the
decision needs* (peer address / store id). (b) Projections MAY route when every use is epoch-validated and a
mismatch is a typed error with retry-to-authority. (c) Unavailability is a typed outcome, never a quieter path.

| Lagrange consumer | Analogue | Matches? | No-fallback shape (R11) |
| --- | --- | --- | --- |
| C1 write answer | etcd put answers at commit; nobody waits on its own watch | no | the write answers at commit with its log position; a consumer that needs the projection waits on *that position* (shutdown-ended, no timer); delete the bypass, the repair fallback and `allowPendingVisibility` |
| C2/C3/C4 peer address | ConfChange.Context / ReplicaDescriptor / Peer.store_id | no | host is a field of the admitted identity: the committed membership answer (`raft-rs-committed-membership-read.js:146-156`) returns `{voters, learners, identities: id -> {replicaIdentity, nodeId}}`; the proof handler and transport resolve from it; refusals collapse to `NOT_LEADER` / `NOT_IN_CONFIGURATION`; `learner_address_unresolvable` deleted |
| C5/C7 serve lane, leases | CRDB liveness record + lease epoch; TiKV store heartbeat via PD | no | serve-eligibility is a committed read of `nodes` + `control_plane_publications` at a publication epoch (`CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED` exists, `control-plane-system-table-gateway-constants.js:97-103`); the readiness snapshot is a memo keyed by that epoch; stale memo answers `UNAVAILABLE_STALE{epoch}`; delete the fail-open, the priority bypass and every `!== false` |
| C6 provisioning | PD placement: N stores at epoch E or a typed refusal | no | one placement authority answers `{nodes, epoch}` or `PROVISIONING_UNAVAILABLE{epoch, reasons, retryAfterMs}`; delete the degraded fallback, the 10 s poll and the transient-minimum lowering |
| C10 CDC hold | leader applies to its own state machine at commit; CDC is for remote consumers | no | the leader's local cache is applied in `applyCommittedEntry`, not through the delivery lane; the lane serves remote groups only, so a hold can never gate local visibility; "no receipt" from a remote subscriber is a typed owner outcome with a deadline, not deferRetry forever |
| C13 cutover pause | FDB recovery version; release fact committed | no | the release record carries the membership epoch of its cohort; a member removed after the epoch is not awaited; after the owner's deadline the refusal is permanent and typed (`:143-144` of the contract) |

## 4. Systemic design (no implementation)

**Single authority.** Membership facts including host: the raft-rs runtime owner's committed configuration plus the
leader's admission record (already durable per identity in `_raft_rs_peer_identity.learner_admission`,
`src/raft/raft-rs-peer-identity-constants.js:9-15`; extend the admission record with `nodeId`, which the leader holds
at `admitPartitionRaftPeer` time, `partition-service-raft-peer-cache-reconciliation.js:340`). Serve-eligibility,
promotion admission and provisioning admission: the control-plane readiness owner answers only from a committed
read at a stated publication epoch; every answer is `{decision, epoch}` or `UNAVAILABLE{reason, epoch, retryAfterMs}`.
Consumers obtain it by `READ_COMMITTED_MEMBERSHIP` (partition facts) and one `readServeEligibility(nodeId)` on the
readiness owner (node facts); no consumer reads `systemTableCache.get/getAll` to *decide* (reads for presentation,
diagnostics and discovery stay, R05).

**Deletions (legacy/fallback that must not remain).** `waitForCacheUpdate` and the 750/250 budget split, the
bootstrap bypass, the authoritative repair fallback and `allowPendingVisibility` (C1); the three-path
`resolveKnownPeerAddress`, `resolvePeerAddressFromCache`, `peer-address-resolver.js` path 3, and the cause
`learner_address_unresolvable` (C2/C3); cache-first `resolveLeaderAddress` (C4); the system-table fail-open block
and `evidenceAbsentReasonCodes`, the priority bootstrap routing bypass, every `!== false` on a readiness dimension,
`allowStaleOnCacheChange` (C5); `usedDegradedFallback`, `TABLE_PARTITION_TARGET_NODE_FALLBACK_USED`,
`TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS`, `TRANSIENT_PROVISIONING_SHORTFALL_REASONS` lowering (C6); the
`CACHE | AUTHORITATIVE` dual source (C11); the 60 s voter-ready cache poll (C8); the cache-visibility condition of
the pipeline gate (C9). Per R11 each becomes a typed outcome, not a quieter path.

**Typed unavailability to CREATE TABLE and clients.** Provisioning answers `PROVISIONING_UNAVAILABLE` with the
epoch and reasons; the engine maps it to SQLSTATE `57P03` (`cannot_connect_now`, the PostgreSQL code for "not yet
accepting connections") with `retryAfterMs`, through the existing `SQLSTATE_BY_ENGINE_ERROR_CODE`
(`src/runtime/pgwire-result-mapper.js:122-154`), alongside the existing `55P03` convergence-pending answer. The
admin envelope carries `contractState: 'unavailable'` and the same epoch so a harness can wait on an epoch, not a
timer (`product-blocker...md` §5 predicate 2-3 become epoch comparisons).

**Bounding the CDC hold by design.** The local `SystemTableCache` of the leader is fed by the apply path at commit
(same process, same transaction boundary), so local visibility is a consequence of commit, not of delivery; the
obligation lane carries remote subscribers only. A remote subscriber that answers without a committed receipt is a
typed `SUBSCRIBER_UNCONFIRMED{subscriber, position}` with an owner deadline, after which the lane records a
permanent refusal for that subscriber (visible, R11) instead of `deferRetry` with exponential backoff forever.
This also removes three local replicas feeding one cache through the lane (blocker #5).

**Blast radius.** Owners: cdc (C1, C9, C10), partition + raft (C2, C3, C4, C12), control-plane readiness (C5),
query routing + provisioning + pgwire mapping (C5, C6), rebalancer (C7, C11), node/replica handler (C8, C13).
Contracts: `authority-and-recovery.md` runtime bindings gain the readiness owner and the membership-host owner;
`runtime-contracts.md:192-193` ("CDC-propagated metadata decisions read from the cache") must be superseded for
gating decisions (R09 explicit supersession). Tests referencing the surfaces (files): cache wait 79, `serveEligible`
79, `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` 55, fail-open 19, `planning_snapshot_refresh_pending` 14,
`buildPeerAddress` 8, `node_ready_lease_incomplete` 8, `learner_address_unresolvable` 4, cutover paused 3; **zero**
test files name the degraded provisioning fallback or `cdc_committed_acceptance_unknown` (unwitnessed production
paths). The CDC D1-D4 effort (`evidence/owner-review-2026-10-26/OWNER-REVIEW-2026-10-26.md` decision 4) owns the
lane; the local-apply change must be sequenced with its D4 handoff decision.

**Hypotheses labelled.** H1 (blocker §2) is unproven: the single observation that settles it is still the
authoritative `services` read versus `cache_dump` at a refusal instant. H3 (C13): the release cohort census
includes the removed `control_plane_publications-p1-r2`, so `hosted_replica` can never clear; confirm by reading
`facts.membership` of the paused partition's release record against the committed configuration.

## 5. First bounded quest

`learner-host-from-committed-admission` (epic `raft-rs-full-cutover`, continuation of O1/A8): the leader answers a
learner promotion proof from its committed configuration and admission record; the learner's host is a field of the
admitted identity; `learner_address_unresolvable` and the services-cache path in `buildPeerAddress` are deleted;
refusals are `NOT_LEADER` or `NOT_IN_CONFIGURATION`. Why first: it is the earliest *refusal* in the chain (#14; #8
only logs and falls back), it is the smallest owner pair (partition + raft), its direction is already owner-approved
("the stamp must carry identities from the log", design O1 line 350), and it removes 6-25 s per spread step so the
reproducer can measure the next link in isolation. Proof on `fresh-formation-user-table-routability`
(`test/distributed/config/local-three-node.json`, `consecutive: 3`): zero proof refusals for a replica named in the
committed configuration; priority spread `readyDistinctNodeCount = 3` within the stated bound; time-to-serve-lane
recorded. Second quest: `write-answers-at-commit-position` (C1 + local apply, C10) after the D4 decision; third:
`serve-eligibility-committed-epoch-read` (C5, C6, C7) deleting the fail-open, the degraded fallback and the `!== false`
defaults together, since they are one decision with three consumers.
