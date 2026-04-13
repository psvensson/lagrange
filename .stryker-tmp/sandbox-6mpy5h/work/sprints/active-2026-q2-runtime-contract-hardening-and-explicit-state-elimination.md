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
2. [Runtime Completion Contracts and Owner Simplification Sprint](../sprints/active-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

Those sprints exposed and reduced ambiguity. This sprint removes the remaining
absence-based contract vocabulary that still lets ambiguity back into runtime
logic.

## Sprint Umbrella

1. [Startup and control-plane contract hardening](../packages/active-20260412-startup-and-control-plane-contract-hardening.md)
2. [Partition and query runtime explicit-state hardening](../packages/active-20260412-partition-and-query-runtime-explicit-state-hardening.md)
3. [Rebalancer and workflow coordination contract hardening](../packages/active-20260412-rebalancer-and-workflow-coordination-contract-hardening.md)
4. [Admin and bootstrap response contract hardening](../packages/active-20260412-admin-and-bootstrap-response-contract-hardening.md)
5. [Boundary normalizer hardening for null and undefined ingress](../packages/active-20260412-boundary-normalizer-hardening-for-null-and-undefined-ingress.md)
6. [Constants-owner and magic-literal guideline violation detection](../packages/active-20260412-constants-owner-and-magic-literal-guideline-violation-detection.md)
7. [Query magic-literal cleanup batch 1](../packages/active-20260412-query-magic-literal-cleanup-batch-1.md)
8. [Query magic-literal cleanup batch 2](../packages/active-20260412-query-magic-literal-cleanup-batch-2.md)
9. [Steering hardening for generation contracts](../packages/active-20260412-steering-hardening-for-generation-contracts.md)
10. [Decision-boundary guideline violation detection](../packages/active-20260412-decision-boundary-guideline-violation-detection.md)
11. [Bootstrap and runtime guideline cleanup batch 1](../packages/active-20260412-bootstrap-and-runtime-guideline-cleanup-batch-1.md)
12. [Query and partition decision-boundary follow-on cleanup](../packages/active-20260412-query-and-partition-decision-boundary-follow-on-cleanup.md)
13. [Repo-wide decision-boundary zero-out pass](../packages/active-20260413-repo-wide-decision-boundary-zero-out-pass.md)

## Priority Order

1. Startup/control-plane owners
2. Partition/query runtime
3. Rebalancer/workflow coordination
4. Admin/bootstrap response shaping
5. Boundary normalizers
6. Constants/magic-literal detection and audit
7. Query cleanup batches driven by the literal audit
8. Larger hotspot cleanup after the mechanical query batches
9. Steering hardening so future code generation follows the contracts more reliably
10. Decision-boundary cleanup batches driven by a deterministic heuristic audit

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

## Active Queue

1. [Startup and control-plane contract hardening](../packages/active-20260412-startup-and-control-plane-contract-hardening.md)
2. [Partition and query runtime explicit-state hardening](../packages/active-20260412-partition-and-query-runtime-explicit-state-hardening.md)
3. [Rebalancer and workflow coordination contract hardening](../packages/active-20260412-rebalancer-and-workflow-coordination-contract-hardening.md)
4. [Admin and bootstrap response contract hardening](../packages/active-20260412-admin-and-bootstrap-response-contract-hardening.md)
5. [Boundary normalizer hardening for null and undefined ingress](../packages/active-20260412-boundary-normalizer-hardening-for-null-and-undefined-ingress.md)
6. [Constants-owner and magic-literal guideline violation detection](../packages/active-20260412-constants-owner-and-magic-literal-guideline-violation-detection.md)
7. [Query magic-literal cleanup batch 1](../packages/active-20260412-query-magic-literal-cleanup-batch-1.md)
8. [Query magic-literal cleanup batch 2](../packages/active-20260412-query-magic-literal-cleanup-batch-2.md)
9. [Steering hardening for generation contracts](../packages/active-20260412-steering-hardening-for-generation-contracts.md)
10. [Decision-boundary guideline violation detection](../packages/active-20260412-decision-boundary-guideline-violation-detection.md)
11. [Bootstrap and runtime guideline cleanup batch 1](../packages/active-20260412-bootstrap-and-runtime-guideline-cleanup-batch-1.md)
12. [Query and partition decision-boundary follow-on cleanup](../packages/active-20260412-query-and-partition-decision-boundary-follow-on-cleanup.md)
13. [Repo-wide decision-boundary zero-out pass](../packages/active-20260413-repo-wide-decision-boundary-zero-out-pass.md)

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
