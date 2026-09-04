# single-readiness-owner — node-scoped boundary proof and engagement

Quest 1 of the readiness-planning liveness repair sequence (parent finding:
`readiness-planning-snapshot-liveness.slice1-receipt.md`, multiplier section).
Rule applied: fix the duplicate owner before optimizing the duplicated owner's
generation currency. Planning currency (six-table floored generation, 250 ms
latch, token semantics, reuse predicate, buildOptions variants), the settling
gate, routing, `node_ready_lease_incomplete` consumption,
`storage_reservation_reconcile` and the frozen critical-placement candidate are
byte-for-byte untouched.

## 1. Boundary proof — the service is node-scoped

Inventory of every stored field on `ControlPlaneReadinessService`
(`control-plane-readiness-participation-base.js` constructor plus installed
method modules), classified by scope:

| class | fields | scope |
| --- | --- | --- |
| constructor dependencies | nodeId, formationReleaseAuthorityNodeId, systemTableCache, cacheMutationTarget, nodesOwner, servicesOwner, messageRouter, nodeLifecycleStateMachine, storageAccountingService, cdcIntegrationService, cdcGroupPropagationService, heartbeatService, membershipPublicationService, controlPlaneSystemTableGateway, authoritativeControlPlaneView, localClusterIncarnationFenceProvider, timeSource | node (one per process; all set by `ControlPlaneSetup.create` and the coordinator container) |
| cache subscription | cacheChangeListener (one `onCacheChange` registration) | node |
| planning snapshots | readinessPlanningSnapshotOwner (completed/pending records keyed by ownerKey = nodeId x buildOptionsKey; OwnerKeyReconcileQueue) | node |
| memo state | lastReadinessSnapshot{,AtMs,InvalidatedAtMs,ServicesVersion}ByNodeId, membershipPublicationDiagnosticsMemo, priorityRecoveryPlanningProjectionMemoByNodeId, membershipPublicationPlanningSnapshotMemoByNodeId, membershipPublicationPlanningSnapshotContextMemo, membershipPlanningSnapshot{Sync,Async}MemoByPublisher, projectionReadinessEvidenceOwner (per-node generations) | node (keyed by nodeId / publisher) |
| live veto state | captured inside each completed planning record (positiveDecisionLiveVeto = lease/heartbeat/transport/publication-guard signature) | node |
| membership / readiness observations | readinessTransitionHistory{,View}ByNodeId, lastReadinessEvaluationByNodeId, lastActivePriorityRecoveryPlanningSnapshot{,AtMs}ByNodeId, provisioningTrustGraceByNodeId, currentRecoveryEpochByNodeId, recoveryEpochHistoryByNodeId, participationDecisionLedger, authoritativeReadinessRepairLedger, formationReleaseHandoffClosureOwner, formationReleaseHandoffPublicationCoordinator, authoritativeNodeEvidenceReconciler | node |
| shutdown hooks | none existed before this quest (`shutdownReadinessPlanningOwner` was never called by anyone) | — |

`partitionId` / `entityId` / `replicaId` appear only as per-call decision
context echoed into the returned participation decision
(`control-plane-readiness-participation-base.js` participation builders);
no stored field is keyed by a partition. **No partition-scoped state exists,
so nothing had to be split before sharing.**

## 2. Root cause (was)

`unified-rebalancer-lifecycle-base.js` constructed a private
`ControlPlaneReadinessService` per `UnifiedRebalancer` (one per hosted
partition; `partition-service-rebalancer-methods.js:223` injects none), then
`syncOwnerDependenciesFromCoordinator` adopted the coordinator's node service
and dropped the private reference without shutting it down. Each abandoned
instance stayed subscribed to cache changes and kept rebuilding every node's
planning snapshot for nobody. Slice 1 measured 52 planning owners in the seed
process, 51 serving zero reads while doing 57.7k rebuilds, and 52x the
cache-change fan-out. No lifecycle end existed for the service at all.

## 3. Repair (now) — one owner through the existing composition owner

- **Composition owner unchanged:** `ControlPlaneSetup.create` still
  constructs exactly one service and hands it to the `RebalanceCoordinator`
  (the node-scoped container), `StorageAdmissionService` and
  `ReplicaDispatchService`. No module-global singleton, no registry.
- `UnifiedRebalancer` (`unified-rebalancer-lifecycle-base.js`) resolves the
  service from `options.controlPlaneReadinessService ||
  rebalanceCoordinator.controlPlaneReadinessService` **before** constructing;
  a private instance is built only when no container provides one
  (standalone/unit fixtures) and is then owned and shut down with the
  rebalancer (`ownsControlPlaneReadinessService`,
  `releaseOwnedControlPlaneReadinessService`, called from `shutdown()` in
  `unified-rebalancer-core.js`). Late adoption of a container service shuts
  the abandoned private one down. A consumer never re-syncs dependencies into
  the node-owned service (the container does that itself:
  `rebalance-coordinator-lifecycle.js:466`, fed first by the partition bundle
  at `partition-service-rebalancer-methods.js:84`).
- `ReplicaDispatchService` resolves the container's service before
  constructing one (`replica-dispatch-service-lifecycle.js`).
- **Explicit lifecycle:** new `control-plane-readiness-lifecycle.js` installs
  an idempotent `shutdown()` on the service (unsubscribe cache listener, stop
  the planning owner and queue timers, drop memoized snapshots, mark
  `isShutDown`); `subscribeToCacheChanges` refuses on a shut-down service so a
  late dependency sync can never resurrect it. `RebalanceCoordinator.shutdown`
  ends the service's lifecycle exactly once — the same node cleanup path the
  seed/join cleanup handlers already call.

## 4. Receipts — `test/control-plane/single-readiness-owner.receipt.test.js`

Built on the real composition path: `ControlPlaneSetup.create` (runtime stubs
only for SQL engine, CDC, transport, table policy, publication owner) -> real
coordinator -> N real `UnifiedRebalancer`s with exactly the option set the
partition service passes. 181 assertions green.

| receipt | witness |
| --- | --- |
| O1 | 50 partition rebalancers add zero cache listeners; one `ReadinessPlanningSnapshotOwner` across all of them |
| O2 | every `rebalancer.controlPlaneReadinessService === coordinator.controlPlaneReadinessService`, `ownsControlPlaneReadinessService === false`; dispatch service consumes the same instance |
| O3 | two identical compositions (one hosting 50 consumers, one hosting none, one virtual clock) return identical completed decision surfaces for seed, joiner, transitional membership, planning refresh after a source change, completed-snapshot reuse (same frozen object, also via the consumer) and live veto (lease/heartbeat aged out -> rebuilt negative decision); attaching consumers leaves all 11 node dependencies referentially untouched |
| O4 | one cache change -> exactly one `handleCacheChange` invocation process-wide, on the container's service (prototype spy through the real subscription) |
| O5 | `dispatchService.stop()` + `coordinator.shutdown()` -> `isShutDown`, listener off the cache, planning queue stopped, all node listeners gone; a late `syncOwnerDependencies` on the dead service does not resubscribe; re-composition constructs a new service once, one change -> one invocation on the new service only |
| O6 | 30 partition rebalancer create/shutdown cycles: same service identity, not shut down, same planning owner, listener count unchanged, completed snapshot object survives |
| ENGAGEMENT (unit) | 20 source writes with 50 partitions: 1 planning owner instance rebuilt (prototype spy over `reconcile`, reachable or not), 0 unused-owner rebuilds, 20 listener invocations (not 1,020) |
| BOUNDED-WORK (unit) | planning rebuilds and listener invocations with 50 partitions == with 1 |

**Red-on-revert (stash of `src/`):** O1, O4, O5, O6, ENGAGEMENT and
BOUNDED-WORK fail (67 assertions, incl. "one planning owner across 50
partitions", "zero rebuilds by unused owners", "20 source changes -> 20
invocations (not 1020)"); O3 stays green on both trees, as a pure semantics
receipt must.

## 5. ENGAGEMENT / BOUNDED-WORK on the formation fixture (live)

Same fixture and same measurement-only probe as Slice 1 (local docker
five-node formation, `LAGRANGE_LOOP_GAP_PROFILE=1 npm run demo:movielens`,
seed node-0, ~260 s window to the schema-admission timeout; probe applied,
run, reverted — no instrumentation in the tree). Run 2026-09-04T06:00Z on the
exact quest tree.

| seed process | slice-1 run 2 | slice-1 run 3 | **this quest** |
| --- | --- | --- | --- |
| planning owner instances | 52 | 52 | **1** |
| unused-owner rebuilds | 57,654 | 51,075 | **0** |
| process-wide planning rebuilds | 59,833 | 53,136 | **2,743** (-95%) |
| process-wide token captures (cache-change fan-out) | 231,200 | 160,374 | **4,637** (1x) |
| projection-evidence owner builds (A3) | 5,701 | 6,099 | **2,118** (nodeEvidence 3.9k -> 94, initial 260 -> 5) |
| owner#1 reads / reuse / deferred | 43,469 / 12,033 / 31,148 | 74,371 / 43,749 / 30,164 | 61,705 / 22,833 / 38,649 |
| owner#1 rebuilds (all CURRENT, publishStale 0) | 2,179 | 2,061 | 2,743 |
| floored-generation rotations | 310 | 243 | 317 (~1/s) |
| seed event-loop blocked % of wall | 31.8 | 35.3 | 35.4 |

Planning work now scales with authoritative changes (one owner, one rebuild
per changed record variant) and not with the number of hosted partitions.
The duplicated owners were not the seed's dominant CPU consumer (blocked %
unchanged) — that residual is the separately owned seed-starvation/
`storage_reservation_reconcile` work.

## 6. Post-fix Slice-1 liveness re-measurement (the branch decision)

| field | slice-1 (run 3) | after Quest 1 |
| --- | --- | --- |
| planning owners | 52 | 1 |
| cache-change callbacks | 52x per change | 1x per change |
| floored rotations | 243 | 317 |
| rebuild starts / completions | 2,061 / 2,061 (owner#1) | 2,743 / 2,743 |
| current snapshots (publishCurrent / publishStale) | 2,519 / 0 | 2,966 / 0 |
| reuse rejects (floored_generation_advanced) | 30,164 (99.9%) | 36,812 (99.8%); live_veto_changed 74 |
| refresh_pending contracts logged | 191 | 100 |
| node_ready_lease_incomplete (seed log) | 178 (run 2: 216) | 259 |
| settle waits (seed log) | 311 (run 2: 382) | 482 |
| rejected-record age | 1–5 s dominant, 5–30 s 2,749 | 1–5 s dominant (12,186), 5–30 s 4,292 |
| all seed variants simultaneously current | 3 of 59 retained publishes | 23 of 280 retained publishes (median 15 ms after a key change, then lost at the next ~1/s rotation); the five-node conjunction is not observable from the 60-event retained trace |
| deferral duty cycle (deferred / reads) | 41% | 63% |

**Outcome B — P1 remains.** With one owner, the floored-generation currency
still rotates ~1/s cluster-wide for every write to any of the six latch
tables while the owner refreshes ~30 records (5 nodes x 6 variants) one per
drain, so the settling gate's all-nodes conjunction keeps landing on
`node_ready_lease_incomplete`. The multiplier is closed; the currency defect
is next: **Quest 2 — planning generation granularity**, opened with a fresh
DEP-SCOPE mutation -> affected-node/variant map for the planning owner (not a
copy of A3's per-node evidence key).

## 7. Corpus and gates

- affected families (98 classified files: readiness service/store/planning,
  replica dispatch, unified rebalancer, coordinator, partition lifecycle,
  control-plane setup, cleanup handlers): 98/98 green, 5,623 assertions.
- change-scoped `npm test`: 100 files, 99 green; the one red is
  `formation-release-handoff-interaction-registry` asserting an empty
  `git diff HEAD -- src` (working-tree cleanliness), green once committed.
- `audit:static-gate` clean (file-size admission forced the lifecycle module
  extraction: participation base back to 797 lines), `audit:attempt-preflight`
  clean, `audit:guidelines` 0 new, `audit:impact-contracts` / owner audits /
  shard classification clean. `audit:architecture-slices` fails identically on
  unmodified main (INDEX.md marker block) — pre-existing, out of scope.
