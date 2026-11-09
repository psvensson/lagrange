# PR #201 alignment notes

Append-only (R21). Alignment of the code-navigability stream
(`work/code-navigability-fallback-census-20261108`, head 95877e60b) with the
incoming main (PR #201, head branch
`work/composed-05-comparison-readiness-20261103`). Branch
`work/code-navigability-align-pr201-20261109`, worktree
`lagrange-nav-align-pr201-20261109`.

## 2026-11-09 merge

- Merged sha: **343c569653ab72ee4a4a52432af51f6bffe73cab** (PR #201 head =
  main 7532b3ca6 + 221 commits). Merge base with the stream: e29e295a6.
- Commits on the alignment branch: merge **7b65d016b** (parents 95877e60b,
  343c56965; resolutions, re-expressions, fixture routing, regenerated
  metadata), fixes **c82167e1e** (hand readiness fakes routed through the one
  completer) and **d176db0da** (one readiness-holding coordinator fixture;
  the PR's remove-safety builder restored), and this note.
- Conflicts: 89 files (14 src, 3 scripts/solve, 72 test incl. one
  modify/delete). Every src conflict was resolved by taking the stream's
  shape and re-applying the PR's diff (e29e295a6..343c56965) for that file,
  never by taking one side whole.

### Resolution rule applied

PR behaviour wins; it is expressed in the stream's structure. Where the PR
added code in a shape the stream removed (prototype mixin into the flattened
readiness class, `typeof x.member === 'function'` probes on the required
readiness collaborator, module-level identity-keyed state, catch-default and
two-source-default shapes that pushed a capped row over its cap), the PR's
logic was rewritten into the stream's shape.

### src conflicts, one by one

| File | PR intent | Stream intent | Resolution |
| --- | --- | --- | --- |
| control-plane-readiness-diagnostics-eligibility.js | serving is the committed-epoch answer (`answerServeEligibility`, `isServeEligibilityAnswerEligible`); `buildServeAdmissionSnapshot`/`SERVE_ADMISSION_STATE`/`STATE` deleted; two ledger aggregated-summary readers (each with an alias) | explicit-context module of the one class | module function form: `buildDimensionsEvaluation` carries `serveEligibility`; `getParticipationDecisionLedgerAggregatedSummaries` and `getAuthoritativeReadinessRepairLedgerAggregatedSummaries` added as module functions + class delegators; the two PR alias names (`getParticipationDecisionAggregatedSummaries`, `getAuthoritativeReadinessRepairAggregatedSummaries`) not added (one name each; the admin consumer reads the Ledger name first). `buildServeAdmissionSnapshot` delegator deleted. |
| control-plane-readiness-evidence-reasons.js | comment only (missing-row self grace now requires live service evidence) | module form | comment ported. |
| control-plane-readiness-node-service-rows.js | `hasServeEligibleControlPlaneService` answers false for no rows / no message-group rows | module form | both `return true` -> `return false` in the module function. |
| control-plane-readiness-publication-diagnostics.js | async diagnostics read goes through `getLatestMembershipPublicationRow` (scope split); memo only for the DIAGNOSTICS lane; alias `getMembershipPublicationPlanningAnswerSync` deleted | wired-collaborator read, unwired -> null | unwired -> null kept (named state), then `service.getLatestMembershipPublicationRow(nodeId, readOptions)`; memoizable condition gains the lane test; alias already deleted by the stream. |
| control-plane-readiness-publication-planning-resolution.js | direct-publication sync answer is remembered (`rememberResolvedNodePlanningAnswer`); third read fallback removed | the stream had already removed the third fallback and the probes | PR's memo wrap ported into the module function; read functions unchanged (same behaviour as the PR). |
| control-plane-readiness-publication-planning-snapshot.js | `getMembershipPublicationPlanningSnapshotBestEffort` deleted (BestEffort pair -> one name answering the planning answer); `buildMembershipPublicationProtocolInput` reuses the memoized diagnostics' protocol snapshot | module form | both ported: one BestEffort name (`getPriorityRecoveryPlanningSnapshotBestEffort`), new module function `buildMembershipPublicationProtocolInput` + class delegator; the deleted alias's delegator removed from the class. |
| control-plane-readiness-service-node-methods.js | bulk readiness enumerates only required/observed identities (`collectCandidateReadinessNodeIds`), always reads endpoint rows, sync bulk builds the current snapshot for a missing one | probes replaced by `readWiredCollaborator` | PR's code taken; its `typeof cache.getAll`/`typeof owner.listNodes` probes re-expressed: `readTrustCacheRows` (wired cache), `hasAuthoritativeBulkRows(service, options, COLLABORATOR.X)` (wired owner). |
| control-plane-readiness-snapshot-store.js | the serve-eligibility owner is noted on every cache change (apply channel, else deferred change); the serve-eligibility methods are installed as a NEW prototype mixin through the snapshot-store installer | apply channel read once through `readCacheApplyChangeChannel` | stream's channel code kept, PR's two `noteServeEligibilitySourceChange` calls added; the mixin installation removed (see below). |
| partition/partition-service-learner-promotion-methods.js | the canonical planning reader `readPriorityRecoveryPlanningAnswerSync` | direct call on the readiness service | PR's canonical reader (one version of the read). |
| partition/partition-service-learner-promotion-proof-methods.js | probe a learner by replica identity | `turnChainValue` (named turn) | `await turnChainValue(this.raft.probePeerProgress(learnerReplicaId))`. |
| raft/raft-rs-group-membership-admission.js | admissions carry `nodeId`; removal proposes the transition without a peer address | `turnChainValue` on the port's turn | `turnChainValue` on `port[PROPOSE_MEMBERSHIP_TRANSITION]` with `(observed.transition, ...)`. |
| rebalancer/replica-operation-repository-visibility-methods.js | the owner read uses the canonical sync planning answer (no BestEffort Promise) | kept the BestEffort probes for the fix quest | PR's canonical reader (this is the fix quest's surface change, see in-flight impact). |
| rebalancer/unified-rebalancer-available-nodes.js | candidates from the committed node answer (`answerCommittedNodes`), own liveness projection, canonical reader, no surface order | probes deleted, `readinessService.now()` | PR's logic; `?.answerCommittedNodes?.()` -> direct call (required collaborator); `hasPriorityRecoveryPlanningAnswerSync` probe dropped; stream's `readinessService.now()` kept. |
| rebalancer/unified-rebalancer-priority-readiness.js | canonical reader | direct call | PR's canonical reader. |

### Patterns the PR introduced, re-expressed

- **Prototype mixin into the flattened readiness class**:
  `control-plane-readiness-serve-eligibility-methods.js` was an
  `install*Methods(prototype)` bag installed through the snapshot-store
  installer. It is now an explicit-context module (functions taking the
  service first); the class carries nine delegators
  (`getServeEligibilityOwner`, `readServeEligibilityCommittedRows`,
  `readServeEligibility`, `answerServeEligibility`, `answerServeCohort`,
  `answerCommittedNodes`, `subscribeServeEligibility`,
  `noteServeEligibilitySourceChange`, `shutdownServeEligibilityOwner`) and
  initialises the `serveEligibilityOwner` slot to null.
- **Probe on a readiness collaborator**: `typeof view?.readReadinessOwnerRows`
  -> `readReadinessOwnerRows` is a member of the authoritative view's
  interface in `LATE_BOUND_COLLABORATOR_MEMBERS` (validated at every
  wiring; the one production implementation `AuthoritativeControlPlaneView`
  has it); an absent view (no CDC service) still answers the typed
  `AUTHORITATIVE_READ_OWNER_UNAVAILABLE`. The fixture's neutral view answers
  the same typed refusal.
- **Canonical planning reader** (`priority-recovery-planning-answer-origin.js`):
  kept as the one read path (PR's canonical API), with its
  `typeof readinessService[...] === 'function'` probe and the exported
  `hasPriorityRecoveryPlanningAnswerSync` deleted; an absent service still
  answers null.
- **Probes on the required readiness service in rebalancer owners**:
  `unified-rebalancer-critical-topology-methods.js` (`answerCommittedNodes`),
  `operation-workflow-committed-node-floor.js` (`answerCommittedNodes`,
  `readServeEligibility`; the reason `OWNER_UNAVAILABLE`, reachable only by a
  member-absent fake, deleted), `operation-workflow-replace-owner-wake.js`
  (`subscribeServeEligibility`). The test fixture's consumer members gained
  the neutral answers (`answerCommittedNodes` null, `readServeEligibility`
  resolves null, `subscribeServeEligibility` returns a no-op unsubscribe).
  Left as found, recorded: probes in query owners whose readiness service
  is optional (`query-executor-partition-service-resolution.js`,
  `query-executor-partition-routing-snapshot.js`,
  `sql-query-engine-provisioning-methods.js`,
  `sql-query-engine-provision-target-methods.js`) and the stream-era
  `subscribeReadinessPlanningSnapshots` probe.
- **Prototype copy bag in the partition service**
  (`partition-replica-admission.js`, row `prototype_copy_bags` 60/59): the
  four admission methods are explicit-context functions;
  `PartitionService` carries four delegators; the bag export is deleted.
- **Identity-keyed module state** (row 89/87): the partition admission's
  `ACCEPTED_REQUESTS` WeakMap -> the service's own lazily created slot
  `acceptedReplicaAdmissionRequests`; the replace-owner wake's
  module-level `AUGMENTED_ENTRY_LEVEL` WeakMap -> a WeakMap inside the
  owner's wake state (`resolveReplaceOwnerEntryLevel(owner, entryLevel)`).
- **Two-source defaults** (row 1806/1789): seventeen copies of
  `cause?.reason || POLICY_READ_REASON.X` / `decision.reason || ...` in
  `table-policy-resolution.js`, `table-policy-service.js` and
  `priority-publication-safety-rows.js` -> one owner function
  `policyRefusalReason(refusal, stepReason)` in `table-policy-validation.js`
  (same values).
- **Catch-returns-default** (row 399/387), twelve sites re-expressed with
  the same behaviour: named outcome builders (`noLeaderWriteRefusal`,
  `hostFailureStatus`, `failedPolicyRowObservation`, `unreadableOperation`,
  `operationReadUnavailable`), the one steps-history parser
  (`memoizedParseStepsHistoryString`) in `participant-release-authorization-owner.js`
  and `replica-status.js` (unparsable -> no steps, same answers), a named
  cancellation error (`cancellationErrorOf`), the named
  `COMMITTED_READ_FAILED` outcome for a thrown committed read
  (serve-eligibility owner), an explicit placement check instead of a
  catch in `raft-rs-committed-peer-address.js` (the only throw it caught was
  the unplaced-peer refusal), and named failure transitions
  (`settleCreateAdmissionProgressFailure`, `settleUnstarted`).

### Test conflicts (72 files + 1 modify/delete)

- raft-rs-backend, convergence, message-group, node, integration (21
  files): the PR added `nodeId` to conf changes / probed by replica
  identity; the stream wraps port answers in named turns. Both kept:
  `turnChainValue(...)`, `.result`, `settledResult(...)` around the PR's
  arguments.
- rebalancer (29 files): the PR unified its readiness fixture
  (`createMockControlPlaneReadinessService` world port, `createMockCoordinator`
  with an explicit owner, `readinessFixture` options) and deleted the local
  `createMockReadinessService` copies; the stream wrapped hand fakes in
  `partialReadinessFake`/`readinessServiceFake` and passed owner clocks.
  Resolution: PR's fixture taken; it is completed by the stream's one
  completer (`createMockControlPlaneReadinessService` returns
  `readinessServiceFake(port, now)`; its `now` option is the owner clock the
  stream's B1 repair passes); every local `createTestRebalancer` and the
  shared one complete a named hand fake through `readinessServiceFake` on the
  rebalancer's clock. Frozen ports are caller-owned and never adapted (PR's
  custody witnesses), see `readiness-fixture-custody.test.js` below.
- control-plane (9 files): stream fixture routing kept; the PR's new
  witnesses kept and routed through `createReadinessServiceForTest` /
  `readinessCollaboratorFake(s)`.
- query (4), admin, distributed harness, topology, solve: union of both
  sides (imports, PR's new tests, stream's refusal witness for a
  non-boolean `has()`).
- `test/partition/partition-peer-cache-identity-record.test.js`: deleted by
  the PR together with the behaviour it covered; deletion accepted.
- Every `new ControlPlaneReadinessService(` the PR added in tests now calls
  `createReadinessServiceForTest(`.

Witnesses whose expectation changed in the merge, and why:

- `control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js`:
  the stream's "one memoized cluster publication read" witness is replaced by
  the PR's "splits publication diagnostics from recovery planning"
  (`['diagnostics', 'planning']`): the PR made the CL-019 memo serve the
  DIAGNOSTICS lane only, so the planning lane reads its own profile. PR
  behaviour wins.
- `control-plane-readiness-service-sync-and-priority-recovery.test.js`
  "priority recovery current sync evaluation closes recovery eligibility when a
  newer planning epoch clears priority blockers": deleted by the stream
  (reachable then only with a partial fake), kept by the PR; with the PR's
  lane split it is production-shaped again and is restored (re-wiring fake
  completed by `readinessCollaboratorFake`).
- `canonical-readiness-consumption.test.js`: the stream's refusal witnesses
  kept; the PR's "missing committed reader cannot turn positive cache rows
  into candidates" kept as a new subtest whose service answers no committed
  nodes (the required collaborator cannot be absent).
- `readiness-fixture-custody.test.js` (PR): "missing committed reader stays
  missing" now asserts the read refuses (TypeError) instead of answering
  `unavailable`: the reader is a required member, never probed, and the
  fixture never fabricates it for a frozen caller port.

## Budget (navigability table, `node scripts/checks/code-navigability-budget.js`)

Measured with the stream's script on an archive of the stream head 95877e60b
("stream") and on the alignment branch head ("aligned"). Caps unchanged.

| row | stream | aligned | cap/target | state |
| --- | ---: | ---: | ---: | --- |
| owner_port_feature_detection | 2020 | 2041 | 2130 | ok |
| owner_port_feature_detection_pilot_owners | 71 | 59 | 0 | open (fell) |
| identity_keyed_module_state | 87 | 87 | 87 | ok (89 before re-expression) |
| identity_keyed_module_state_admission_path | 3 | 3 | 0 | open |
| prototype_copy_bags | 59 | 59 | 59 | ok (60 before) |
| prototype_copy_bags_partition_service | 12 | 12 | 0 | open |
| inheritance_depth_over_two | 58 | 58 | 65 | ok |
| inheritance_depth_over_two_readiness | 0 | 0 | 0 | met |
| row_field_alias_reads | 745 | 736 | 745 | ok |
| formation_system_tables_without_decoder | 3 | 3 | 0 | open |
| state_read_defaults | 413 | 413 | 0 | open, no growth (424 before re-expression) |
| value_or_promise_then_checks | 0 | 0 | 0 | met (ESLint-promoted, clean) |
| source_directories_over_cap | 4 | 4 | 0 | open |
| stale_owner_indexes | null (archive) | 0 | 0 | met (indexes regenerated) |
| failure_bundle_log_windows_without_coverage | 0 | 0 | 0 | met |
| two_source_fallback_reads | 1785 | 1788 | 1789 | ok (1806 before) |
| typeof_dual_paths | 596 | 604 | 627 | ok |
| catch_returns_default | 387 | 387 | 387 | ok (399 before) |
| reexport_only_modules | 34 | 34 | 35 | ok |
| alias_exports | 38 | 38 | 0 | open |
| legacy_term_identifiers | 2924 | 2900 | 2924 | ok |
| fallback_sites_uncensused | 2768 | 2779 | 0 | open (+11: PR/main code, census quest's domain) |
| fallback_branches_* / fallback_sites_unclassified | null | null | 0 | open (census inputs absent) |

No capped row regresses past its cap. The navigability guideline audit's
per-pattern count baselines were re-identified with `--update-baseline`
(counts never raised; it refused state_read_defaults at 424 until the eleven
PR sites below were re-expressed): state_read_defaults back to 413 by reading
statuses as typed values with a named empty status (serve-eligibility
`readStatus`, membership reconcile `normalizeLowercaseStatus`, cache
`isActiveServiceStatus`, failed-create row check), one hoisted row step in
`dispatchOperationRow` (four copies -> one), and the replica's direct role read
as an explicit precedence. The audit baselines tightened on the way
(owner_port 2124 -> 2041, typeof 621 -> 604, row alias 745 -> 737,
inheritance 65 -> 58, alias exports 40 -> 38, legacy terms 2924 -> 2900).

## Checks

On the aligned tree (commit c82167e1e plus the duplication follow-up):

- `npx eslint src`: exit 0 (the promoted value_or_promise rule is clean).
- `npm run -s audit:guideline:navigability`: 0 violations, 9111 inherited.
- `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`: exit 0 (and the
  hook ran on both commits).
- `node scripts/check-fast-static.js`: ok.
- `npm run -s audit:file-size`: source 21/21, test 21/21 (test-helpers.js
  kept under 1500 lines).
- `npm run -s test:duplication`: OK; test baseline the lower of the two
  one-way baselines (PR 629/23689), tightened on the hint to 23624.
- Regenerated: test metadata (`test:metadata:refresh`), global owner debt
  inventory, priority-recovery owner inventory, the 57 src INDEX.md files,
  steering generated files (no diff).
- Local tests (node --test per file, 4 parallel, thermal-gated): the
  conflicted test files and their importers (357 files), then every test
  under rebalancer, control-plane, partition, raft/raft-rs-backend, query,
  node, message-group plus every non-integration test file the merge
  changed (1169 files). Every red was re-run on the aligned tree and on a
  `git archive` of the PR head 343c56965 on the same machine:
  - merge-caused and fixed (fixture routing, see below): 21 files, all green
    after the fix (cluster-health diagnostics, sync-and-priority-recovery,
    partition-rebalancer x3, replica-admission-from-committed-operation,
    learner-promotion-proof-committed-admission, cl-029,
    readiness-fixture-custody, unified-rebalancer node-readiness and
    node-state-change, readiness-per-change-reuse,
    readiness-planning-snapshot-identity-owner,
    replica-dispatch-startup-operation-replay,
    message-group-peer-address-committed-configuration,
    completed-placement-autonomous-progress, critical-topology-committed-lease,
    stopping-reconcile and its source-handoff twin, log-collector).
  - identical red on the PR head locally (same pass/fail counts): 39 files,
    e.g. replace-owner-wake 121/43, replace-replica-workflow 213/31,
    committed-node-remove-safety 39/55, split-merge-hysteresis 39/17,
    sql-query-engine-provisioning-parent-deadline 8/8,
    committed-membership-census 8/1, replica-handler 360/1,
    rebalance-coordinator-outcome-routing (70/5 aligned vs 70/8 at the PR
    head), replace-named-handoff-attempt (7/16 both),
    rebalance-budget-enforcement.property (seeded property, red on both).

## Lab

- Fleet first (holder `claude:nav-align` via `LAGRANGE_LAB_AGENT`).
  `lab test changed --lane all --sha <aligned> --base-sha 343c56965` was
  refused before any test ("MODULAR PROOF NOT SAFE: RELEASE_PROOF_REQUIRED",
  the merge changes package.json `files`), so the run is the whole suite:
  `node scripts/lab.js test all --lane all --sha c82167e1ed56a219b566e7450beb4388fe6a19bd --on adam-laptop`
  (detached). Result: 2618 files, **2544 pass, 74 fail**, 102122 assertions
  (77 failing records, 3 of them generated `test-output/tap-timeout-fixtures`
  files written by a runner test, not repository tests).
- A PR-head baseline on the lab (`lab test all --sha 343c56965 --on
  lenovo-laptop`) died at placement: "the commit's generated metadata is
  stale; regenerate and commit test/shards/impact-graph-seal.json" (the
  committed seal of 343c56965), 2602 files with no result, exit 97. The
  PR-head comparison is therefore local, same machine: every lab red was
  re-run on the aligned tree and on a `git archive` of 343c56965 (and, for
  the git-dependent `solve-footprint-accounting`, a git checkout of
  343c56965 and of 95877e60b).

| class | files | evidence |
| --- | ---: | --- |
| merge-caused | 2 | `quorum-conditioned-remove-safety` (134/4 vs 150/0 at the PR head), `replace-real-group-retire-route` (5/5 vs 10/0): caused by c82167e1e completing the PR's `createPublishedPlanningReadinessService`, which is passed as world-port callbacks; fixed in d176db0da (both green locally: 150/0, 10/0). |
| red on the stream head | 2 | `minimal-deployment-call-cell-invocation-live`, `minimal-deployment-runtime-access-policy-live-validation`: green at the PR head, red at 95877e60b with the same refusal ("ControlPlaneReadinessService refused construction: messageRouter must be an object with on()"): the test's minimal live router meets the stream's late-bound collaborator validation through ControlPlaneSetup. Not caused by this merge; recorded for the readiness owner (R17). |
| lab host / timing (green locally on the aligned tree and on the PR head) | 11 | admin-websocket-api-control-snapshot-query, admin-websocket-api-diagnostics-and-control-snapshot, cdc-group-propagation-foreground-boundary, message-group-native-provisional-route, bootstrap-epoch-manager-lifecycle, bootstrap-sequence, node-bootstrap-consistency.property, cdc-source-occurrence-delivery.integration, create-table-partition-provisioning.integration, raft-leader-election.integration (bootstrap+election 25.5 s over a 20 s budget on the host), three-node-seed-rebalance.integration (9/0 aligned locally). |
| time out locally on both (600 s) | 2 | dt6-operation-ledger-self-move-hold-engagement, dt6-operation-ledger-self-move-hold-fairness. |
| red on the PR head (same counts locally, aligned vs 343c56965) | 57 | `active-gate/active-gate-authoritative-repair-convergence.test.js`, `bootstrap/join-resume-replica-lifecycle-owner.test.js`, `convergence/dt6-authoritative-observation-watermark.test.js`, `convergence/dt6-voter-surplus-promotion-drain-livelock.test.js`, `convergence/dt-formation-barrier-spread-release-oscillation.test.js`, `convergence/dt-formation-priority-placement-before-active.test.js`, `convergence/dt-ledger-completion-continuity-discriminator.test.js`, `integration/authoritative-discovery-repair-pressure.integration.test.js`, `integration/leader-metadata-validation.integration.test.js`, `integration/managed-split-admission-reliability.integration.test.js`, `integration/pgwire-bootstrap.integration.test.js`, `integration/seed-node-bootstrap.integration.test.js`, `node/replica-handler.test.js`, `partition/child-partition-leader-propagation.test.js`, `partition/merge-auto-execution.test.js`, `partition/partition-deferred-evaluation-obligation-scheduler.test.js`, `partition/split-merge-hysteresis.test.js`, `query/cache-based-routing.property.test.js`, `query/cache-based-routing.test.js`, `query/queryable-core-j2-sql-key-read-journey.test.js`, `query/service-read-locality-routing.test.js`, `query/sql-query-engine-provisioning-parent-deadline.test.js`, `query/sql-query-engine-provision-ledger-hold-transient-wait.test.js`, `query/sql-query-engine-provision-progress-gated-rewait.test.js`, `raft/raft-rs-backend/committed-membership-census.test.js`, `rebalancer/committed-node-remove-safety.test.js`, `rebalancer/committed-node-remove-safety-wake.test.js`, `rebalancer/coordinator-created-operation-progress.test.js`, `rebalancer/formation-ledger-spread-voter-ready-readiness.test.js`, `rebalancer/ledger-quorum-spread-hold-cure-drain-admission.test.js`, `rebalancer/operation-workflow-remove-safety-concurrent-down-target.test.js`, `rebalancer/operation-workflow-remove-safety-concurrent-stale-phantom.test.js`, `rebalancer/operation-workflow-remove-safety-universal-floor.test.js`, `rebalancer/rebalance-budget-enforcement.property.test.js`, `rebalancer/rebalance-coordinator-outcome-routing.test.js`, `rebalancer/rebalancer-entity-interaction-contract.test.js`, `rebalancer/replace-named-handoff-attempt.test.js`, `rebalancer/replace-owner-lease-causal.test.js`, `rebalancer/replace-owner-recovery-equivalence.test.js`, `rebalancer/replace-owner-wake.test.js`, `rebalancer/replace-real-group-completion.test.js`, `rebalancer/replace-real-group-d2.test.js`, `rebalancer/replace-real-group-deposed-leader.test.js`, `rebalancer/replace-real-group-handoff.test.js`, `rebalancer/replace-real-group-latency.test.js`, `rebalancer/replace-real-group-scheduling.test.js`, `rebalancer/replace-remove-safety-post-intent.test.js`, `rebalancer/replace-replica-workflow.test.js`, `rebalancer/replica-retirement-terminal-actuals-coherence.test.js`, `rebalancer/unified-rebalancer-affinity-policy-refetch-parity.test.js`, `rebalancer/user-table-leader-placement-cure.test.js`, `runtime/movielens-formation-probe-wiring.test.js`, `scripts/check-operation-dispatch-completion-owner.test.js`, `scripts/solve-footprint-accounting.test.js`, `service/minimal-deployment-request-binding-compilation-owner-guard.test.js`, `simulation/formation-sim-attribution-isolation.test.js`, `simulation/formation-sim-runner.test.js`. |

Integration lane notes: `multi-node-cluster.integration` (conflict
resolved here) and `failure-scenarios.integration` pass on the host.

## Impact on in-flight quests

Trial merges of each in-flight worktree's current state (`git stash create`
of the worktree, i.e. committed plus uncommitted tracked changes) into the
merge commit 7b65d016b, in a scratch worktree; listed are the files that
conflict. Generated files (INDEX.md, test/shards, inventories) excluded:
regenerate them after the merge.

### priority-recovery-owner-read-snapshot-await (prfix, worktree lagrange-nav-prfix-20261108)

The PR already did the quest's core change: `resolvePriorityRecoveryPlanningSnapshotForOwnerRead`
(replica-operation-repository-visibility-methods.js) now reads the
synchronous planning answer through the canonical reader
`readPriorityRecoveryPlanningAnswerSync`, so its callers receive a settled
snapshot (receipt `owner-read-deferral-reads-a-settled-snapshot`: the
behaviour is in tree; the quest's witness that owner-read deferral reads as
active when the settled snapshot says so is still owed, no such witness
exists in the PR). The alias family collapsed partly: the PR deleted
`getMembershipPublicationPlanningSnapshotBestEffort`; one async name
`getPriorityRecoveryPlanningSnapshotBestEffort` remains as the AVAILABLE
surface delegating to the answer, with three consumers
(priority-recovery-planning-read.js, membership-publication-coordinator-planning.js,
startup-authority-health) and two probes on it (planning-read
`hasAvailablePriorityRecoveryPlanningProvider`, coordinator-planning).
Receipt `best-effort-alias-family-collapsed` therefore narrows to: delete
or rename that last name and its two probes. The quest's `behaviour-change-named`
constraint is now the PR's change; the quest should re-seal against the
remaining work (R09: supersede, do not reinterpret).

Conflicts: src `src/control-plane/control-plane-readiness-publication-planning-snapshot.js`, `src/control-plane/control-plane-readiness-service.js`, `src/control-plane/membership-publication-coordinator-planning.js`, `src/rebalancer/priority-recovery-planning-read.js`, `src/rebalancer/replica-operation-repository-visibility-methods.js`, `src/rebalancer/unified-rebalancer-available-nodes.js`; scripts `scripts/check-duplication.js`, `scripts/check-guideline-navigability-baseline-owner_port_feature_detection.json`;
39 test files (the rebalancer readiness fakes the PR unified;
take the PR's fixture and drop the fake rewrites the PR made redundant).

### partition-service-constructor-injection (worktree lagrange-nav-partition-20261108)

Conflicts: src `src/partition/partition-service-assembly.js`, `src/partition/partition-service-core-base.js`, `src/partition/partition-service-learner-promotion-count-check-methods.js`, `src/partition/partition-service-learner-promotion-methods.js`, `src/partition/partition-service-learner-promotion-proof-methods.js`, `src/partition/partition-service-learner-promotion-wake-methods.js`, `src/partition/partition-service-lifecycle-methods.js`, `src/partition/partition-service-merge-replication-methods.js`, `src/partition/partition-service-metadata-delivery-methods.js`, `src/partition/partition-service-metadata-mutation-helpers.js`, `src/partition/partition-service-raft-init-base.js`, `src/partition/partition-service-raft-membership-administration.js`, `src/partition/partition-service-raft-peer-cache-reconciliation.js`, `src/partition/partition-service-remote-query-methods.js`, `src/partition/partition-service-split-accessor-base.js`, `src/raft/raft-rs-group-membership-admission.js`; scripts `scripts/check-duplication.js`, `scripts/check-guideline-navigability-baseline-identity_keyed_module_state.json`, `scripts/check-guideline-navigability-baseline-owner_port_feature_detection.json`, `scripts/check-guideline-navigability-baseline-prototype_copy_bags.json`, `scripts/check-guideline-navigability-baseline-typeof_dual_paths.json`;
15 test files: `test/convergence/dt6-learner-promotion-fixture.js`, `test/partition/participant-release-query-engine-fixture.js`, `test/partition/partition-admitted-group-fixture.js`, `test/partition/partition-peer-cache-identity-record.test.js`, `test/partition/partition-rebalancer-leadership-readiness-hysteresis.test.js`, `test/partition/partition-rebalancer-readiness-edge-gate.test.js`, `test/partition/partition-service-learner-promotion.test.js`, `test/partition/partition-service-role-metadata-publication.test.js`, `test/partition/partition-service-size-split-transport.test.js`, `test/partition/partition-service-stale-topology-write-guard.test.js`, `test/partition/partition-service-transactions-query-routing.test.js`, `test/partition/partition-service.test.js`, `test/raft/raft-rs-backend/committed-membership-harness.js`, `test/raft/raft-rs-backend/startup-cleanup-native-fixture.js`, `test/simulation/formation-sim-consensus-cohort.js`.
Note `partition-service-assembly.js`: the replica-admission bag is now four
class delegators on `PartitionService` (explicit-context functions in
partition-replica-admission.js); the quest's flattening extends that shape.
`partition-peer-cache-identity-record.test.js` is deleted on the aligned
stream (the PR removed the behaviour).

### nav-state-read-named-defaults (worktree lagrange-nav-defaults-20261108)

Conflicts: src `src/admin/admin-control-snapshot-local-build-base.js`, `src/admin/admin-control-snapshot-node-view-projection.js`, `src/admin/admin-control-snapshot.js`, `src/control-plane/node-liveness-semantic-projection.js`, `src/control-plane/replica-dispatch-operation-execution.js`, `src/node/replica-create-admission-retained-recovery.js`, `src/partition/partition-service-learner-promotion-methods.js`, `src/rebalancer/move-planner-state-methods.js`, `src/rebalancer/operation-workflow-dispatch-rearm-evidence.js`, `src/rebalancer/operation-workflow-recovery-observation.js`, `src/rebalancer/operation-workflow-replace-owner-wake.js`, `src/rebalancer/priority-surplus-remove-placement-fence.js`, `src/rebalancer/replica-operation-repository-visibility-methods.js`; scripts `scripts/check-complexity.js`, `scripts/check-duplication.js`, `scripts/check-guideline-navigability-baseline-row_field_alias_reads.json`, `scripts/check-guideline-navigability-baseline-state_read_defaults.json`, `scripts/check-guideline-navigability-baseline-two_source_fallback_reads.json`.
The alignment already re-expressed eleven PR state-read defaults (see Budget);
the quest re-measures its row on the aligned stream (413).

### system-table-row-decoders (worktree lagrange-nav-decoders-20261108)

Conflicts: src `src/admin/admin-control-snapshot-local-build-base.js`, `src/rebalancer/move-planner-state-methods.js`, `src/rebalancer/priority-surplus-remove-placement-fence.js`, `src/rebalancer/unified-rebalancer-critical-topology-methods.js`; scripts `scripts/check-duplication.js`, `scripts/check-guideline-navigability-baseline-catch_returns_default.json`, `scripts/check-guideline-navigability-baseline-row_field_alias_reads.json`, `scripts/check-guideline-navigability-baseline-state_read_defaults.json`, `scripts/check-guideline-navigability-baseline-two_source_fallback_reads.json`;
31 test files: `test/admin/admin-websocket-api-diagnostics-and-control-snapshot.test.js`, `test/admin/admin-websocket-api-test-support.js`, `test/cdc/cdc-integration-service-mutations-and-epoch.test.js`, `test/control-plane/readiness-planning-deferral-bounded.test.js`, `test/control-plane/readiness-planning-snapshot-identity-owner.test.js`, `test/control-plane/readiness-routing-heartbeat-window.test.js`, `test/convergence/dt-movielens-raft-peer-cohort-pruning-election.test.js`, `test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js`, `test/message-group/message-group-service-strict-cdc-forward-routing.test.js`, `test/node/replica-create-admission-recovery.test.js`, `test/partition/participant-release-query-engine-fixture.js`, `test/partition/partition-port-refusal-outcomes.test.js`, `test/partition/partition-service-size-split-transport.test.js`, `test/partition/partition-service-transactions-query-routing.test.js`, `test/raft/raft-rs-backend/committed-membership-harness.js`, `test/raft/raft-rs-backend/partition-peer-admission.test.js`, `test/rebalancer/cl-029-target-completion-evidence-retry-owner.test.js`, `test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js`, `test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js`, `test/rebalancer/ledger-quorum-spread-hold-cure-drain-admission.test.js`, `test/rebalancer/planner-target-authority-divergence-probe.test.js`, `test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`, `test/rebalancer/rebalance-coordinator-topology-guard.test.js`, `test/rebalancer/remove-active-dispatch-redrive.test.js`, `test/rebalancer/startup-authority-topology-settling-contract.test.js`, `test/rebalancer/topology-settling-node-ready-lease-wake.test.js`, `test/rebalancer/unified-rebalancer-node-readiness-replica-state.test.js`, `test/rebalancer/unified-rebalancer-test-support.js`, `test/rebalancer/unified-rebalancer-triggers-critical-deferral.test.js`, `test/rebalancer/unified-rebalancer-triggers-priority-recovery-cache-bypass.test.js`, `test/runtime/runtime-replica-state-projection-wiring.test.js`.
The PR added status reads the decoders should own
(serve-eligibility-record-decision `readStatus`, completed-priority-placement
`normalizeServiceStatus`, membership reconcile `normalizeLowercaseStatus`,
cache `isActiveServiceStatus`).

### Scripts every in-flight branch will touch

The navigability audit baselines were re-identified on this branch;
each quest re-runs `node scripts/check-guideline-navigability.js --update-baseline`
after its merge instead of hand-merging the JSON, and takes the lower
duplication baseline.

## Verifier's model

What the verifier should be able to check without trusting this note:

1. Parents: `git log -1 --format=%P 7b65d016b` is 95877e60b and 343c56965.
2. PR behaviour survives: for each src conflict above, `git diff
   e29e295a6 343c56965 -- <file>` (the PR's change) is present in the
   aligned file, in module-function form for the readiness tier files
   (`this.` -> `service.`). Key spots: `buildDimensionsEvaluation` uses
   `answerServeEligibility`; `hasServeEligibleControlPlaneService` answers
   false for no rows; the diagnostics memo is DIAGNOSTICS-lane only; the
   direct-publication sync planning answer is remembered; the owner read in
   replica-operation-repository-visibility-methods.js reads the canonical
   sync answer; `buildMembershipPublicationProtocolInput` exists.
3. Stream structure survives: `ControlPlaneReadinessService` has no
   `extends` and no new installer (`grep -n install
   src/control-plane/control-plane-readiness-service.js` lists the six
   inherited installers only; the snapshot-store installer no longer
   installs the serve-eligibility methods); `inheritance_depth_over_two_readiness`
   = 0; `value_or_promise_then_checks` = 0 and `npx eslint src` clean;
   `grep -rn "typeof .*answerCommittedNodes\|typeof .*readServeEligibility\|typeof .*subscribeServeEligibility\|hasPriorityRecoveryPlanningAnswerSync" src`
   finds nothing in rebalancer owners or the canonical reader.
4. Budget: run the budget script on the aligned head and on an archive of
   95877e60b; no capped row exceeds its cap; compare with the table above.
5. Known-bad input: revert one re-expression (e.g. restore the
   `ACCEPTED_REQUESTS` WeakMap in partition-replica-admission.js) and the
   budget row `identity_keyed_module_state` goes OVER (88/87) and the
   pre-commit hook fails on the navigability audit.
6. Witness changes: the four listed under "Witnesses whose expectation
   changed" are the only assertion changes; every other test edit is
   fixture construction (`git diff 343c56965 HEAD -- test` restricted to
   files the stream never touched shows only fixture routing).
7. Lab: the lab section's reds are each either green locally on the
   aligned tree or red with the same counts on the PR head.

Judgement calls a verifier should weigh: (a) the frozen-port rule in
`readinessServiceFake` (a frozen caller port is not completed) reconciles
the PR's custody witnesses with the stream's completer; (b)
`policyRefusalReason` collapses seventeen identical `reason || STEP_REASON`
expressions into one owner function - one version of the logic, which is
also what brings two_source_fallback_reads under its cap; (c) the PR's
witness "missing committed reader stays missing" now asserts a TypeError
(the reader is a required member); (d) the query owners' new probes on an
optional readiness service were left as found and are recorded here.

## PR head c8215e322

PR #201 moved one commit past the aligned 343c56965. Merged as db88766dc
(parents 87c49877d, c8215e322). The commit ("preserve system-table SELECT
provenance, admit boot load-lane via admin-meta, and start all nodes before
joiner /readyz") changes:

- `src/query/query-executor-base.js` `executeSelect`: computes the table name
  once before fan-out, passes it to `executeOnPartitions` (was `ast.table`,
  always undefined for a SELECT) and to the authoritative observation (was
  `ast?.table || ast?.from`, i.e. the `from` object), and prefers the leader
  for system tables (`INITIAL_PARTITION_IDS[tableName]`).
- `src/admin/admin-websocket-load-lane-admission.js`,
  `admin-websocket-local-observation-methods.js`,
  `parallel-query-partition-outcomes.js`: boot load-lane admission via
  admin-meta and failure snapshot carry-through.
- harness `real-product-deployer-lagrange.js`: start every joining node
  before polling a joiner's `/readyz`; witnesses in the topology test and the
  product-answers fixture; admin and query-executor witnesses.

The pre-commit hook refused the merge with three violations from that
commit; each was re-expressed, no baseline moved:

1. and 2. ambient intrinsics, `real-product-cluster-deployer-topology.test.js`:
   two `calls.findIndex(...)` became `arrayFindIndex(calls, ...)` from
   `real-product-captured-intrinsics.js` (the file already imports its
   siblings from there). `arrayFindIndex` is
   `Function.call.bind(Array.prototype.findIndex)` captured at module load,
   so the result is identical on an unmodified prototype.
3. `two_source_fallback_reads` at `executeSelect`:
   `ast?.table || ast?.from?.name || (typeof ast?.from === 'string' ?
   ast.from : null)` became one named owner, `resolveSelectTableName(ast)` =
   `ast?.from?.name || null`. Equivalence: the parser's SELECT shape
   (`convertSelect`/`convertFrom`) never sets a top-level `table` and never
   produces a string `from`; `from` is an object (`name` null for a derived
   table) or null without FROM. The only non-parser caller,
   `buildMatchingPkSelectAst` (locking reads), builds `{from: {name}}`.
   Top-level `table` is the INSERT/UPDATE/DELETE shape, which never reaches
   `executeSelect`. So both expressions yield the same value for every AST
   that reaches this point. Witness: `sql-parser.test.js` "SELECT names its
   base table only as from.name" (plain, JOIN, UNION, CTE, derived table,
   FROM-less; sqlite and postgresql dialects; DML carries `table` and no
   `from`). `executeSelect` complexity went from 36 to 29.

Checks on db88766dc: PR-changed tests plus their importers, the query
executor, parser, system-table local-read, engine-execution and locking-read
tests all green locally; `node scripts/check-fast-static.js` exit 0;
`npx eslint src` exit 0.
