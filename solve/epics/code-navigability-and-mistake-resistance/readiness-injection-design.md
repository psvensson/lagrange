# Readiness service constructor injection: design

Quest `readiness-service-constructor-injection`, base 1ad04d21a.

## Today (measured, not guessed)

`ControlPlaneReadinessService` is an export alias of
`ControlPlaneReadinessPublicationAware`, whose prototype chain is ten deep:
PublicationAware -> NodeServiceRows -> StartupAuthorityHealth ->
PublicationPlanningResolution -> PublicationPlanningSnapshot ->
PriorityRecoveryPlanning -> EvidenceReasons -> PublicationDiagnostics ->
DiagnosticsEligibility -> ParticipationBase. 238 prototype names: 157 class
members across the ten classes, 81 installed by eight existing
`install*Methods(prototype)` fragments, one static
(`compactSnapshotSummary`). Shadowing: PublicationAware's two methods only
call `super` (dead); EvidenceReasons' `shouldAllowTransportBackedRecoveryGrace`
shadows DiagnosticsEligibility's (the lower one is dead). Two constructors
(DiagnosticsEligibility, EvidenceReasons) re-wrap
`getPriorityControlPlaneRecoveryState` and
`buildPriorityControlPlaneRecoveryUnavailableHealth` as instance-own
properties: effective = grace(activity(base)) and transportRetry(base).

Construction sites: `src/bootstrap/shared/control-plane-setup.js` (the node
owner), and private fallbacks in `rebalance-coordinator-lifecycle.js`,
`unified-rebalancer-lifecycle-base.js`, `replica-dispatch-service-lifecycle.js`,
`storage-admission-service.js`; 205 test constructions in 52 files. Every
site passes `nodeId` and `systemTableCache`; 184 pass `now`. Late-bound owners
(`membershipPublicationService`, `nodesOwner`, `servicesOwner`,
`messageRouter`, `heartbeatService`, ...) are wired after construction through
`syncOwnerDependencies` by control-plane-setup, the coordinator, the
rebalancer and the heartbeat service, because the bootstrap creates them after
the readiness service.

## Collaborators

Validated once, in the constructor, by `assertReadinessServiceCollaborators`
(`control-plane-readiness-collaborators.js`):

| Collaborator | Option | Rule |
| --- | --- | --- |
| node identity | `nodeId` | non-empty string, else refusal |
| system-table cache | `systemTableCache` | object, else refusal |
| clock | `timeSource` / `now` | when given: `timeSource.now` and `now` are functions, else refusal; absent = the platform clock, the existing DT4 seam default |
| incarnation fence | `getLocalClusterIncarnationFence` | when given, a function, else refusal |

Refusal: `Error` with `code =
CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_MISSING` (or
`COLLABORATOR_INVALID` for a malformed one) and `collaborator` naming the
option; codes live in `control-plane-readiness-constants.js`. The planning
snapshot source (`membershipPublicationService`) and the node/service row
owners stay late-bound through `syncOwnerDependencies`: requiring them at
construction would reorder bootstrap composition and change readiness timing,
which the behaviour-unchanged constraint forbids. Recorded as the residual of
this quest for its owner (R17), not absorbed.

## Shape after

- One class `ControlPlaneReadinessService` in
  `control-plane-readiness-service.js`, no `extends`. Its constructor runs the
  collaborator assertion, then `initializeControlPlaneReadinessState(this,
  options)` (the former base constructor body, unchanged). Prototype chain
  from the service prototype to `Object.prototype`: 1.
- Each former tier file keeps its name and responsibility and becomes an
  explicit-context module: every former method is
  `function name(service, ...params)` with `this` replaced by `service`;
  internal calls still dispatch through `service.name(...)`, so instance
  stubs and subclasses-free test fakes keep working. Two module functions are
  renamed where the method name collides with an import:
  `buildProjectionReadinessContractForService`,
  `resolveServiceMembershipPublicationPlanningSource`.
- The class carries one delegating method per former class method
  (`name(a, b) { return module.name(this, a, b); }`), explicit parameters, no
  rest-spread. The eight existing installers target its prototype in the old
  precedence order (they are inherited mixin debt, not new bags).
- The two wrapping constructors become methods on the class composing named
  module functions: `getPriorityControlPlaneRecoveryState` =
  `applyPriorityRecoveryTransportGrace(activity(base))`,
  `buildPriorityControlPlaneRecoveryUnavailableHealth` =
  `withTransportRetryHint(base)`.
- Deleted: `control-plane-readiness-publication-aware.js` (two `super`
  pass-throughs), the dead lower `shouldAllowTransportBackedRecoveryGrace`.
  The runtime-grammar contract that pinned the pass-through file is re-pointed
  at the implementing file, with the same required fragments.

## One planning answer

The four names are two computations: the raw derivation (snapshot sync) and
the retained, memoized projection (answer sync); two names are pure aliases.
Kept: `getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt)` - the name
every consumer already tried first, so production behaviour is unchanged.
Deleted: `getMembershipPublicationPlanningAnswerSync`,
`getPriorityRecoveryPlanningSnapshotSync` (aliases) and
`getMembershipPublicationPlanningSnapshotSync`, whose computation stays as
the projection's input under the name that says so,
`deriveMembershipPublicationPlanningSnapshotSync` (not an answer; the memo
keys on its identity as before). Consumers call the answer directly:
`partition-service-learner-promotion-methods.js`,
`replica-operation-repository-visibility-methods.js`,
`unified-rebalancer-available-nodes.js`, and a fourth found by grep,
`unified-rebalancer-priority-readiness.js` (`readMembershipPlanningSnapshot`
probed the alias first). Test fakes that offered only a removed name are
renamed to the answer name: a fixture edit, same returned value.

## Witnesses

- New `test/control-plane/control-plane-readiness-service-construction.test.js`:
  refusal per missing/malformed collaborator (code + collaborator name);
  complete construction succeeds; prototype chain length <= 2; the answer
  method exists; the three removed names are absent on prototype and instance.
- Every existing readiness test file (215 listed by
  `grep -rl control-plane-readiness test/`, plus importers of the consumer
  files), unchanged assertions.
- `node scripts/checks/code-navigability-budget.js --metric --rows
  inheritance_depth_over_two_readiness` = 0 once that script lands.

## Step order (each step leaves the readiness tests green)

1. Witness, red.
2. Codemod the nine tier classes to explicit-context modules; new class with
   delegators; fold the wrapping constructors; delete PublicationAware;
   retarget test imports of the deleted intermediate classes to
   `ControlPlaneReadinessService` (construction-only). Run all readiness tests.
3. Collaborator assertion and error codes; repair any construction that omits
   a required collaborator by supplying it (construction-only).
4. One planning answer; delete three names; consumers and fakes. Tests.
5. Partition-service read; consumer tests.
6. Checkers (eslint, literals, decision boundaries, ambient intrinsics,
   silent catch), file-size, navigability counts.

## Outcome at this sitting (2026-11-08)

- Steps 1, 2 and 4 done; chain depth 10 -> 1 prototype (no `extends`).
  Each consumer keeps one presence check on the answer method: 16 test
  files hand the rebalancer a partial fake without it (fixture sweep next).
- Step 3 (owner ruling 2026-11-08): the four private constructions
  (RebalanceCoordinator, UnifiedRebalancer, ReplicaDispatchService,
  StorageAdmissionService) are second instances of one authority (R01, R03):
  each takes the node service as a named, validated collaborator and the
  private construction is deleted; tests use one fixture helper. The
  gateway-registry null-gateway assertion is replaced by the refusal witness.
- Late-bound owners (ruling): wired at one point, `syncOwnerDependencies`,
  validated when set; a second wiring with a different owner is refused; a
  read before wiring answers a named unavailable state, never null.
- Step 5 not done: the partition getter tracks a late-bound coordinator
  (`setRebalanceCoordinator`); freezing it at construction changes behaviour.
  It belongs to `partition-service-constructor-injection`.
- Finding (R17): `replica-operation-repository-visibility-methods.js` returns
  the async best-effort surface synchronously, so owner-read callers get a
  Promise as the planning snapshot. Kept unchanged; the best-effort pair
  (`get*PlanningSnapshotBestEffort`) is a second alias family.

## Late-bound wiring (round 2, lead decision 2026-11-08)

Supersedes "a second wiring with a different owner is refused" above. Every
wiring (construction options and each `syncOwnerDependencies` call)
validates the late-bound collaborators it names against
`LATE_BOUND_COLLABORATOR_MEMBERS` (`control-plane-readiness-collaborators.js`)
before anything changes; a malformed one is a typed refusal
(`CONTROL_PLANE_READINESS_COLLABORATOR_INVALID`, `collaborator`). A second
wiring is a replacement, the named transition in
`control-plane-readiness-owner-dependencies.js`
(`replaceMembershipPublicationService`, `replaceSystemTableCache`, and the
existing `prepareCapacitySemanticOwnerReplacement`). A read before wiring
answers `CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED` through
`readWiredCollaborator(service, name)`; the slot stays null for owners that
read it by presence. Use sites call wired collaborators directly.
