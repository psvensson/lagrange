# Partition service constructor injection: notes (append-only)

Quest `partition-service-constructor-injection`, seal 4a91af611 (stream head
77e672a00), worktree `lagrange-nav-partition-20261108`, branch
`work/code-navigability-partition-20261108`. Design:
`partition-injection-design.md`.

## 2026-11-08 implementation

### Step 1: method bags -> explicit-context modules

- A codemod (espree + magic-string, scratchpad `partition-impl/codemod.mjs`)
  rewrote the 13 `PartitionService*Methods` classes and the 5
  `PARTITION_SERVICE_*_METHODS` object bags into top-level
  `function name(service, ...)` (this -> service outside nested plain
  functions; leading JSDoc kept); the `create*Methods` functions and bag
  constants are deleted; each file exports its functions. Pre-edits: two
  loop variables named `service` renamed `serviceRow`
  (learner-promotion census loops); the cadence bag's
  `getStagingReplayStats` (a pass-through to the staging owner) and
  `TRANSACTION_ENVELOPE_SERVICE_METHODS` (a pass-through to
  `readTransactionEnvelopeDiagnostics`) are called directly by the class.
  `getMetadataPublicationReadinessDimension` takes no service (it never read
  one).
- Widening, recorded (R16): the 5 frozen object bags and the envelope bag
  are not `create*Methods` bags, but they were the rest of the one
  `Object.assign(PartitionService.prototype, ...)`; leaving them would keep
  the prototype copy the statement's first clause removes. They were
  converted the same way.
- `PartitionService` (`partition-service-assembly.js`, 532 lines) declares
  158 generated delegators + the two direct calls: 161 own prototype names,
  the same set as at the seal (checked by loading both), no enumerable
  prototype member. The namespace alias `mergeReplication` collided with a
  delegator parameter of the same name (caught by durable-replay-cursor):
  renamed `mergeReplicationMethods`.
- `invokeStartMethod(service, START_METHOD.X, ...)` called the bag class's
  prototype method directly (bypassing instance overrides); it is now the
  direct module call `X(service, ...)`, which is the same function. The four
  `*ForService` wrappers equal the module functions and are deleted; their
  importers (split-mirror-queue, merge-replication, merge-resumption,
  durable-replay-cursor test) call the module function.
- Tests consuming a bag (13 files): a bag method `.call(context)` became the
  module function `fn(context, ...)` (proof-delivery-outcome,
  behaviour-changing-consumer-convergence, durable-voter-visibility) or
  `PartitionService.prototype.fn.call` (router-envelope); a context spread or
  `Object.create` from a bag became `partitionServiceContext({...})`
  (`test/helpers/partition-service-fixture.js`): the production method
  surface over the test's own state, a derived object, the caller's object
  never changed.

### Step 2: admission stores

- `RETIREMENTS_DEFERRED` -> the partition's `deferredRetirements` Map,
  created at construction by `initializePartitionAdmissionState`
  (raft-membership-administration owns it; core-base calls it; the fixture
  calls the same producer). Keys `replicaIdentity ?? peerAddress`, written
  and cleared at the same points (`trackRetirement`, the retiring refusal,
  `takeDeferredRetirements`).
- `ADMISSIONS_IN_FLIGHT` / `ADMISSIONS_DEFERRED` -> `{inFlight, deferred}`
  (`createGroupAdmissionLiveness`), the group owner's `groupAdmissionLiveness`
  field, one record per port: replaced in the same synchronous turn as
  `this.raft = port` (partition raft-init-base; message group
  `openMessageGroupConsensusPort`), created at construction for owners
  whose port a test assigns by hand. The record is an explicit argument of
  `admitGroupPeer`, `reserveAndAdmitGroupPeer`, `takeGroupAdmissionsInFlight`;
  `proposeInFlightAdmission` closes over it, so a queued proposal settles
  into its own port's record as before. The take keeps the closed-replica
  answer (no port: an empty set). Re-drive order unchanged (retirements
  first, then the admissions, in one queued microtask). No synchronous path
  became asynchronous.
- The formation simulator cohort keeps one record per member port
  (`admissionLiveness` map, set where the port is opened).

### Step 3: collaborators and the 69 probe sites

See the per-site table below.

#### Per-site table (69 partition sites at the seal -> 0)

Line numbers are the seal's (4a91af611). "Validated" = the collaborator's
member is in `PARTITION_SERVICE_COLLABORATOR_MEMBERS` and checked where it is
wired, before anything changes. "Producer" = every production
implementation, so the member-absent branch was dead.

| Site(s) | Change | Production wiring / named state |
| --- | --- | --- |
| core-base 205, 212 (`onInitializationStage`, `onSnapshotCatchupNeeded` options) | `resolveOptionalHook`: absent -> null, function -> hook, else typed refusal | replica handler, seed partitions phase pass functions; snapshot catch-up wiring sets the field later (a function) |
| core-base 315, 332; lifecycle 31 (cache on/offCacheChange) | direct | cache validated in the setter (constructor and setSystemTableCache both assign through it); unwired cache -> no subscription (as before) |
| core-base 429; lifecycle 47 (`releaseMetadataPublicationReadinessListener`) | truthiness | the field is null or the release function `attachTrafficReadinessListener` always answers |
| core-base 509 (`cdc.refreshAuthoritativeCacheRow`) | direct | CDC service validated in its setter; unwired -> false (as before) |
| core-base 669; learner-promotion 103, 191, 524; merge-state 204; split-state 121; metadata-delivery 65, 123; peer-cache 125, 382 (cache get/filter) | direct after the unwired check | SystemTableCache and ReadOnlySystemTableCache both have get/filter/getAll; unwired -> null / [] / false (as before) |
| raft-init-base 131, 135, 152, 155 (filter, else getAll) | filter only; getAll fallback deleted | every production cache has filter |
| metadata-delivery 227, 294 (`applySystemTableChange`, `isStaleForExistingRecord`) | `readCacheLocalWriteChannel(cache)` once | optional capability: SystemTableCache has both, the joiner's ReadOnlySystemTableCache neither (it IS wired into partitions: node-joining-delegate-bundles peekSystemTableCache -> query-system-state-phase applySystemCacheToPartitions -> setSystemTableCache); validated both-or-neither; unwired -> no projection / not strictly newer (as before) |
| leader-activation 65 (sink setter) | validated; null detaches | runtime-service-rebalancer-setup and service-installation-reconciler-setup pass owners with setLeader, or null. Before, a sink without setLeader silently detached; now refused (malformed only) |
| leader-activation 82; lifecycle 94, 101, 105; rebalancer-methods 81, 98, 153; split-accessor 731 (rebalancer / sink members) | direct | the rebalancer is the partition's own `new UnifiedRebalancer` (the only producer; has setLeader, shutdown, syncOwnerDependencies, setRebalanceCoordinator); the sink is validated. The `else` field-assignment branch and the `REBALANCER_SET_COORDINATOR_REQUIRED` assertion (only reachable without syncOwnerDependencies) are deleted with their message constant |
| rebalancer-methods 74, 207, 219; split-accessor 726, 770 (coordinator members) | direct | RebalanceCoordinator (control-plane-setup.js:355, the only producer), validated at construction and in rebindCoordinator |
| count-check 143; learner-promotion `!readinessService` | `readWiredReadinessService(service)`: the coordinator's (else SQL engine's) readiness service, or `PARTITION_SERVICE_COLLABORATOR_UNWIRED`; unwired -> no planning snapshot, no readiness, origin unstated (as before) | the node's ControlPlaneReadinessService (has getNodeReadinessSync); late-bound through the coordinator |
| proof 165 (`raft.probePeerProgress`); peer-cache 219, 317 (`raft.proposeConfChange`); raft-init-base 595 (`raft.campaign`) | presence of the port only | every port is built by `createRaftOperationPort`, which refuses a port missing any method; a closed replica (no port) -> skip (as before) |
| wake 187 (`replicaStateMachine.reconcileLocalOnlyServiceRowsNow`) | presence only | ReplicaStateMachine, validated at construction; unwired -> nothing to re-assert (as before) |
| merge-replication 275; split-accessor 284, 448 (workflow members) | presence only | ManagedMergeWorkflow / ManagedSplitWorkflow, the SQL engine's only producers (sql-query-engine-instance-initializer, entrypoint-runtime-admin-composition); unwired -> STATE_REQUIRED (as before) |
| cdc-stream 284 (`splitManager.requestEvaluation`) | presence only | PartitionSplitMergeManager (the only producer) |
| merge-replication 358, 361; split-accessor 371, 374 (statement iterate/all) | `.iterate()` | the snapshot handle is better-sqlite3 (`openSplitSnapshotDatabase`: a read-only Database or the partition's own db), whose statements stream |
| cdc-stream 227 (`promise.finally`) | guard deleted | every caller passes a promise (async generateCDCEvent().catch, async driveCdcObligations, async flushCdcAcknowledgements) |
| lifecycle 134 (`pendingRequestTracker.getStats`) | direct | the constructor's PendingRequestTracker, never reassigned |
| mutation-helpers 38, 40, 47, 49, 66, 92 (gateway / owner members) | gateway probes deleted; `hasAuthoritativeReadOwner` = CDC service or SQL engine wired | the partition's gateway is always the ControlPlaneSystemTableGateway core-base constructs; the CDC service is validated (executeAuthoritativeSystemTableRead); the engine is an SQLQueryEngine (executeQuery) |
| row-owner 82, 93 (`service.isLeaderReplica`, `getRole`) | called on a given service; absent service -> no role | the services handed to the row owner are PartitionService instances (seed registration, partition-service-activation) |
| row-owner 169, 268, 286, 345, 353 (`now`, writer, lifecycle owner members) | validated once in the row owner constructor; presence checks kept as the named refusals (INSERT_REQUIRED, UPDATE_REQUIRED, LIFECYCLE_OWNER_REQUIRED) | ControlPlaneSystemTableGateway (replica handler) and the bootstrap writers; ReplicaStateMachine |
| table-bootstrap 306 (`ensureIndicesTableColumns`) | direct | the only production caller is PartitionService (raft-init-base), which has it |
| (not counted) self-method optional calls `isSoloReplicaGroup?.()`, `clearLocalCanonicalLeaderClaimOnTeardown?.()`, `enforceLeaderDurabilityFitness?.()`, `runSnapshotCadenceTick?.()` | plain calls | PartitionService methods |

### Step 3b: test fakes routed through the one fixture

`test/helpers/partition-service-fixture.js` is the one version of every
partition collaborator fake: `partitionCollaboratorFake(collaborator, fake)`
completes a partial fake (a derived object; the caller's fake never
mutated, its own members bound to it) with the answer the partition gave
when the member was absent (get -> null; filter -> the fake's getAll rows
filtered, else none, as the deleted getCachedSystemTableRows fallback did;
getAll -> none; on/offCacheChange -> no subscription; refreshAuthoritative
CacheRow -> false; executeAuthoritativeSystemTableRead -> unapplied; the
coordinator's sync/initialize/shutdown -> nothing; reconcileLocalOnly
ServiceRowsNow -> nothing; a writer's insert/update -> unapplied);
`partitionCollaboratorOptions(options)` does it for construction options
(PartitionService, PartitionServiceRowOwner, activatePartitionServiceRows);
`partitionServiceContext(fields)` is a hand-built partition (production
prototype + the admission stores); `authoritativeSystemTableRead(store)`
answers an authoritative point read from a durable store a test states.
73 test files failed after step 3 (all on partial fakes); all pass after
the sweep (construction-only edits). Helper constructions routed through
the fixture: partition-service-test-support (ControllablePartitionService),
participant/ release / restart / admitted-group / coordinator-group /
committed-membership / startup-cleanup / unknown-outcome / dt6 /
replication-identity / minimal-deployment fixtures.
`test/partition/partition-rebalancer-collaborator-mocks.js` completes the
rebalancer test mocks once for the three partition-rebalancer suites.

#### Tests whose expectation changed, and why

- `test/partition/partition-service.test.js` "flushes partition leader
  update ...": expected `whereClause` `{partition_id}` ->
  `{partition_id, updated_at: 1}`. The unguarded write held only because the
  CDC fake lacked `executeAuthoritativeSystemTableRead`, which made
  `hasAuthoritativeReadOwner` answer unsupported; every production
  CDCIntegrationService has it, so a leader-owner write is guarded by the
  observed durable row (pinned by test 14 of the same file). The test now
  states the durable row.
- `test/partition/partition-service-size-split-transport.test.js` "single-
  replica initialization fails closed without raft campaign()": the port
  without `campaign` is now built through `createRaftOperationPort`, the
  one port constructor, which refuses it (`missing Raft operation:
  campaign`); the partition never holds such a port, so its own probe and
  the `raft.campaign` wording of SINGLE_REPLICA_RAFT_OWNER_REQUIRED went
  (now "requires its raft operation port"). Same journey: initialization
  fails closed.
- Source-grammar witnesses re-pointed to the explicit-context spelling,
  same property: partition-activation-handler-boundary (shutdown retires
  the handler in the lane before closing the store: `function
  shutdown(service)`, `(service)`), leadership-transfer-single-path (the one
  issuer call is the assembly delegator), replication-policy-structural-
  census (`service.replicaIds` is an identity-owner marker like
  `this.replicaIds`; the owner set grows from 12 to 18 files, all 12 HEAD
  owners included: stricter).
- Settling flushes: child-partition-leader-propagation test 3 and four
  role-metadata-publication tests drive the queued leader/role flush with a
  bounded loop, because the now-guarded write confirms against the durable
  row asynchronously (the production path).

### Mutation by mechanism (each break, the witness that fails)

All in `test/partition/partition-service-construction.test.js`:

| Mechanism broken | Witness failing |
| --- | --- |
| cache setter validation removed | "malformed collaborator refused at construction", "every later wiring validates" |
| rebindCoordinator validation removed | "every later wiring validates" |
| local-write channel both-or-neither removed | "every later wiring validates" |
| unwired readiness answers null | "an unwired readiness service reads the named state" |
| per-port record not replaced at open | "each port the partition opens gets its own admission record" |
| queued settlement written to a fresh record | "a queued admission settles into the record of the port it was proposed on" |
| retirements in one shared module Map | "the partition re-drives its own deferred retirements and admissions" |
| hook validation removed | "malformed collaborator refused at construction", "the row owner validates" |
| a bag copied onto the prototype again | "the prototype is declared, never copied" (no enumerable member; 161 names) |

### Checkers

- Navigability baselines tightened one-way for the four rows this quest
  moved: owner_port_feature_detection 2020 -> 1951 (the seal tree already
  allowed 2020 of 2124), identity_keyed_module_state 87 -> 84,
  prototype_copy_bags 59 -> 47, typeof_dual_paths 596 -> 583. The other
  hints (inheritance 65 -> 58, two_source 1789 -> 1785, alias_exports
  40 -> 38) are present at the seal and belong to other quests; untouched.
- Test duplication baseline 24259 -> 24254 on the hint.

### R17 findings (outside scope, routed)

- `src/partition/partition-cdc-obligation-delivery.js` (`trackOnOwner`) and
  `src/partition/partition-cdc-delivery.js` (`driveCdcObligations`) still
  probe `owner.trackPendingCDCEvent`; the owner is always a PartitionService.
  Owner: the CDC obligation lane (outside the pilot files).
- `src/bootstrap/shared/partition-service-activation.js`
  `resolveReplicaUnifiedAddress` probes `service.getUnifiedAddress`, and
  `runtime-service-rebalancer-setup.js` / `service-installation-
  reconciler-setup.js` probe `setRebalancerLeadershipSink` on what are
  always PartitionService instances. Owner: bootstrap activation.
- `src/partition/partition-service-raft-peer-cache-reconciliation.js`
  mutates `partitionService.replicaIds` but is not an identity owner in
  `test/bootstrap/replication-policy-structural-census.js`. Owner: the
  replication-policy census.
- The inheritance chain (7 deep) is the `inheritance_depth_over_two` row of
  another quest.

## 2026-11-09 close-out (successor)

### Close-out

- Inventory: 111 modified + 6 untracked at hand-over, all predecessor work; every src change maps to the step tables (normalized this->service diff of the 20 bag files leaves only bag/export boilerplate and the tabled probe sites). No generated noise. No foreign changes appeared.
- Found at close-out, fixed (gates exposed by this->service):
  - literal gate: cadence 'failed' / log text -> `CADENCE_STATUS_FAILED` exported by partition-snapshot-cadence.js (its owner), `PARTITION_SERVICE_LOG_MSG.SNAPSHOT_CADENCE_FAILED`.
  - decision gate (raw null slot writes in lifecycle shutdown and the hold-sweep stop): core-base methods `clearMetadataPublicationReadinessSlots`, `clearStartupFailure`, `clearPreparedStateHoldTimer` (readiness-quest precedent; same writes, same order; PartitionService own prototype names unchanged at 161).
  - file-size ratchet (test 23/21): moved the three owner-row write-guard tests to test/partition/partition-service-owner-row-write-guard.test.js and the three collaborator-propagation tests to test/partition/partition-service-collaborator-propagation.test.js (shared setup folded into one helper; duplication back to 648/24254 exactly).
  - candidate-caused reds of untouched partial fakes: test/partition/partition-participant-transaction-topology.test.js and test/integration/cross-node-replica-placement.integration.test.js now complete their fakes through the fixture; both green locally.
- Cheap checks (final tree before the two fake fixes): pre-commit (LAGRANGE_SOLVER_LANDING=1) 0; test:duplication 0; audit:guideline:navigability 0; audit:file-size 0 (test 21/21); test:metadata:refresh 0 (shards staged); eslint 0; node --check 0.
- Probe: 1 (prototype_copy_bags_partition_service 0, identity_keyed_module_state_admission_path 0, owner_port_feature_detection_pilot_owners 2 = replica-operation-repository-visibility-methods.js 383/394, fix quest).
- Local cone (341 files: test/partition, test/raft/raft-rs-backend, every touched test and importers of touched helpers): all green except the topology file (candidate, fixed, 12/12).
- Lab: adam-laptop, snapshot refs/wip/nav-partition-2240 (942f78766), base 77e672a00, changed/all: 2131 files, 2111 pass, 20 fail. 2 candidate (fixed above); 18 classified below. Base lane runs (bootstrap, exclusive at 77e672a00 on adam-laptop) were still running at hand-back: logs scratchpad closeout/labbase-*.log.

| file | class | evidence |
| --- | --- | --- |
| partition/partition-participant-transaction-topology | CANDIDATE, fixed | collaborator refusal of a partial cache fake |
| integration/cross-node-replica-placement | CANDIDATE, fixed | collaborator refusal of the lifecycle CDC fake |
| minimal-deployment-call-cell-invocation-live, minimal-deployment-runtime-access-policy-live-validation | BASE | same ControlPlaneReadinessService messageRouter refusal locally at base and candidate (readiness quest's, R17) |
| message-group-native-provisional-route, single-path-partition-cutover, cdc-group-propagation-foreground-boundary, bootstrap-epoch-manager-lifecycle, cdc-source-occurrence-delivery, node-bootstrap-consistency, seed-release-failure-custody | HOST/TIMING | green locally at candidate and base with equal durations (7.6/5.8, 14.1/14.5, 1.8/1.8, 12.5/14.1, 5.7/5.6, 24.8/24.4, 42.3/45.5 s); seed-release budget / timeout signatures |
| create-table-partition-provisioning, critical-replica-placement-causal-trace, leader-metadata-validation, managed-split-admission-reliability, multi-node-raft-replication, raft-leader-election, seed-node-bootstrap, single-node-default-replica-count-writes, three-node-seed-rebalance | known base-red family | seed-release budget expiry signature; base lane run pending |

### Verifier's model

Re-derive independently: (1) the collaborator census, every production wiring site of systemTableCache (incl. the joiner's ReadOnlySystemTableCache), CDC service, coordinator, leadership sink, replica state machine, hooks, row-owner writer; (2) each deleted probe's absent branch was dead or is kept under a named state (UNWIRED, typed refusals); note hasAuthoritativeReadOwner now answers supported whenever a CDC service or engine is wired; (3) admission stores re-drive identically: same keys (replicaIdentity ?? peerAddress), same write/clear points, retirements before admissions in one microtask, per-port record replaced in the same synchronous turn as `raft = port`, a queued settlement closes over its own record; (4) raft-rs-group-membership-admission.js: no synchronous path became asynchronous; (5) fixture one-version rule: fakes are completed as derived objects, never mutated, own members bound; owner clocks pass through; (6) the mutation table. Judge explicitly against constraint behaviour-unchanged ("construction-only edits"): partition-service.test whereClause gained updated_at, the campaign wording changed, and role-metadata tests now state durable rows and settle flushes, because the fixture's neutral executeAuthoritativeSystemTableRead answers unapplied rather than the old "unsupported" path.

### Handover

Not committed; staged index is the candidate. Hash: see the report (`git diff --cached | sha256sum`).

## 2026-11-09 round 2

### Round 2 repair (B1)

Verdict round 1 (REJECT, B1): the production read-only cache
(`createReadOnlyCache`, src/cache/read-only-system-table-cache.js:268, a
Proxy whose get trap logs and throws for `CACHE_READ_ONLY.BLOCKED_METHODS`,
applySystemTableChange among them) crashed the both-or-neither check with
its own untyped Error, while the comment, design and these notes said the
joiner wires it into partitions. Lead ruling (option b): the read-only cache
is not a partition collaborator.

Repair:

- `src/partition/partition-service-collaborators.js`: members are read
  through `readMemberSafely` (try around `value[member]`); a read that throws
  counts as missing, so the answer is `PARTITION_SERVICE_COLLABORATOR_INVALID`
  naming the collaborator. The local write channel is no longer optional:
  applySystemTableChange and isStaleForExistingRecord join the five required
  cache members. Deleted: `CACHE_LOCAL_WRITE_CHANNEL`,
  `EXPECT_LOCAL_WRITE_CHANNEL`, `hasLocalWriteChannel`,
  `assertCacheLocalWriteChannel`, `readCacheLocalWriteChannel` (one version).
  The census comment states the read-only cache is not wired into partitions.
- `src/partition/partition-service-metadata-delivery-methods.js`: the leader
  projection and the successor-staleness read call the wired cache directly;
  an unwired cache (null, the late-bound state) still answers no projection /
  not strictly newer, exactly as before.
- `src/partition/partition-service-split-accessor-base.js`: the
  `setSystemTableCache` JSDoc said "Read-only system table cache"; now "the
  node's system table cache".
- `test/helpers/partition-service-fixture.js`: the cache completion adds the
  write channel's neutral answers (applySystemTableChange applies nothing,
  isStaleForExistingRecord answers false).
- `test/partition/partition-service-construction.test.js`: witness 3 also
  refuses an unproxied `ReadOnlySystemTableCache` (no write channel);
  witness 4 is now "the production read-only cache is not a partition
  collaborator: typed refusal": `createReadOnlyCache(new SystemTableCache())`
  is refused at construction and at `setSystemTableCache`, and the wired
  cache is untouched.
- Design (`partition-injection-design.md`): the collaborator row, the
  validation paragraph and the unwired-state paragraph are corrected.

#### Census correction (N1; supersedes the cache rows above)

The per-site row "metadata-delivery 227, 294" in Step 3 and the mutation row
"local-write channel both-or-neither removed" are superseded: the read-only
cache is NOT wired into partitions and there is no optional channel. Every
production site that hands a partition a cache hands it the writable
SystemTableCache, which has both channel members (system-table-cache.js
`applySystemTableChange` 274, `isStaleForExistingRecord` 682):

| Site | Cache |
| --- | --- |
| bootstrap-service-replica-registration-methods.js 137/153 `new PartitionService` | `this.getSystemTableCache()` -> peekSystemTableCache: `this.systemTableCache` (set by seed-cache-hydration-phase.js 277 from `d.getSystemTableCache()`) or a message group's `systemTableCache` (message-group-service-state.js 300 `nodeService.getSystemTableCache()`) |
| seed-partitions-phase.js 256/281 `new PartitionService` | `d.getSystemTableCache()` (the same bootstrap getter) |
| seed-cache-hydration-phase.js 304 `partition.systemTableCache =` (through the core-base setter) | `d.getSystemTableCache()` (line 150) |
| node-joining-publication-activation.js 241/253 `new PartitionService` (replica handler and durable-rejoin restore) | `NodeService.getInstance().getSystemTableCache()` |
| node-joining-owner-construction.js 581-583 applySystemCacheToPartitions -> `setSystemTableCache` | query-system-state-phase.js 142/210: `nodeService.getSystemTableCache()` |

`NodeService.getSystemTableCache()` is `ensureNodeLocalSystemTableCache`
(node-runtime-local-authorities.js 113-126): `new SystemTableCache(...)`;
the read-only Proxy it also builds is stored as `_readOnlyCache` and reaches
partitions nowhere. `NodeService.setSystemCacheProxy` has no src caller. The
joiner delegate bundle's `peekSystemTableCache` (node-joining-delegate-
bundles.js 352, which prefers the read-only cache) feeds only the bundle's
`systemTableCache` getter (line 35), not any partition wiring; the round-1
claim that applySystemCacheToPartitions receives it was false.

#### Mutation (B1)

| Mechanism broken | Witness failing |
| --- | --- |
| member probe made unsafe again (`value[member]` without `readMemberSafely`) | "the production read-only cache is not a partition collaborator: typed refusal" (not ok 4: the Proxy's own "Cache write violation" Error escapes, not the typed refusal; 8/9 pass) |

Restored: 9/9.

#### N2: propagation writes land on the derived coordinator (documented)

The fixture completes a partial fake as `Object.create(fake)` and never
writes the fake. The partition's own propagation writes (the core-base
setters write systemTableCache, cdcIntegrationService, sqlQueryEngine,
tablePolicyService ... onto `this.rebalanceCoordinator`) therefore land on
the derived completion, not on the caller's original object. A test that
read a propagated field back from its original fake, or a fake method that
reads `this.<field>` while bound to the original, would diverge from HEAD.
No current test does (round-1 item 5: 7 files write there, all read back
through the derived object). Not fixed: keeping the writes on the caller's
object means a set-forwarding Proxy over every completed fake, a change to
the fixture's shape across 75 consumers, larger than this repair. Rule for
fake authors: read propagated fields through `partition.rebalanceCoordinator`
(or the completion the mock helper returns), never through the original.

#### N3: local timing noise (noted)

cdc-group-propagation-foreground-boundary's 3000 ms subtest budgets failed
once on the candidate under shared-machine load (load average ~8), green
twice after on both trees with equal durations; the first subtest of
partition-participant-transaction-topology took 24.9 s once cold and 1.8 s
on reruns. Neither reproduces; host timing, not the candidate.

#### Checks (round 2)

- Construction witness: 9/9 (`node --test test/partition/partition-service-construction.test.js`).
- Affected tests, local (thermal-gated, concurrency 4): 273 files = test/partition/*.test.js, every test importing the fixture or a fixture-consuming helper, and every test that constructs PartitionService, calls setSystemTableCache or reaches PartitionService.prototype. 9477 tests, 9463 pass, 1 fail: test/integration/failure-scenarios.integration.test.js, killed by SIGALRM with no subtest output; it fails identically (SIGALRM, 0/1) on the round-1 candidate and on the seal HEAD 4a91af611 in a throwaway worktree, so it is base-red, not this repair.
- eslint on the five touched files: 0.
- `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`: 0 (complexity lines informational, identical to round 1; handleCanonicalLeaderRowCacheChange 14 as before).
- `npm run -s test:duplication`: 0 (src+scripts 42/1331, test 648/24254, at baseline).
- `npm run -s audit:guideline:navigability`: 0; hints unchanged from round 1 (inheritance 65->58, two_source 1789->1785, alias 40->38: other quests).
- `npm run -s test:metadata:refresh`: 0 (shards restaged).
- Probe rows: prototype_copy_bags_partition_service 0, identity_keyed_module_state_admission_path 0, owner_port_feature_detection_pilot_owners 2 (replica-operation-repository-visibility-methods.js, the fix quest's; unchanged).
- No lab (src change local to the check; the lead decides).

#### Verifier's model (round 2 delta)

Verify only the delta against the round-1 candidate (round-1 items 2-9
stand). (1) B1: `createReadOnlyCache(new SystemTableCache())` handed to
`new PartitionService({systemTableCache})` or `setSystemTableCache` answers
an Error with code PARTITION_SERVICE_COLLABORATOR_INVALID and
collaborator 'systemTableCache', never the Proxy's Error; any collaborator
whose member read throws (try a throwing getter on each of the five
collaborator kinds and the row owner's writer) gets the typed refusal.
(2) The collapse is one version: no optional write channel remains in src
(grep readCacheLocalWriteChannel / CACHE_LOCAL_WRITE_CHANNEL: none), and by
your own census every production cache wired into a partition (the five
sites in the N1 table, plus any you find) is the writable SystemTableCache
with both members, so no production wiring becomes a refusal. (3) The
metadata-delivery change is behaviour-preserving: for a wired production
cache the two calls are the ones HEAD made; for an unwired cache (null) the
answers are HEAD's (false / not strictly newer). (4) The fixture's two new
neutral answers are the "absent member" answers HEAD gave (no projection,
not stale) as seen by the consumers; note the one shape difference:
applyLocalCanonicalLeaderProjection now returns true after a no-op apply
for a completed fake, after which applyLocalCanonicalLeaderObservation
compares the fake's get(); judge whether any test's expectation depends on
it (the affected-test run says none fail). (5) Mutation: revert
`readMemberSafely` to `value[member]` -> witness 4 fails. (6) Comments,
design and notes no longer claim a partition wires the read-only cache.
