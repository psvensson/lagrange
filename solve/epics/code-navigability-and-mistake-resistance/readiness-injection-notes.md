# Readiness service constructor injection: notes (append-only)

Quest `readiness-service-constructor-injection`, base 1ad04d21a, worktree
`lagrange-nav-readiness-20261108`. Continues the design note's "Outcome at
this sitting (2026-11-08)".

## 2026-11-08 resume after the 10:55 reboot

### Done

- Step 3 (owner ruling) finished. The four private readiness constructions
  (RebalanceCoordinator, UnifiedRebalancer, ReplicaDispatchService,
  StorageAdmissionService) are deleted (src done by the predecessor); each
  owner takes `controlPlaneReadinessService` through
  `requireControlPlaneReadinessService` and refuses construction with
  `CONTROL_PLANE_READINESS_SERVICE_MISSING` otherwise. Production wiring
  passes the node service by name at every construction site
  (control-plane-setup, partition-service-rebalancer-methods,
  message-group-service-rebalancer-runtime-methods,
  runtime-service-rebalancer-setup). Census: `new <Owner>(` in src has no
  site without the named service.
- Test construction sites swept through the one fixture
  (`test/helpers/readiness-service-fixture.js`): new
  `withNodeReadinessService(owner, options)` / `nodeReadinessServiceFor`
  hand the owner the node service the way the node composition does (the
  coordinator's service when the test's coordinator holds one, else the real
  service built from the owner's own collaborators, per owner the same
  inputs the deleted private construction used). 120 construction sites in
  ~50 test files; coordinator mocks handed to PartitionService /
  MessageGroupService / UnifiedRebalancer now carry
  `createReadinessServiceForTest()`.
- Collaborator validation extended (validate-once): `setTimeoutFn` and
  `clearTimeoutFn` are optional collaborators checked in
  `assertReadinessServiceCollaborators`; the construction-time `typeof`
  probes on `setTimeoutFn`, `clearTimeoutFn`, `now` and
  `getLocalClusterIncarnationFence` are replaced by `??` on validated
  options; `getLocalClusterIncarnationFence(service)` reads the validated
  optional fence by presence.
- Self-method probes removed (the one class always has these members):
  `shouldAllowTransportBackedRecoveryGrace`, `readCurrentPlanningProjectionIdentity`,
  `readPlanningProjectionSourceGeneration`, `readPlanningProjectionMemoIdentity`
  (x3), `readMembershipPlanningDerivationVersionKey`, `service.now` (x3),
  `getLocalQueryTransportEvidence`.
- Deleted importers of `control-plane-readiness-publication-aware.js`: none
  remain in src, test, scripts, docs, architecture/contracts,
  test/shards/impact-contracts.json, test/manifests. One historical mention
  stays in `solve/specs/membership-lifecycle-placement-hard-cutover/readiness-and-reconcile-simplification-inventory.md`
  (a dated inventory, not an importer).
- Decision-boundary gate: the codemod's `this.` -> `service.` exposed three
  raw-null slot writes and renamed the inherited constructor's
  mixed-cache/SQL entry. Fixed at the owner: the two empty slots
  (`membershipPublicationDiagnosticsMemo`,
  `lastFormationReleaseHandoffAuthorityLogSignature`) are initialised in the
  class constructor and cleared through the class method
  `clearMembershipPublicationDiagnosticsMemo()`; the timing/timeout option
  normalisation is its own function `initializeReadinessTimingOptions`. No
  baseline entry added.
- Test duplication baseline tightened 24346 -> 24342 on the checker's hint.

### Tests whose expectation changed, and why

All because a missing collaborator became a construction refusal:

- `test/control-plane/canonical-readiness-consumption.test.js`: the three
  subtests that built ReplicaDispatchService / UnifiedRebalancer /
  RebalanceCoordinator without a readiness service and expected the private
  default service to answer from the cache are now refusal witnesses
  (`refuses construction without readiness service`, code
  `SERVICE_MISSING`, collaborator `controlPlaneReadinessService`).
- `test/control-plane/single-readiness-owner.receipt.test.js`: the
  `rebalancer.ownsControlPlaneReadinessService === false` assertion is
  removed (the field died with the private construction); the identity
  assertion `rebalancer.controlPlaneReadinessService === container's`
  stays. Its partition-rebalancer helper passes the coordinator's service
  by name, exactly as partition-service-rebalancer-methods does.
- `test/control-plane/control-plane-gateway-registry.test.js` (predecessor):
  null-gateway assertion replaced by the refusal witness.
- `test/control-plane/control-plane-readiness-service-construction.test.js`:
  new refusal cases for malformed `setTimeoutFn` / `clearTimeoutFn`.

Construction-only fixture edits (no expectation changed): mock-`this` hosts
built from prototype methods now state the collaborator state the tier
prototype gave them (`readPlanningProjectionMemoIdentity: () => null`,
`readMembershipPlanningDerivationVersionKey: () => null`, a fixed `now`,
`getLocalQueryTransportEvidence: () => null`) in cl-033-epoch-probe-node-scope,
cl-033-planning-projection-memo, cl-034-planning-snapshot-merge-memo,
readiness-planning-publication-version-key,
priority-recovery-projection-brand-short-circuit,
publication-snapshot-build-sync-section-attribution and
control-plane-readiness-service-test-support (store stub).

### Files touched outside the readiness owner and the four consumer owners

- `scripts/check-runtime-grammar-contracts.js` (predecessor: re-pointed at
  the implementing file) and its test.
- `scripts/check-duplication.js` (baseline tightened on hint).
- `src/bootstrap/shared/runtime-service-rebalancer-setup.js`,
  `src/message-group/message-group-service-rebalancer-runtime-methods.js`
  (pass the node service by name to UnifiedRebalancer).
- `src/control-plane/replica-dispatch-service-lifecycle.js` is the dispatch
  owner itself.
- Test files: the sweep above; `test/helpers/readiness-service-fixture.js`.

### Verified by

- Lab run 2 (lenovo-laptop, snapshot a87a3d9a9... superseded by later edits,
  base 1ad04d21a): 55 red files; every one classified. 48 were the
  construction sweep (all re-run locally green after the sweep, single file
  each). 7 are timing under lab parallel load and pass locally on the
  candidate: bootstrap/cdc-source-occurrence-delivery.integration,
  bootstrap/fresh-seed-activation.integration,
  bootstrap/seed-release-failure-custody (seed release budget 3000ms
  elapsed 3003ms), message-group-native-provisional-route (router message
  timeout), raft-rs-backend/single-path-partition-cutover (same seed
  release budget), rebalancer/replace-real-group-completion and
  -scheduling (subtest `timeout!`).
- Lab run 3 on the current candidate: see the next entry.
- Local: construction witness 23/23; pre-commit hook with
  LAGRANGE_SOLVER_LANDING=1 exit 0; check-fast-static ok;
  test:duplication ok; audit:file-size ok (source 25/26);
  audit:impact-contracts PASS; check-runtime-grammar-contracts 0 violations.

### Rows (read-only measure with the stream worktree's budget script)

- `inheritance_depth_over_two_readiness` = 0 (probe target met).
- `inheritance_depth_over_two` = 58, `prototype_copy_bags` = 59 (no growth),
  `two_source_fallback_reads` = 1785, `owner_port_feature_detection` = 2094.
- `owner_port_feature_detection_pilot_owners` = 139 (157 at resume); the
  readiness + rebalancer-consumer part 88 -> 70; the partition-service part
  (69) belongs to `partition-service-constructor-injection`.

### Remaining pilot sites (70) and what removing them needs

All are probes on late-bound or hand-faked collaborators. Removing them
without changing behaviour needs the ruling's late-bound machinery first
(`syncOwnerDependencies` validates each owner's interface when set, refuses
a second wiring with a different owner, and a read before wiring answers a
named unavailable state), plus a sweep of the test fakes of each owner
through the fixture. Not done at this sitting; nothing half-done in tree.

- membershipPublicationService (~26: publication-planning-resolution 7,
  startup-authority-health 7, publication-diagnostics 5,
  publication-planning-snapshot 1, ...): 80 test files hand fakes.
  Note: replacement is wired today (memo clears on owner replacement), so
  "second wiring refused" changes behaviour; needs an owner decision on
  whether replacement is a real production path.
- nodesOwner / servicesOwner (node-service-rows 5, service-node-methods 2,
  startup-authority-health 2).
- systemTableCache method probes (node-service-rows 7, service-node-methods 4,
  snapshot-store 4, lifecycle 1, participation-base 1): the cache is a
  required collaborator validated as an object; validating its interface
  refuses many minimal test caches.
- messageRouter (evidence-reasons 3, node-service-rows 2,
  formation-release 2, node-liveness 2), heartbeatService, cdcGroupPropagationService,
  storageAccountingService (2), nodeLifecycleStateMachine,
  authoritativeControlPlaneView / authoritativeNodeEvidenceReconciler,
  logger.
- `unified-rebalancer-available-nodes.js` (5): probes on the readiness
  service (`projectNodeLiveness`, `getStartupAuthoritySnapshotSync`,
  `getNodeReadinessSync`, `now` x2); hand-written fakes handed to the
  rebalancer lack them, and the absence path answers "not ready" / the
  rebalancer clock. Needs `partialReadinessFake` to carry the consumer
  contract with the answers the absence path gave, and every hand fake
  routed through it.
- `replica-operation-repository-visibility-methods.js` (3): the best-effort
  surface; owned by `priority-recovery-owner-read-snapshot-await` (R17,
  below), which collapses that alias family.

### R17 findings

- `priority-recovery-owner-read-snapshot-await` (class fix, recorded by the
  predecessor): the owner read consumes an unawaited async best-effort read.
- Late-bound owner validation (ruling) is not implemented: owner of the
  decision is the epic lead (whether owner replacement through
  `syncOwnerDependencies` is a production path to refuse).
- `src/rebalancer/storage-admission-service.js` `summarizeNodeReadinessRow`
  and `replica-dispatch-service-lifecycle.js`
  `subscribeToReadinessPlanningSnapshots` and the coordinator's
  `syncOwnerDependencies` call still probe methods of the (now required)
  readiness service; they fall under the same fake sweep.
- `test/helpers/readiness-service-fixture.js` `nodeReadinessServiceFor`
  substitutes a fresh `SystemTableCache` when an owner under test has none
  (the deleted private construction accepted a null cache); no witness
  changed on it.

### Impact-graph seal (lead note 2026-11-08)

- Lab run 1 (snapshot a87a3d9a9, committed seal from 1ad04d21a) died at
  placement setup ("generated metadata is stale; regenerate and commit
  test/shards/impact-graph-seal.json", 1432 files no result, exit 97): the
  known environmental defect (foreign node_modules/@pulumi symlink), not a
  red of this candidate.
- Lab run 2 ran on a snapshot whose seal had been regenerated by
  `npm run -s test:metadata:refresh` (it calls
  `generate-global-owner-debt-inventory.js --refresh-import-graph-only`),
  and placement accepted it on lenovo-laptop.
- Per the lead's instruction the seal is put back to the committed
  1ad04d21a content (`git show 1ad04d21a:test/shards/impact-graph-seal.json`)
  and is not regenerated; the *-classes.json refresh stays. A run that dies
  at that setup step is recorded here, not counted as a red.

## 2026-11-08 later: verification at the handover boundary

- Lab run 2 finished: total=1432 pass=1361 fail=71. Lab run 3
  (refs/wip/nav-readiness-1304, 9285f5370, with the committed seal) was
  refused before any test ran with "SAFE TEST SCOPE UNKNOWN ... import graph
  is not the one the committed seal binds": the environmental seal defect,
  not a red of this candidate. Per the lead, verification went on with
  local single-file witnesses.
- Fixture correction: the first `nodeReadinessServiceFor` did not match
  ReplicaDispatchService's former construction (it named a cache mutation
  target and the CDC service, and passed the raw gateway option), and
  replica-dispatch-atomic-claim*.integration went red (base green). The
  fixture now reproduces each owner's former construction: the gateway the
  owner derived (same `createControlPlaneRuntimeBundle` factory and
  inputs), the coordinator's accounting/propagation owners where the owner
  took them from it, and the owner-specific extras. Both files are green.
- Classification of all 71 lab-run-2 reds:
  - 55 were construction-sweep sites. Every one is green locally after the
    sweep.
  - 7 failed on timing under the lab's 8-way load and pass locally on the
    candidate (listed in the first entry).
  - 9 integration files fail identically at base 1ad04d21a. They were run
    from a `git archive` of 1ad04d21a in the scratchpad, on the same
    machine, with the same counts: create-table-partition-provisioning
    (9/10), critical-replica-placement-causal-trace (7/8),
    managed-split-admission-reliability, managed-split-writes-after-cutover,
    membership-consistency (24/26), node-joining-rebalance (24/25),
    node-join-replica-activation (19/21), seed-node-bootstrap (95/97) and
    failure-scenarios (exceeds the 420s local cap at base too). These are
    pre-existing local environment failures, not this quest's.
- Local single-file witnesses on the final tree:
  - All 234 non-integration test files that reference the readiness
    service are green, 10936 assertions, none with zero assertions.
  - All 73 test files that use the fixture or the swept helpers are green.
  - The 16 lab-run-2 late integration reds are as classified above.
- Cheap checks on the final tree:
  - The pre-commit hook (LAGRANGE_SOLVER_LANDING=1) exits 0.
  - fast-static ok; audit:file-size ok; impact-contracts PASS;
    runtime-grammar 0 violations.
  - The test duplication baseline is tightened again on the hint, to 24336.
  - The test/shards/*-classes.json files are regenerated. The
    impact-graph-seal is byte-equal to 1ad04d21a.
- Rows are unchanged since the first entry:
  - `inheritance_depth_over_two_readiness` = 0
  - `owner_port_feature_detection_pilot_owners` = 139
  - `prototype_copy_bags` = 59
- Still owed: a lab run of the full changed cone on this tree once the
  seal producer fix lands, plus the independent verification the quest
  requires.

## 2026-11-08 round 2: late-bound collaborators validated at every wiring

Implements the lead's decision of 2026-11-08 (epic decision log): a second
wiring through `syncOwnerDependencies` is a production path, not refused.

### Design

- `control-plane-readiness-collaborators.js` owns the interface of every
  late-bound collaborator (`LATE_BOUND_COLLABORATOR_MEMBERS`: the members the
  service calls) and validates it at every wiring:
  `assertReadinessServiceCollaborators` (construction options) and
  `assertLateBoundCollaborators` (each `syncOwnerDependencies` call, before
  any state changes). Absent = unwired; malformed = `Error` with code
  `CONTROL_PLANE_READINESS_COLLABORATOR_INVALID`, `collaborator` = the option
  name and the missing member in the message. Census of production
  implementations (SystemTableCache, MembershipPublicationCoordinator,
  NodesOwner, ServicesOwner, MessageRouter, HeartbeatService,
  CDCGroupPropagationService, StorageCapacityAccountingService,
  NodeLifecycleStateMachine, AuthoritativeControlPlaneView,
  AuthoritativeNodeEvidenceReconciler): each has every listed member
  (checked by loading the classes' prototypes), and each collaborator has one
  production implementation.
- Named unwired state: one constant
  `CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED`
  (`control-plane-readiness-constants.js`) and one helper
  `readWiredCollaborator(service, name)`. The slot itself stays `null` when
  unwired, because other owners read `readinessService.membershipPublicationService`
  by presence (heartbeat lifecycle, rebalancer coordination, dispatch replay).
- Wiring moved to its owner module `control-plane-readiness-owner-dependencies.js`
  (participation-base was at 788 lines). Replacement is named:
  `replaceMembershipPublicationService` (clears the planning-source memos:
  diagnostics memo, CL-033 projection, CL-034 merge, sync/async derivation
  memos; records `recordMembershipOwnerReplacement`; same owner again changes
  nothing) and `replaceSystemTableCache` (CL-019 listener move, snapshot and
  memo clear, `recordCacheReplacement`). The storage-accounting replacement
  keeps its existing named step `prepareCapacitySemanticOwnerReplacement`.
- Deleted: `PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_PROVIDER_UNAVAILABLE`
  (a wired publication owner always has the planning reads; no other
  reference in src, test, docs).

### Per-site table (70 pilot sites at round start -> 2)

Where a collaborator may legitimately be unwired at the read, the site keeps
its former answer under the named state; the deleted branches are the
member-absent ones, never taken in production because every production
implementation has the member (census above).

| Site(s) | Change | Production wiring / named state |
| --- | --- | --- |
| publication-diagnostics 64, 69 | direct `getLatestPublicationForNode`; cluster fallback deleted | publication owner wired by control-plane-setup.js:490 after construction; unwired -> null diagnostics row |
| publication-diagnostics 100 | memoizable iff wired | unwired -> not memoizable (as before) |
| publication-diagnostics 178, 288 | derive* called when wired | unwired -> diagnostics-derived snapshot; a null candidate still takes that path (production path, kept) |
| planning-resolution 725-760 | cluster scope -> cluster read, else node read; third fallback deleted | unwired -> null row |
| planning-resolution 771 | direct | unwired -> null |
| planning-snapshot 269 | direct epoch probe | unwired -> probe-unavailable marker |
| startup-authority-health 34 | direct | unwired -> null |
| startup-authority-health 309-310, 354-357 | provider probe deleted with PLANNING_PROVIDER_UNAVAILABLE | unwired -> SERVICE_UNAVAILABLE (as before) |
| startup-authority-health 390; node-service-rows 172 | direct accounting reads | wired at construction (control-plane-setup.js:295-318) and by the coordinator (rebalance-coordinator-lifecycle.js:497); unwired -> null / missing-owner log + strict refusal (as before) |
| startup-authority-health 640, 650; node-service-rows 30, 44 | nodesOwner direct | wired by control-plane-setup.js:490; unwired -> cache rows (as before) |
| node-service-rows 66, 83, 97; service-node-methods 245, 249 | servicesOwner direct / wired check | same wiring; unwired -> cache rows, not authoritative |
| node-service-rows 104, 120, 123, 134, 145, 150; service-node-methods 30, 259, 298, 302; snapshot-store 45, 512, 520, 547; lifecycle 24; participation-base 507 | cache members direct; `get` and `getAll` fallbacks of getShared/filter deleted | cache required at construction; may be unwired only by a `systemTableCache: null` wiring -> empty rows / no subscription (as before) |
| node-service-rows 162 | direct `getState` | never wired in production (no src wiring site); unwired -> row status |
| node-service-rows 425, 440; evidence-reasons 130, 135, 138; formation-release 67, 100; node-liveness 32 | router members direct | router wired at construction (control-plane-setup.js) and resynced by the coordinator; unwired -> no transport evidence / no subscription |
| node-liveness 107 | `off` direct | the source is only ever a wired (validated) router |
| diagnostics-eligibility 148 | direct | heartbeat wired by heartbeat-service.js:233 after construction; unwired -> null |
| diagnostics-eligibility 215 | direct | wired at construction when the node has a propagation service; unwired -> missing-owner log, strict refusal or REPAIR_ONLY (as before) |
| participation-base 366 | direct `logger[level]` | logger is set at construction to the subsystem logger or console; both have warn and error |
| participation-base 480, 490 | view: wired check + direct; reconciler: direct | view unwired until the service creates it lazily (evidence-reasons getAuthoritativeControlPlaneView) or an injected one (validated); the reconciler is always constructed or injected (validated) |
| unified-rebalancer-available-nodes 89, 279, 401, 450, 506 | direct calls on the readiness service | required construction collaborator (`requireControlPlaneReadinessService`), only replaced by the coordinator's non-null service (unified-rebalancer-lifecycle-base.js:503-516); the `!readinessService` guards there were dead too and are deleted |
| replica-operation-repository-visibility-methods 404 | planning answer called without a probe | real service never reaches it (best-effort surface answers first) |
| replica-operation-repository-visibility-methods 383, 394 | LEFT | best-effort alias family owned by fix quest `priority-recovery-owner-read-snapshot-await` (R17): removing them chooses the surface, which is that quest's change |

`partition-service-learner-promotion-methods.js` already calls the answer
without a probe; its `!readinessService` guard tracks the late-bound
coordinator and belongs to `partition-service-constructor-injection`.

Out of the pilot files, recorded (R17), not changed: other readiness-owned
modules still probe the cache's version surface
(`readiness-planning-semantic-currency-methods.js:265`,
`readiness-planning-snapshot-owner.js:360`,
`membership-planning-version-key.js:46`,
`projection-readiness-evidence-generation.js:370`,
`readiness-planning-semantic-generation.js:203`) and the readiness service
(`unified-rebalancer-control-plane-readiness-methods.js` 5 sites); with the
cache now validated at wiring their absent branches are dead in production
and in every test (fixture caches have the member).

### Test fixture

`test/helpers/readiness-service-fixture.js` is the one version of every
hand-written collaborator fake: `readinessCollaboratorFake(name, fake)` /
`readinessCollaboratorFakes(options)` complete a partial fake in place with
the answer the service gave when the member was absent (no rows, no row, no
candidate, no diagnostics, no transport evidence, no subscription; the
cache's `getShared` falls to `get`, then to the `getAll` row by node id, as
the deleted readiness fallback did); `createReadinessServiceForTest` and
`nodeReadinessServiceFor` apply them; `readinessServiceFake(fake, clock)` /
`partialReadinessFake` complete a hand-written readiness service with the
consumer members (answer, liveness, startup authority, readiness -> null;
`now` -> the owner's clock, the rebalancer's former fallback). No neutral
default exists for nodesOwner, servicesOwner, the propagation diagnostics or
`getState`: their absent answers came from the service itself. The 52 test
files that called `new ControlPlaneReadinessService(` directly (210 sites)
now call `createReadinessServiceForTest(` with the same options;
`test/rebalancer/test-helpers.js` `createMockControlPlaneReadinessService`
builds through `partialReadinessFake`.

### Correction: the cache apply-change channel is optional (second implementation)

The census above missed `ReadOnlySystemTableCache`
(`src/cache/read-only-system-table-cache.js`): the joiner path wires it as
the readiness cache (entrypoint-runtime-admin-composition.js
resolveSystemCacheHandles -> lagrange-runtime-startup.js
attachSqlRuntimeToStartupOwner -> startup-sql-runtime-handoff.js:205 ->
rebalance-coordinator-lifecycle.js:497). It has every required cache member
but NOT `onCacheApplyChange`/`offCacheApplyChange`, so the two absent-member
branches at snapshot-store 520/547 WERE production paths (found by the
control-plane repair agent through authoritative-node-evidence-reconciler
"resolves writable cacheMutationTarget ... read-only cache"). Behaviour kept:
the apply-change channel is a named optional capability validated at wiring
(both members or neither, else refusal) and read once through
`readCacheApplyChangeChannel(cache)` (cache or the unwired state); the
fixture's neutral cache no longer adds the channel. Owner decision (R17,
not taken here, it changes joiner timing): give the read-only cache a
delegating apply-change channel, then make the channel required.

### Tests whose expectation changed (round 2)

- control-plane-readiness-service-construction.test.js: new witnesses
  (malformed late-bound collaborators refused at construction and at every
  wiring with state untouched; unwired read answers the named state;
  replacement clears planning memos, same owner changes nothing; optional
  apply-change channel: read-only cache wired, half channel refused).
- control-plane-readiness-service.test.js "uses injected owners for async
  shared metadata reads": `cacheGetAllCalls === 0` removed. The planning
  identity reads node rows from any cache with a version surface
  (readiness-planning-formation-source.js via semantic-currency /
  snapshot-owner); the 0 held only because the fake cache lacked
  `getTableMutationVersion`, which every production cache has (shown on a
  HEAD archive: same test with the member added -> 5 getAll calls).
- control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js
  "sync readiness splits publication diagnostics from recovery planning"
  renamed "... from one memoized cluster publication read": read profiles
  [diagnostics, planning] -> [diagnostics]; membershipPublication null ->
  ACK_PENDING; controlPlanePublished true -> false. Fake now has the
  production interface: the CL-019 sync memo applied whenever
  `getLatestClusterPublicationSync` exists (HEAD diagnostics:103), i.e.
  always in production; only a fake without it let the two lanes diverge.
- control-plane-readiness-service-sync-and-priority-recovery.test.js
  "priority recovery current sync evaluation closes recovery eligibility
  when a newer planning epoch clears priority blockers": DELETED. Its claim
  needed the diagnostics lane to keep a stale row while the planning lane
  saw a newer one, which only the partial fake allowed (as above);
  production-shaped variants keep eligibility inside the stale grace. For
  the verifier: this is the one deleted witness.
- control-plane-readiness-service-publication-owner-and-dimensions.js
  "fails closed without publication owner": the `{getStats}` propagation
  owner is now a refusal witness (COLLABORATOR_INVALID); the fail-closed
  assertions run against an unwired (null) owner; `statsCalls === 0`
  removed (a malformed owner is never read).
- Construction-only (no expectation change): ~35 further files route
  partial fakes through the fixture (readinessCollaboratorFake(s),
  readinessServiceFake); nodesOwner/servicesOwner fakes in
  control-plane-readiness-service.test.js, -getall-and-snapshot-cache,
  readiness-authoritative-row-read-contract and publication-readiness-churn-liveness
  state the members with the answers the absent path gave; fakes whose
  per-node publication read filtered on node id state the cluster member
  (the fixture's cluster default cannot know the node id).
- Fixture fix (repair agent finding): completion no longer mutates the
  fake (it changed the owner's own probes, e.g. a coordinator cache gained
  `getAll`/`filter` and its repository took the observation-boundary
  branch); it returns a derived object for the readiness service.

Observation (not a change, owner R17): owners swallow a TypeError thrown
inside the repository's owner read (coordinator-created retry, provisioning
job) without a log line.

### Fixture fixes found by the lab cone

- `createReadinessServiceForTest` built its default `SystemTableCache`
  even when the test named a cache; the constructor reads the clock, which
  the formation simulator forbids inside a guarded dispatch
  (formation-sim-runner / -attribution-isolation red). The default is now
  built only when no cache is named (an explicit `null` is kept).
- The fixture's cluster-read default for a publication fake that states
  only the per-node read now passes the service's node id (the id the old
  cluster-scope fallback passed for the service's own reads)
  (membership-publication-coordinator.test.js, 3 subtests).
- membership-publication-coordinator-tail-more-test-cases.js: the partial
  cache and router are completed once and the same objects are wired at
  construction and re-wired (a same-owner re-wiring stays a no-op).
- failure-scenarios.integration: the always-ready readiness fake goes
  through `readinessServiceFake` (the repository owner read calls the
  planning answer).

### Verified by (round 2, final tree)

- Local: all 370 unit-level test files referencing the readiness service,
  its consumers or the fixture: green except two, both since fixed and
  re-run green (control-plane-gateway-registry: the codemod had turned its
  refusal witness into a fixture construction, restored;
  formation-release-handoff-interaction-registry: diffs the working tree
  against HEAD, so any uncommitted edit to a formation-release owner file
  trips it; it is green in the lab, where HEAD is the snapshot). 15288
  assertions; 7 files are skip-only (declared skips, unchanged).
- Lab run A, tv-dator, snapshot refs/wip/nav-readiness-1450 (196174fd2),
  base 6521d5027, lane all: 1474 files, 1467 pass, 7 fail. The reds were
  the two formation-sim files, the membership-publication-coordinator test
  and failure-scenarios (fixture defects, fixed above, each re-run green
  locally; failure-scenarios then fails only on timeouts, as at base), the
  rs-raft cutover (green locally at candidate and base), the causal trace
  (red at base, same timeout), the npm package test (600 s budget spent
  with 0 assertions on the host; 2/2 in 30 s locally on the candidate),
  and two generated test-output/tap-timeout-fixtures files (written by a
  runner test into test-output, not repository tests).
- Lab run B, lenovo-laptop, final snapshot refs/wip/nav-readiness-1605
  (26c1071f4), lane all: 1474 files, 1427 pass, 7 fail, 40 with no result
  (the host stopped answering, "server not responding", then "no route to
  host"). The 7 reds (native-provisional-route, replace-real-group-scheduling,
  cdc-source-occurrence-delivery, retained-seed-original-handoff,
  seed-release-failure-custody, single-path-partition-cutover,
  managed-split-writes-after-cutover) all pass locally on the final tree and
  passed on run A, except the cutover (lab load) and managed-split-writes
  (243 s timeout on the host, green on run A).
- Lab run C, carinas-windows, final snapshot, lane exclusive (the 61-file
  lane holding the 40): 46 pass, 15 fail, no TypeError anywhere. 13 of the
  15 passed on run A. Locally on the final tree: control-plane-rebalance,
  multi-node-cluster, preflight-critical-path-hops,
  single-node-default-replica-count-writes, three-node-seed-rebalance
  green; create-table-partition-provisioning 9/10, membership-consistency
  24/26, node-joining-rebalance 24/25, node-join-replica-activation 19/21,
  seed-node-bootstrap 95/97, managed-split-admission-reliability: the same
  local base reds as round 1; public-binding-cell-invocation-seam 0/3 at
  base and candidate; pgwire-command-tag-real-engine one `timeout!` at base
  and candidate; causal trace and failure-scenarios as in run A.

### Round 2 repair (B1)

Verifier finding B1: the fixture's `now` defaulted to a `Date.now` captured
at module load, and the candidate deleted the rebalancer's fallback to its
own `nowFn`, so on the planning path `observedAt` came from wall-clock in
five witnesses that drive a virtual clock, and the planning clock-seam proof
(which replaces `Date.now` with a thrower) could not see the ambient read.
Test-only repair; src unchanged.

- test/helpers/readiness-service-fixture.js: one `ownerClockOrAmbient(clock)`
  gives a fake's `now`: the owner's clock when passed, else the ambient clock
  read at call time (`() => Date.now()`); no captured default remains
  (`readinessServiceFake`, `partialReadinessFake`, `nodeReadinessServiceFor`).
- The three helpers take the owner's clock: `createMockReadinessService(cache,
  clock)` (unified-rebalancer-test-support.js),
  `createMockControlPlaneReadinessService({clock})` (test-helpers.js),
  `createProvisioningReadyService(source, clock)` (sql-query-engine-test-support.js,
  default now the fixture's).
- The owner's clock is passed where the test has one:
  priority-recovery-stale-planning-visibility (the rebalancer's `nowFn`
  through `createPlanningReadinessService`, `testClock` at the two
  blocked-local-serve sites), topology-settling-node-ready-lease-wake,
  formation-barrier-spread-cure-lane-discrimination,
  unified-rebalancer-node-readiness-replica-state (`createTestRebalancer`
  passes its `nowFn`), unified-rebalancer-planning-clock-seam.
- Mutation proof (scratchpad b1-repair): with the late-bound default and the
  seam test's owner clock removed, the seam test is red, "ambient clock read
  on the planning path" (0/1); repaired, 4/4. With the owner clock fed and
  the default switched back to a captured `Date.now`, still 4/4: green comes
  from the owner's clock, not from a captured ambient clock.
- Coverage probe (throwaway worktree, instrumented
  `unified-rebalancer-available-nodes.js` at both `readinessService.now()`
  sites, recording any read where the rebalancer's `nowFn` is not `Date.now`
  and the served time differs from `nowFn()`): over all 118 test files that
  use the fixture fakes or the three helpers, 0 mismatches; the probe
  reports 3 mismatches on the unrepaired topology-settling file. Every other
  default-clock consumer runs a rebalancer whose `nowFn` is `Date.now`, as
  at HEAD. Exits: all 0 except failure-scenarios (142),
  membership-consistency and node-joining-rebalance (1), the base reds above.
- Tests (node --test, one file at a time, thermal-gated): 72 files (the
  verifier's controlled-clock list, the construction witness, every edited
  test file, every user of the three helpers), all exit 0, 0 failures
  (construction witness 67/67, clock seam 4/4, priority-recovery-stale 27/27,
  topology-settling 27/27, node-readiness-replica-state 38/38,
  formation-barrier 18/18).
- Gates: `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit` exit 0;
  `npm run -s test:duplication` exit 0, test ratchet tightened on its hint
  24292 -> 24272 duplicated lines (clone groups 648 unchanged).

Correction (verifier N5): the attempt record's "pilot row 139->71" start
value is wrong for this quest. The seal commit 7c6cf8f7b measures
`owner_port_feature_detection_pilot_owners` = 172 (re-measured on an archive
of 7c6cf8f7b; it is also the epic budget table's start value); the
candidate measures 71. The 139 in the rows sections above was measured on
the round-1 working tree (round-1 removals already applied, 157 at resume)
with the stream worktree's budget script, not on the seal commit. The row
fell 172 -> 71.
