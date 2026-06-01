# Runtime Contract Hardening and Explicit State Elimination Sprint (AGPL)

## Goal

Remove implicit absence-based runtime contracts from the AGPL system by
forbidding `null` and `undefined` in domain/state presentation, replacing them
with explicit state models and normalized contract variants inside existing
owners and services.

This sprint is not cosmetic cleanup. It is contract hardening aligned with the
implementation doctrine and system guidelines:

1. one concern gets one canonical adjudicator
2. branch piles become explicit state models
3. weaker evidence must not silently promote blocked or unknown state
4. raw boundary ambiguity must be normalized before it enters runtime logic

## Why This Sprint Exists

The current audit shows that `null` and `undefined` are still broadly allowed
inside runtime code, not only at raw boundaries.

Audit summary:
1. `432` files under `src/` contain `null` or `undefined`
2. `assignNull`: `3117`
3. `orNull`: `2504`
4. `returnNull`: `1014`
5. `eqNull`: `515`
6. `eqUndef`: `373`

The highest-risk files are not adapters. They are core domain/runtime owners:
1. `src/control-plane/control-plane-readiness-service.js`
2. `src/control-plane/control-plane-system-table-gateway.js`
3. `src/control-plane/membership-publication-coordinator.js`
4. `src/bootstrap/bootstrap-api.js`
5. `src/partition/partition-service.js`
6. `src/query/sql-query-engine.js`
7. `src/query/query-executor.js`
8. `src/rebalancer/unified-rebalancer.js`
9. `src/admin/admin-control-snapshot.js`

That is a doctrine problem, not just a style problem. The current system still
allows absence to masquerade as state.

## Doctrine and System-Guideline Basis

Relevant doctrine rule:
- [../.kiro/steering/doctrine.md](../../.kiro/steering/doctrine.md):
  “Replace the branch pile with an explicit state model and decision table.”

Contract-hardening rules for this sprint:
1. No `null` in domain/state contracts.
2. No `undefined` in domain/state contracts.
3. No `|| null`, `?? null`, or `return null` in owner/service APIs.
4. Raw boundaries may physically see `null` or `undefined`, but they must
   normalize immediately at ingress.
5. No state presentation may rely on absence. Every state must be explicitly
   named and carried.
6. Reuse and extend existing owners/services only. Do not add a parallel
   framework or new architecture layer.

## Scope Basis

Roadmap and AGPL-scoped rows:
1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Relationship to Active Work

This sprint hardens the contract foundation underneath:
1. [Seed Startup Authority and Initial Publication Establishment Sprint](../sprints/active-2026-q2-seed-startup-authority-and-initial-publication-establishment.md)
2. [Runtime Completion Contracts and Owner Simplification Sprint](../sprints/archived/done-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

Those sprints exposed and reduced ambiguity. This sprint removes the remaining
absence-based contract vocabulary that still lets ambiguity back into runtime
logic.

## Sprint Umbrella

1. [Benchmark usable-spread owner collapse](../../packages/archived/done-20260417-benchmark-usable-spread-owner-collapse.md)
2. [Canonical convergence diagnostics emission](../../packages/archived/done-20260417-canonical-convergence-diagnostics-emission.md)
3. [Distributed boundary-transition scenario layer](../packages/active-20260415-distributed-boundary-transition-scenario-layer.md)
4. [Owner-map and architecture boundary catalog](../../packages/archived/done-20260417-owner-map-and-architecture-boundary-catalog.md)
5. [Structured deferred-outcome doctrine and audit](../../packages/archived/done-20260417-structured-deferred-outcome-doctrine-and-audit.md)
6. [Startup and control-plane contract hardening](../packages/active-20260412-startup-and-control-plane-contract-hardening.md)
7. [Partition and query runtime explicit-state hardening](../packages/active-20260412-partition-and-query-runtime-explicit-state-hardening.md)
8. [Rebalancer and workflow coordination contract hardening](../packages/active-20260412-rebalancer-and-workflow-coordination-contract-hardening.md)
9. [Admin and bootstrap response contract hardening](../packages/active-20260412-admin-and-bootstrap-response-contract-hardening.md)
10. [Boundary normalizer hardening for null and undefined ingress](../packages/active-20260412-boundary-normalizer-hardening-for-null-and-undefined-ingress.md)
11. [Message-group Raft runtime owner collapse](../packages/active-20260413-message-group-raft-runtime-owner-collapse.md)
12. [Benchmark partition convergence owner collapse](../../packages/archived/done-20260417-benchmark-partition-convergence-owner-collapse.md)
13. [Benchmark load-node availability and dispatch owner collapse](../packages/active-20260415-benchmark-load-node-availability-and-dispatch-owner-collapse.md)
14. [Benchmark partitioning dispatch contribution owner collapse](../packages/active-20260415-benchmark-partitioning-dispatch-contribution-owner-collapse.md)
15. [Priority recovery completion owner collapse](../packages/active-20260415-priority-recovery-completion-owner-collapse.md)
16. [Priority recovery overflow completion owner collapse](../packages/active-20260415-priority-recovery-overflow-completion-owner-collapse.md)
17. [Recovery write-candidate selection owner collapse](../packages/active-20260415-recovery-write-candidate-selection-owner-collapse.md)
18. [Control-plane leader-service gap recovery owner collapse](../packages/active-20260415-control-plane-leader-service-gap-recovery-owner-collapse.md)
19. [Canonical leader-identity recovery owner collapse](../packages/active-20260415-canonical-leader-identity-recovery-owner-collapse.md)
20. [Node lifecycle transition-outcome owner collapse](../packages/active-20260415-node-lifecycle-transition-outcome-owner-collapse.md)
21. [Benchmark table bootstrap timeout-budget owner collapse](../packages/active-20260415-benchmark-table-bootstrap-timeout-budget-owner-collapse.md)
22. [TAP worker code-cache stability](../packages/active-20260415-tap-worker-code-cache-stability.md)
23. [Constants-owner and magic-literal guideline violation detection](../../packages/archived/done-20260412-constants-owner-and-magic-literal-guideline-violation-detection.md)
24. [Query magic-literal cleanup batch 1](../../packages/archived/done-20260412-query-magic-literal-cleanup-batch-1.md)
25. [Query magic-literal cleanup batch 2](../../packages/archived/done-20260412-query-magic-literal-cleanup-batch-2.md)
26. [Steering hardening for generation contracts](../../packages/archived/done-20260412-steering-hardening-for-generation-contracts.md)
27. [Decision-boundary guideline violation detection](../../packages/archived/done-20260412-decision-boundary-guideline-violation-detection.md)
28. [Bootstrap and runtime guideline cleanup batch 1](../../packages/archived/done-20260412-bootstrap-and-runtime-guideline-cleanup-batch-1.md)
29. [Query and partition decision-boundary follow-on cleanup](../../packages/archived/done-20260412-query-and-partition-decision-boundary-follow-on-cleanup.md)
30. [Repo-wide decision-boundary zero-out pass](../../packages/archived/done-20260413-repo-wide-decision-boundary-zero-out-pass.md)

## Priority Order

1. Canonical shared owner snapshots for active distributed boundaries
2. Canonical diagnostics emission from those owner snapshots
3. Boundary-transition scenario tests between unit and full harness scope
4. Owner-map and architecture boundary catalog hardening
5. Structured deferred-outcome doctrine, testing policy, and audit hardening
6. Startup/control-plane owners
7. Partition/query runtime
8. Rebalancer/workflow coordination
9. Admin/bootstrap response shaping
10. Boundary normalizers
11. Constants/magic-literal detection and audit
12. Query cleanup batches driven by the literal audit
13. Larger hotspot cleanup after the mechanical query batches
14. Steering hardening so future code generation follows the contracts more reliably
15. Decision-boundary cleanup batches driven by a deterministic heuristic audit

## Simplification Rules

1. Replace nullable phase signaling with explicit variants.
2. Replace nullable snapshots with explicit state objects.
3. Replace sentinel `return null` with explicit result types or named states.
4. Make required dependencies required.
5. Where capability is optional, model capability explicitly instead of storing
   `null`.
6. Do not solve contract ambiguity with more boolean flags.
7. Do not introduce a new layer; sharpen existing owners.

## Completed-When Architecture

At sprint exit:
1. startup/control-plane state is explicit and non-nullable
2. core runtime services do not expose absence-based state contracts
3. rebalancer/workflow coordination consumes explicit repository and runtime states
4. admin/bootstrap payloads present named states instead of nullable bags
5. raw ingress points normalize `null` and `undefined` before returning into runtime code

## Recently Archived Packages

1. [Control-Plane Critical Traffic Isolation And Observability Backlog Containment](../../packages/archived/done-20260416-control-plane-critical-traffic-isolation-and-observability-backlog-containment.md)
2. [Control-Plane Snapshot Owner And Repair-Lane Separation](../../packages/archived/done-20260416-control-plane-snapshot-owner-and-repair-lane-separation.md)
3. [Control-Plane Pressure Amplification Boundary-Transition Scenarios](../../packages/archived/done-20260416-control-plane-pressure-amplification-boundary-transition-scenarios.md)
4. [Message-Group Leader Identity And Strict CDC Forwarding Convergence](../../packages/archived/done-20260416-message-group-leader-identity-and-strict-cdc-forwarding-convergence.md)
5. [Revisioned Control-Plane Snapshot And Watch-Resume Contract](../../packages/archived/done-20260416-revisioned-control-plane-snapshot-and-watch-resume-contract.md)
6. [Join And Rejoin Promotion State Machine](../../packages/archived/done-20260416-join-and-rejoin-promotion-state-machine.md)
7. [Canonical Leader Identity Owner Unification](../../packages/archived/done-20260416-canonical-leader-identity-owner-unification.md)
8. [Control-Plane Priority And Fairness Contract Unification](../../packages/archived/done-20260416-control-plane-priority-and-fairness-contract-unification.md)
9. [Benchmark partition convergence owner collapse](../../packages/archived/done-20260417-benchmark-partition-convergence-owner-collapse.md)
10. [Benchmark usable-spread owner collapse](../../packages/archived/done-20260417-benchmark-usable-spread-owner-collapse.md)
11. [Canonical convergence diagnostics emission](../../packages/archived/done-20260417-canonical-convergence-diagnostics-emission.md)
12. [Owner-map and architecture boundary catalog](../../packages/archived/done-20260417-owner-map-and-architecture-boundary-catalog.md)
13. [Structured deferred-outcome doctrine and audit](../../packages/archived/done-20260417-structured-deferred-outcome-doctrine-and-audit.md)
14. [Contract Inversion Boundary Taxonomy](../../packages/archived/done-20260417-contract-inversion-boundary-taxonomy.md)
15. [Contract Inversion Shared Outcome Kernel](../../packages/archived/done-20260417-contract-inversion-shared-outcome-kernel.md)

## Active Queue

1. [Node-State Recovery Publication Coalescing](../packages/active-20260416-node-state-recovery-publication-coalescing.md)
2. [Authoritative Operation Visibility Under Pressure](../packages/active-20260416-authoritative-operation-visibility-under-pressure.md)
3. [Critical Control-Partition Stability Gate For Benchmark Growth](../packages/active-20260416-critical-control-partition-stability-gate-for-benchmark-growth.md)
4. [Contract Inversion Control-Plane Mutation And Visibility Cutover](../packages/active-20260416-contract-inversion-control-plane-mutation-and-visibility-cutover.md)
5. [Contract Inversion Readiness Admission And Load Cutover](../packages/active-20260416-contract-inversion-readiness-admission-and-load-cutover.md)
6. [Contract Inversion Protocol Phase Containment](../packages/active-20260416-contract-inversion-protocol-phase-containment.md)
7. [Contract Inversion Diagnostics And Metrics Reframe](../packages/active-20260416-contract-inversion-diagnostics-and-metrics-reframe.md)
8. [Contract Inversion Boundary Test Layer Rewrite](../packages/active-20260416-contract-inversion-boundary-test-layer-rewrite.md)
9. [Contract Inversion Deletion Pass](../packages/active-20260416-contract-inversion-deletion-pass.md)
10. [Distributed boundary-transition scenario layer](../packages/active-20260415-distributed-boundary-transition-scenario-layer.md)
11. [Startup and control-plane contract hardening](../packages/active-20260412-startup-and-control-plane-contract-hardening.md)
12. [Partition and query runtime explicit-state hardening](../packages/active-20260412-partition-and-query-runtime-explicit-state-hardening.md)
13. [Rebalancer and workflow coordination contract hardening](../packages/active-20260412-rebalancer-and-workflow-coordination-contract-hardening.md)
14. [Admin and bootstrap response contract hardening](../packages/active-20260412-admin-and-bootstrap-response-contract-hardening.md)
15. [Boundary normalizer hardening for null and undefined ingress](../packages/active-20260412-boundary-normalizer-hardening-for-null-and-undefined-ingress.md)
16. [Message-group Raft runtime owner collapse](../packages/active-20260413-message-group-raft-runtime-owner-collapse.md)
17. [Benchmark load-node availability and dispatch owner collapse](../packages/active-20260415-benchmark-load-node-availability-and-dispatch-owner-collapse.md)
18. [Benchmark partitioning dispatch contribution owner collapse](../packages/active-20260415-benchmark-partitioning-dispatch-contribution-owner-collapse.md)
19. [Priority recovery completion owner collapse](../packages/active-20260415-priority-recovery-completion-owner-collapse.md)
20. [Priority recovery overflow completion owner collapse](../packages/active-20260415-priority-recovery-overflow-completion-owner-collapse.md)
21. [Recovery write-candidate selection owner collapse](../packages/active-20260415-recovery-write-candidate-selection-owner-collapse.md)
22. [Control-plane leader-service gap recovery owner collapse](../packages/active-20260415-control-plane-leader-service-gap-recovery-owner-collapse.md)
23. [Canonical leader-identity recovery owner collapse](../packages/active-20260415-canonical-leader-identity-recovery-owner-collapse.md)
24. [Node lifecycle transition-outcome owner collapse](../packages/active-20260415-node-lifecycle-transition-outcome-owner-collapse.md)
25. [Benchmark table bootstrap timeout-budget owner collapse](../packages/active-20260415-benchmark-table-bootstrap-timeout-budget-owner-collapse.md)
26. [TAP worker code-cache stability](../packages/active-20260415-tap-worker-code-cache-stability.md)

## Architectural Closure Follow-on

The April 16 architecture-closure tranche is now completed and archived in the
package archive. New work in this sprint should treat those packages as closed
owner baselines rather than partially active follow-on slices.


## 2026-04-16 load-stability reset

The latest seven-node checkpoint confirmed a narrower but still systemic
late failure family: control-plane pressure amplification under load.

The next execution slices are therefore reprioritized before further local
symptom work:

1. isolate critical control-plane traffic and stop contained observability
   backlog from degrading the same hard readiness dependency as true critical
   write loss
2. coalesce repeated node-state recovery publications instead of letting them
   amplify backlog
3. replace timeout-shaped operation visibility with one authoritative
   pending/deferred contract
4. gate benchmark growth on explicit critical control-partition stability
5. reproduce this exact chain in the boundary-transition layer before the
   next checkpoint rerun

The remaining load-stability packages now sit at the top of the active queue,
with completed companion slices moved into the package archive, because they
are the shortest path from the current checkpoint artifacts to a stable
seven-node pass.

### 2026-04-16 execution snapshot

The first five load-stability packages now have concrete implementation slices:

1. critical control-plane write health distinguishes contained background
   backlog from true critical exhaustion
2. repeated heartbeat-only `NODE_STATE_UPDATE` publications now replace older
   pending work instead of stacking more queue pressure
3. authoritative `replica_operations` visibility now has a canonical deferred
   outcome through repository and rebalancer consumers
4. benchmark partition-growth planning now consumes an explicit
   `criticalControlPlaneStability` prerequisite and triage artifacts expose it
5. the missing-middle boundary scenario layer now reproduces both the critical
   control-plane gate and deferred operation-visibility boundary

Validation status after those slices:

1. focused owner and harness tests are green
2. the shared unit-only gate is green
3. the latest checkpoint rerun at
   `test-output/reports/seven-node-runtime-owner-collapse-20260416T020251Z.report.json`
   is still red, with the remaining live boundary still showing routed
   `replica_operations` read timeouts and late control-plane pressure under
   real cluster load

## 2026-04-16 contract-inversion reset

Recent runtime work reduced several failure boundaries, but it also exposed a
broader systemic problem: too many layers still export observation-shaped
states instead of a small promise-shaped contract.

The sprint is therefore explicitly extended with eight contract-inversion
packages that define the system from the caller-action side first:

1. [Contract Inversion Boundary Taxonomy](../../packages/archived/done-20260417-contract-inversion-boundary-taxonomy.md)
2. [Contract Inversion Shared Outcome Kernel](../../packages/archived/done-20260417-contract-inversion-shared-outcome-kernel.md)
3. [Contract Inversion Control-Plane Mutation And Visibility Cutover](../packages/active-20260416-contract-inversion-control-plane-mutation-and-visibility-cutover.md)
4. [Contract Inversion Readiness Admission And Load Cutover](../packages/active-20260416-contract-inversion-readiness-admission-and-load-cutover.md)
5. [Contract Inversion Protocol Phase Containment](../packages/active-20260416-contract-inversion-protocol-phase-containment.md)
6. [Contract Inversion Diagnostics And Metrics Reframe](../packages/active-20260416-contract-inversion-diagnostics-and-metrics-reframe.md)
7. [Contract Inversion Boundary Test Layer Rewrite](../packages/active-20260416-contract-inversion-boundary-test-layer-rewrite.md)
8. [Contract Inversion Deletion Pass](../packages/active-20260416-contract-inversion-deletion-pass.md)

These eight packages now take precedence over additional local symptom fixes.
The execution order is: taxonomy -> shared outcome kernel -> control-plane
mutation/visibility cutover -> readiness/admission/load cutover -> protocol
phase containment -> diagnostics/metrics reframe -> boundary-test rewrite ->
delete superseded vocabularies.

## 2026-04-15 structural-priority reset

Recent runtime and harness work made the current failure narrower, but also
showed that the next useful progress is architectural rather than another
round of local patching.

The sprint is therefore explicitly reprioritized around five new structural
packages before further local runtime tuning:

1. canonical shared owner snapshots for usable spread and related distributed
   boundaries
2. direct diagnostics emission from those owner snapshots
3. a middle boundary-transition scenario layer between unit and seven-node
   validation
4. explicit owner-map and architecture boundary catalogs
5. doctrine, testing-policy, and audit hardening for structured deferred
   outcomes on unresolved owner paths

Earlier active packages remain valid, but these five packages now take
precedence because they improve the system's ability to explain and stabilize
the whole failure family instead of only its latest symptom.

## 2026-04-12 execution update

Executed bounded hardening slices across all five packages:
1. startup/control-plane startup-authority descriptors are explicit on the
   hardened path
2. query/runtime session pinning and routing overlays now expose explicit
   states
3. rebalancer/workflow repository handoff now distinguishes observed vs absent
   vs unavailable
4. bootstrap/admin response seams now expose explicit pressure,
   publication-observation, load-lane admission, and test-run
   precheck/finalization state
5. boundary normalizers now expose explicit parse/normalization results on the
   hardened address/CDC seams
6. a deterministic JavaScript audit now detects raw string/number literal
   violations against the constants guideline while honoring the documented
   constants-owner and file-local exceptions
7. the first fix batch under that audit removed `123` violations from three
   central query files and reduced `src/query` from `913` to `790`
8. the second fix batch removed another `40` violations and reduced `src/query`
   further from `790` to `750`
9. the repo entry-point guidance now carries an explicit generation contract
   for scalar ownership and decision-boundary state models
10. the repo now also has a deterministic first-pass audit for branch-pile
    semantic decision boundaries, with `110` initial candidates across `src`
    and `scripts`
11. the tracked bootstrap/runtime cleanup batch now has explicit
    decision-adjudication slices in `lifecycle-controller`,
    `pgwire-startup-safety-gate`, `rejoin-hints`, and
    `authoritative-node-evidence-reconciler`; focused detector and suite
    reruns are now green
12. a new low-cost query/partition follow-on batch now hardens
    `strategy-selector`, `parallel-query-coordinator`, and
    `managed-split-workflow` under the same decision-boundary doctrine
13. the remaining repo-wide `src/` decision-boundary hits have now been
    zeroed out across CLI, debug-runtime, logging, query, runtime, service,
    topology, wasm-service, and worker owners

Focused suites added and passed:
1. `node test/query/query-executor-session-pin-state.test.js`
2. `node test/query/sql-query-engine-routing-overlay-state.test.js`
3. `node test/rebalancer/replica-operation-observation-contract.test.js`
4. `node test/bootstrap/bootstrap-control-plane-query-error-contract.test.js`
5. `node test/admin/admin-control-snapshot-response-contract.test.js`
6. `node test/transport/node-address-resolution-contract.test.js`
7. `node test/cdc/cdc-sql-builder.test.js`
8. `node test/admin/admin-websocket-api.test.js`
9. `node test/admin/admin-test-run-service.test.js`

Touched broader suites passed:
1. `node test/control-plane/startup-authority-snapshot.test.js`
2. `node test/bootstrap/startup-authority-consumption.test.js`
3. `node test/bootstrap/startup-recovery-coordinator.test.js`
4. `node test/control-plane/control-plane-readiness-service.test.js`
5. `node test/bootstrap/bootstrap-api.test.js`
6. `node test/query/query-executor.test.js`
7. `node test/query/sql-query-engine.test.js`
8. `node test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
9. `node test/admin/admin-control-snapshot.test.js`
10. `node test/transport/node-address-resolution.test.js`
11. `node test/scripts/check-guideline-literals.test.js`
12. `node test/bootstrap/lifecycle-controller.test.js`
13. `node test/bootstrap/pgwire-startup-safety-gate.test.js`
14. `node test/bootstrap/rejoin-hints.test.js`

Current truth:
1. the sprint packages have been executed with bounded contract-hardening slices
2. the repository as a whole still contains many nullish compatibility paths
3. the sprint should remain active until those broader follow-on eliminations
   are either completed or deliberately split into narrower successor work
4. the constants guideline now has a deterministic first-pass audit for
   JavaScript runtime/script files, but the resulting violation set is still
   large and unfixed
5. the first cleanup batch is complete, but the largest query hotspots
   (`sql-query-engine.js`, `query-executor.js`) are still untouched
6. two low-risk query cleanup batches are now complete and measured
7. [Boundary normalizer hardening for null and undefined ingress](../packages/active-20260412-boundary-normalizer-hardening-for-null-and-undefined-ingress.md)
8. steering wording has been hardened, but enforcement still relies on the
   existing audits and future cleanup batches
9. the new decision-boundary detector identifies concrete cleanup targets in
   `control-plane`, `rebalancer`, `bootstrap`, and `query`
10. the bootstrap/runtime cleanup batch is now both tracked and validated
11. the admin/bootstrap response package now has green focused validation after
    the control-snapshot active-node and authoritative-discovery repair fixes
12. a new query/partition follow-on cleanup batch is now part of the active
    sprint and is intended to absorb low-risk detector-driven hardening slices
13. the live repo-wide `src/` decision-boundary audit is now at `0`
    violations after the zero-out pass

## 2026-04-13 decision-boundary zero-out update

Executed the remaining repo-wide detector cleanup batch:
1. CLI status/config handlers now route through one canonical status/edit
   outcome path
2. debug-runtime pause/handoff helpers now route through one canonical outcome
   path
3. logging/query/runtime helpers now resolve one canonical suppression,
   classification, health, or validation outcome
4. service/topology/wasm/worker handlers now dispatch through one canonical
   action or response path
5. the repo-wide `src/` decision-boundary detector now reports `0` violations
6. focused runtime validation is green across the touched CLI, debug-runtime,
   query, runtime, service, topology, wasm-service, and worker suites

## Out-of-Scope

1. General product feature work
2. Pro or Enterprise implementation
3. Cosmetic lint-only cleanup with no contract meaning
4. New subsystem/layer creation to wrap existing ambiguity
5. Timeout inflation as a substitute for explicit state

## Exit Check

1. No runtime owner API in scope uses `null` or `undefined` to encode state.
2. No startup/publication path relies on nullable epoch/status as phase signals.
3. Core runtime state is represented by explicit variants rather than absence.
4. Remaining `null`/`undefined` usage is confined to raw boundaries and normalized there.
5. Any remaining runtime failures reduce to explicit invariant breaches, not ambiguous absence.

## 2026-04-12 execution update

Started execution with the highest-priority package:
- `startup/control-plane contract hardening`

Implemented:
1. `ControlPlaneReadinessService` startup authority now carries explicit
   `publication` and `failure` descriptors instead of relying on nullable
   publication epoch/status and failure fields on the hardened path.
2. Priority-recovery health details derived from startup authority now reuse
   those explicit descriptors.
3. `StartupRecoveryCoordinator` now consumes explicit startup-authority
   descriptors and preserves them in startup recovery diagnostics.
4. `BootstrapReadinessOwner` now surfaces explicit
   `startupAuthorityFailure` and `startupAuthorityPublication` structures while
   retaining compatibility aliases only when a concrete value exists.

Focused validation passed:
1. `node test/control-plane/startup-authority-snapshot.test.js`
2. `node test/bootstrap/startup-authority-consumption.test.js`
3. `node test/bootstrap/startup-recovery-coordinator.test.js`
4. `node test/control-plane/control-plane-readiness-service.test.js`
5. `node test/bootstrap/bootstrap-api.test.js`

Current status:
- all umbrella packages now have at least one executed hardening slice
- remaining work is broader follow-on cleanup inside those areas, not
  unstarted package execution
