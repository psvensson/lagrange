# Partition service constructor injection: design

Quest `partition-service-constructor-injection`, sealed at 77e672a00 (seal
commit 4a91af611), worktree `lagrange-nav-partition-20261108`. Follows the
landed readiness quest (`readiness-injection-design.md`,
`readiness-injection-notes.md`) and its 2026-11-08 rulings by analogy.

## Today (measured at 4a91af611, not guessed)

- `PartitionService` (`partition-service-assembly.js`) extends
  `PartitionServiceSplitAccessorBase`, a seven-deep chain (CoreBase ->
  RaftInit -> SchemaMigration -> EntryApply -> WriteMetrics -> CdcStream ->
  SplitAccessor). The chain is the `inheritance_depth_over_two` row of
  another quest and is not changed here.
- 161 own prototype names (160 methods + constructor), all installed by one
  `Object.assign(PartitionService.prototype, ...)` of 19 bags:
  - 13 `create*Methods()` bags, each a class `PartitionService*Methods` whose
    prototype is copied by an `Object.getOwnPropertyNames(X.prototype)` loop
    (12 loops; `createPartitionServiceLeadershipTransferMethods` names its
    one method by hand; the count-check bag is composed into the promotion
    bag). 135 methods.
  - 5 frozen object bags `PARTITION_SERVICE_*_METHODS` (participant
    transaction cadence, removal serving, remote query, hydration image,
    leader activation): 24 methods, and `TRANSACTION_ENVELOPE_SERVICE_METHODS`
    (1).
  - No name collides between bags or with the base chain (checked by
    loading the prototypes), there are no accessors, statics, generators or
    `arguments` uses in the bags, so the installation order carries no
    precedence.
- Construction sites: production `bootstrap-service-replica-registration-methods.js:153`,
  `phases/seed-partitions-phase.js:256`, `node-joining-publication-activation.js:253`;
  207 test constructions in 81 files. 13 test files consume a bag directly
  (spread a bag into a hand context, `Object.create` a bag, or `.call` one
  bag method on a context).
- Admission stores: `RETIREMENTS_DEFERRED` (WeakMap keyed by the partition
  service, lifetime = the replica), `ADMISSIONS_IN_FLIGHT` and
  `ADMISSIONS_DEFERRED` (WeakMaps keyed by the raft-rs operation port,
  lifetime = one port; a reopened replica has a new port and empty sets; a
  queued proposal settles into the sets of the port it was proposed on).
  Re-driven by `redriveAdmissionsOnMembershipChange` (partition) and
  `redriveMessageGroupAdmissions` (message group) on CONF_CHANGE_APPLIED
  and LEADER, and by the formation simulator's cohort.
- `owner_port_feature_detection_pilot_owners` = 71: 69 in partition-service
  files (this quest), 2 in `replica-operation-repository-visibility-methods.js`
  (fix quest `priority-recovery-owner-read-snapshot-await`, not touched).

## Shape after

- Each of the 18 bag files is an explicit-context module: every former
  method is `function name(service, ...params)` with `this` replaced by
  `service` (nested plain functions untouched), internal calls still
  dispatch through `service.name(...)` so an instance-own override still
  takes effect. No file is renamed (no new `*-methods.js` fragment is
  created; the existing names are inherited debt). The `create*Methods`
  functions and the bag constants are deleted.
- `PartitionService` declares one delegator per former bag method
  (`name(a, b) { return module.name(this, a, b); }`, explicit parameters) and
  calls the two pass-through owners directly (`getStagingReplayStats`,
  `readTransactionEnvelopeDiagnostics`). Same 161 prototype names. Nothing
  is copied onto the prototype.
- `invokeStartMethod` (it called a bag class's prototype method directly,
  bypassing instance overrides) becomes the direct module call; its four
  `*ForService` wrappers were the module functions themselves and are
  deleted, their importers call the module function.
- Constructor-held vs explicit-context: every responsibility stays an
  explicit-context module. No bag holds its own state (state lives on the
  service and is shared across modules), so a constructor-held collaborator
  object would only re-wrap the service; the explicit-context form is the
  one code-style.md prescribes for extractions.

## Collaborators (validated at every wiring)

`src/partition/partition-service-collaborators.js` owns the interface of
every collaborator the partition used to feature-detect, validated where it
is wired, before anything changes; a malformed one is an `Error` with code
`PARTITION_SERVICE_COLLABORATOR_INVALID` and `collaborator`. Members are read
so that the check itself cannot throw: a member whose read throws (a Proxy
get trap, a throwing accessor) counts as missing, so the answer is the typed
refusal, never the collaborator's own error.

| Collaborator | Wired at | Members | Production implementation(s) |
| --- | --- | --- | --- |
| `systemTableCache` | constructor, `setSystemTableCache` and the seed hydration assignment (all through the core-base setter) | get, filter, getAll, onCacheChange, offCacheChange, applySystemTableChange, isStaleForExistingRecord | SystemTableCache (writable) only, at every site; the joiner too: `query-system-state-phase.js` applySystemCacheToPartitions receives `nodeService.getSystemTableCache()`. The read-only cache (`createReadOnlyCache`, a Proxy that throws on the blocked write members) is not a partition collaborator: no production site wires it into a partition, and it is refused with the typed refusal |
| `cdcIntegrationService` | constructor and `setCdcIntegrationService` (setter) | refreshAuthoritativeCacheRow, executeAuthoritativeSystemTableRead | CDCIntegrationService |
| `rebalanceCoordinator` | constructor and `rebindCoordinator` | syncOwnerDependencies, initialize, shutdown | RebalanceCoordinator (`control-plane-setup.js:355`, the only producer) |
| `rebalancerLeadershipSink` | `setRebalancerLeadershipSink` | setLeader | the runtime-service and installation-reconciler rebalancer owners |
| `replicaStateMachine` | constructor | reconcileLocalOnlyServiceRowsNow | ReplicaStateMachine |
| `onInitializationStage`, `onSnapshotCatchupNeeded` | constructor | a function | replica handler, seed partitions phase, snapshot catch-up wiring |
| row owner: `systemTableWriter`, `replicaStateMachine`, `now` | `PartitionServiceRowOwner` constructor | insertSystemTableRow + updateSystemTableRow; activateRegisteredReplica; a function | ControlPlaneSystemTableGateway; ReplicaStateMachine |

Collaborators the partition builds or that are validated by their own
producer, so their member probes were dead: the raft-rs operation port
(`createRaftOperationPort` refuses a port without any of its methods), the
rebalancer (`new UnifiedRebalancer` in `initializeRebalancer`, the only
producer), the PendingRequestTracker and the ControlPlaneSystemTableGateway
(constructor), the better-sqlite3 snapshot statement
(`openSplitSnapshotDatabase`), the SQL engine's split/merge workflows and
split-merge manager (ManagedSplitWorkflow, ManagedMergeWorkflow,
PartitionSplitMergeManager, the only producers).

Named unwired state: `PARTITION_SERVICE_COLLABORATOR_UNWIRED`, answered by
`readWiredReadinessService(service)` (the late-bound coordinator's, else the
SQL engine's readiness service).
Slots read by presence elsewhere (`systemTableCache`, `raft`,
`rebalanceCoordinator`, `cdcIntegrationService`) stay null when unwired.

## Admission stores

- `deferredRetirements` (Map, by replica identity else address): a named
  field of the partition, created at construction by
  `initializePartitionAdmissionState` (same lifetime as the WeakMap entry
  keyed by the service).
- `groupAdmissionLiveness` ({inFlight, deferred}, `createGroupAdmissionLiveness`
  in `raft-rs-group-membership-admission.js`): a named field of each group
  owner (partition, message group), replaced in the same synchronous turn
  as each port the owner opens (one record per port, as the WeakMap keyed
  by the port), and passed explicitly to `admitGroupPeer`,
  `reserveAndAdmitGroupPeer` and `takeGroupAdmissionsInFlight`. A queued
  proposal's settlement closes over the record it was proposed under, so a
  late settlement of a closed port never writes a later port's record. The
  take still answers an empty set for a closed replica (no port). No
  synchronous path became asynchronous (`no-raft-timing-change`).
- The formation simulator's cohort holds one record per member port.

## Step order (each leaves the partition tests green)

1. Codemod the 18 bags to explicit-context modules; delegators on the class;
   retarget the 13 bag-consuming test files to the module function or the
   one fixture (`test/helpers/partition-service-fixture.js`).
2. Admission stores to owner fields; hand-built partition contexts in tests
   through the fixture (which runs the same `initializePartitionAdmissionState`).
3. Collaborator validation and the 69 probe sites; test fakes completed to
   the production interface.
4. Witnesses, checkers, lab.

## Witnesses

New `test/partition/partition-service-construction.test.js`: prototype
surface (no bag export, the same 161 names, no copied enumerable
prototype members); malformed collaborator refused at construction and at
each later wiring with state untouched; unwired readiness and local-write
channel read the named state; per-port admission record replaced on port
open and a late settlement written to its own record; retirements and
admissions re-driven identically.
