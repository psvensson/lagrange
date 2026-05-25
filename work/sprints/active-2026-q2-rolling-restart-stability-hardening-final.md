# Rolling Restart Stability Hardening Final Sprint

Status: active. Created on May 23, 2026.

## Goal

Make the system stable under rolling-restart: change the core logic of the system so that the rolling-restart scenario passes clean (representative-green outcome). The sprint is NOT considered done until the rolling-restart scenario actually passes clean without timeouts or admission relaxation.

## Sprint Strategy Brief

- Goal state: Representative `rolling-restart` scenario is green under multiple successive trials with `active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`, and diagnostics/analyzers report zero priority recovery residuals and clean convergence.
- Current causal thesis: System stability during a rolling restart depends on the proper coordination of the active node projection, active-gate snapshot coverage, and robust error/transport retry logic.
- Competing hypotheses:
  - H1: Stale active-gate snapshot timeouts are caused by inadequate transport-closed dampening or cohort fallback parsing.
  - H2: Missing publication convergence is a result of uncoordinated reconcile-queue retry pacing.
  - H3: Stability requires both transport-dampening grace periods and robust active-node eligibility evaluation.
- Confidence and evidence: High. Recent package work resolved multiple specific edge cases, but unified rolling-restart stability under varied restart sequences requires integrated validation of recovery taxonomy and rebalancer gates.
- Expected green path: First drain the oversized-file refactor tranche so the next runtime stability work starts from smaller, semantically named source and test surfaces; then activate focused runtime stability packages, verify with targeted multi-node restart tests, and run representative reruns to prove stability.
- Wrong direction signals: Simply raising timeouts, relaxing active-gate admission policies, or ignoring low-confidence recovery signals.
- Next best package: `work/packages/done-20260524-admin-websocket-api-method-modules.md`.
- Stop or escalate rule: Escalated to a causal governance gate if frontier oscillations persist after focused boundary adjustments.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: work/packages/done-20260525-steering-docs-final-cleanups.md
Active package owner: workflow_tooling_owner
Active package boundary: llm_steering_doc_truth
Selected cause: steering_doc_truth_repair
Required action: Append the closure tail (work:validate --closure, rename + sed status, work:repair, focused commit + push) to every lane block in boot.md so an LLM reading a single lane sees the full closure ceremony; merge the redundant AGENTS.md paragraph at L31-34 into the following sentence; map each Template Picker entry in core.md 1-to-1 to its canonical lane; and remove the silently-drifting rule-count, token, and domain header lines from generated per-domain packs (manifest.json already tracks these). README pack-truth note already updated in the previous package.
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: New package scaffolded from the shared work-package schema.
Allowed edits: .kiro/steering/llm/boot.md, AGENTS.md, .kiro/steering/llm/core.md, scripts/generate-steering-llm-pack.js, .kiro/steering/llm/architecture.md, .kiro/steering/llm/testing.md, .kiro/steering/llm/style.md, .kiro/steering/llm/governance.md, .kiro/steering/llm/manifest.json, .kiro/steering/llm/rules.json
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: node --test test/scripts/generate-steering-llm-pack.test.js
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. All packages must select the lightest valid workflow lane as defined in `work/RULES.md#lane-definitions`.
2. Run `npm run work:context` and `npm run work:llm-start` before package activation or edits.
3. Do not modify runtime code without a preceding pre-implementation validator check (`npm run work:validate -- --pre-impl`).
4. Closure is atomic: rename packages to `done-...`, update theory ledger and edge cards, run closure validation (`npm run work:validate -- --closure`), then commit and push.
5. Do not widen timeouts or relax admission filters to mask underlying coordination errors.

## Package Queue

1. [Bring admin websocket API below file-size limit](../packages/done-20260524-admin-websocket-api-method-modules.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named admin websocket method modules until `src/admin/admin-websocket-api-segment-3.js` is below the source file-size limit.
   - First-run reason: current top owner-boundary segment candidate from `npm run work:oversized-next -- --markdown`.

2. [Bring topology convergence graph below file-size limit](../packages/done-20260524-topology-convergence-graph-boundary-modules.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named topology convergence graph modules until `src/diagnostics/topology-convergence-graph.js` is below the source file-size limit.
   - First-run reason: largest oversized source file reported by `npm run audit:file-size`.

3. [Bring publication recovery evidence below file-size limit](../packages/done-20260524-publication-recovery-evidence-normalizers.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named publication recovery evidence modules until `src/control-plane/publication-recovery-evidence.js` is below the source file-size limit.
   - First-run reason: next largest source oversized file in the current audit.

4. [Bring publication active gate handoff contract below file-size limit](../packages/done-20260524-publication-active-gate-handoff-contract-modules.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named publication active-gate handoff contract modules until `src/control-plane/publication-active-gate-handoff-contract.js` is below the source file-size limit.
   - First-run reason: next largest source oversized file in the current audit.

5. [Bring CDC integration service API below file-size limit](../packages/done-20260524-cdc-integration-service-semantic-modules.md)

   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named CDC integration service modules until `src/cdc/cdc-integration-service-segment-3.js` is below the source file-size limit.
   - First-run reason: next top owner-boundary segment candidate from `npm run work:oversized-next -- --markdown`.

6. [Bring operation workflow owner below file-size limit](../packages/done-20260524-operation-workflow-owner-semantic-modules.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named operation workflow owner modules until `src/rebalancer/operation-workflow-owner-segment-6.js` is below the source file-size limit.
   - First-run reason: next top owner-boundary segment candidate from `npm run work:oversized-next -- --markdown`.

7. [Split quorum conditioned remove safety tail tests below file-size limit](../packages/done-20260524-quorum-conditioned-remove-safety-test-suites.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Split semantically grouped quorum conditioned remove-safety test suites until `test/rebalancer/quorum-conditioned-remove-safety-tail-test-cases.js` is below the test file-size limit.
   - First-run reason: largest oversized test file reported by `npm run audit:file-size`.

8. [Split node joining service tests below file-size limit](../packages/done-20260524-node-joining-service-test-suites.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Split semantically grouped node joining service test suites until `test/bootstrap/node-joining-service.test.js` is below the test file-size limit.
   - First-run reason: next largest oversized test file in the current audit.

9. [Split membership publication coordinator tests below file-size limit](../packages/done-20260524-membership-publication-coordinator-test-suites.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Split semantically grouped membership publication coordinator test suites until `test/control-plane/membership-publication-coordinator-main-stage-2.js` is below the test file-size limit.
   - First-run reason: next largest oversized test file in the current audit.

10. Rerun `npm run audit:file-size` and `npm run work:oversized-next -- --markdown`; if any oversized files remain, insert the next concrete oversized-file packages here before resuming runtime stability work.
   - Lane: `lightweight-maintenance`
   - Purpose: Keep the sprint's front of queue pointed at the current largest source/test and owner-boundary oversized files until the audit reaches zero oversized files.
   - First-run reason: the current audit reports 154 source oversized files and 60 test oversized files, so this first tranche cannot complete the full backlog by itself.
   - Inserted parallel-safe packages from the latest owner-boundary audit:
     - [Extract priority recovery coordination helper from unified rebalancer](../packages/done-20260524-unified-rebalancer-priority-recovery-coordination.md)
     - [Extract dispatch wake preemption helper from operation workflow owner](../packages/done-20260524-operation-workflow-dispatch-wake-preemption.md)
     - [Extract routed system write selection helper from CDC integration service](../packages/done-20260524-cdc-routed-system-write-selection.md)
     - [Extract transition retry grace helper from operation workflow owner](../packages/done-20260524-operation-workflow-transition-retry-grace.md)
     - [Extract dispatch replay readiness helper from replica dispatch service](../packages/done-20260524-replica-dispatch-replay-readiness.md)
     - [Extract local serve readiness helper from unified rebalancer](../packages/done-20260524-unified-rebalancer-local-serve-readiness.md)
     - [Extract coordinator handoff retry helper from operation workflow owner](../packages/done-20260524-operation-workflow-coordinator-handoff-retry.md)
     - [Extract concurrent add budget helper from rebalance coordinator](../packages/done-20260524-rebalance-coordinator-concurrent-add-budget.md)
   - Inserted source ratchet tranche from the May 24 owner-boundary audit:
     - [Extract routed mutation readiness helper from CDC integration service](../packages/done-20260524-cdc-integration-service-routed-mutation-readiness.md)
     - [Extract dispatch response reconcile helper from operation workflow owner](../packages/done-20260524-operation-workflow-dispatch-response-reconcile.md)
     - [Extract replay and health readiness helper from replica dispatch service](../packages/done-20260524-replica-dispatch-replay-and-health-readiness.md)
     - [Extract dispatch rearm evidence helper from operation workflow owner](../packages/done-20260524-operation-workflow-dispatch-rearm-evidence.md)
     - [Extract admission readiness helper from node joining service](../packages/done-20260524-node-joining-admission-readiness.md)
     - [Extract publication activation helper from node joining service](../packages/done-20260524-node-joining-publication-activation.md)
     - [Extract priority budget admission helper from rebalance coordinator](../packages/done-20260524-rebalance-coordinator-priority-budget-admission.md)
     - [Extract owner handoff state helper from operation workflow owner](../packages/done-20260524-operation-workflow-owner-handoff-state.md)
     - [Extract priority readiness helper from unified rebalancer](../packages/done-20260524-unified-rebalancer-priority-readiness.md)
     - [Extract delivery pressure routing helper from message router](../packages/done-20260524-message-router-delivery-pressure-routing.md)
     - [Extract transition orchestration helper from operation workflow owner](../packages/done-20260524-operation-workflow-transition-orchestration.md)
     - [Extract state publication helper from replica dispatch service](../packages/done-20260524-replica-dispatch-state-publication.md)

   - Inserted zero-oversized parallel backlog from the May 24 full file-size audit:
     - Audit basis: `npm run audit:file-size -- --top 250` on 2026-05-24; 140 source files and 55 test/support files remain oversized.
     - Parallelization rule: each package owns one current oversized target; executors may add semantically named helper/split files to that package before pre-implementation, and must split or escalate if work needs another package target.
     - Source packages (140):
     - [Refactor oversized source file src/admin/admin-service-discovery-readiness-methods.js](../packages/done-20260524-oversized-admin-admin-service-discovery-readiness-methods.md)
     - [Refactor oversized source file src/control-plane/publication-recovery-evidence-normalizers.js](../packages/done-20260524-oversized-control-plane-publication-recovery-evidence-normalizers.md)
     - [Refactor oversized source file src/control-plane/membership-publication-planning.js](../packages/done-20260524-oversized-control-plane-membership-publication-planning.md)
     - [Refactor oversized source file src/query/query-executor-segment-3-part-2.js](../packages/done-20260524-oversized-query-query-executor.md)
     - [Refactor oversized source file src/bootstrap/bootstrap-api.js](../packages/done-20260524-oversized-bootstrap-bootstrap-api.md)
     - [Refactor oversized source file src/bootstrap/bootstrap-service.js](../packages/done-20260524-oversized-bootstrap-bootstrap-service.md)
     - [Refactor oversized source file src/admin/admin-control-snapshot-class-part-2.js](../packages/done-20260524-oversized-admin-admin-control-snapshot.md)
     - [Refactor oversized source file src/bootstrap/owners/move-replica-assignment-owner.js](../packages/done-20260524-oversized-bootstrap-owners-move-replica-assignment-owner.md)
     - [Refactor oversized source file src/rebalancer/replica-operation-repository.js](../packages/done-20260524-oversized-rebalancer-replica-operation-repository.md)
     - [Refactor oversized source file src/query/distributed/distributed-transaction-coordinator.js](../packages/done-20260524-oversized-query-distributed-distributed-transaction-coordinator.md)
     - [Refactor oversized source file src/bootstrap/bootstrap-service-runtime-methods.js](../packages/done-20260524-oversized-bootstrap-bootstrap-service-runtime-methods.md)
     - [Refactor oversized source file src/admin/admin-test-run-service.js](../packages/done-20260524-oversized-admin-admin-run-service.md)
     - [Refactor oversized source file src/cli/index.js](../packages/done-20260524-oversized-cli-index.md)
     - [Refactor oversized source file src/rebalancer/replica-operation-repository-mutation-methods.js](../packages/done-20260524-oversized-rebalancer-replica-operation-repository-mutation-methods.md)
     - [Refactor oversized source file src/control-plane/heartbeat-service.js](../packages/done-20260524-oversized-control-plane-heartbeat-service.md)
     - [Refactor oversized source file src/worker/replica-worker-manager.js](../packages/done-20260524-oversized-worker-replica-worker-manager.md)
     - [Refactor oversized source file src/bootstrap/system-table-schemas-constants.js](../packages/done-20260524-oversized-bootstrap-system-table-schemas-constants.md)
     - [Refactor oversized source file src/control-plane/membership-publication-coordinator-class-stage-2.js](../packages/done-20260524-oversized-control-plane-membership-publication-coordinator.md)
     - [Refactor oversized source file src/control-plane/control-plane-system-table-gateway-shared.js](../packages/done-20260524-oversized-control-plane-control-plane-system-table-gateway-shared.md)
     - [Refactor oversized source file src/migration/migration-coordinator.js](../packages/done-20260524-oversized-migration-migration-coordinator.md)
     - [Refactor oversized source file src/worker/message-group-worker-service.js](../packages/done-20260524-oversized-worker-message-group-worker-service.md)
     - [Refactor oversized source file src/topology/cdc-group-propagation-service.js](../packages/done-20260524-oversized-topology-cdc-group-propagation-service.md)
     - [Refactor oversized source file src/bootstrap/owners/bootstrap-topology-snapshot-owner.js](../packages/done-20260524-oversized-bootstrap-owners-bootstrap-topology-snapshot-owner.md)
     - [Refactor oversized source file src/rebalancer/move-planner.js](../packages/done-20260524-oversized-rebalancer-move-planner.md)
     - [Refactor oversized source file src/service/service-lifecycle-manager.js](../packages/done-20260524-oversized-service-service-lifecycle-manager.md)
     - [Refactor oversized source file src/control-plane/publication-recovery-evidence-builders.js](../packages/done-20260524-oversized-control-plane-publication-recovery-evidence-builders.md)
     - [Refactor oversized source file src/node/replica-handler-class-part-1.js](../packages/done-20260524-oversized-node-replica-handler.md)
     - [Refactor oversized source file src/control-plane/active-node-projection.js](../packages/done-20260524-oversized-control-plane-active-node-projection.md)
     - [Refactor oversized source file src/logging/logs-table-service.js](../packages/done-20260524-oversized-logging-logs-table-service.md)
     - [Refactor oversized source file src/cli/views/logs-view.js](../packages/done-20260524-oversized-cli-views-logs-view.md)
     - [Refactor oversized source file src/bootstrap/join-readiness-evaluator.js](../packages/done-20260524-oversized-bootstrap-join-readiness-evaluator.md)
     - [Refactor oversized source file src/message-group/message-group-forwarding-owner.js](../packages/done-20260524-oversized-message-group-message-group-forwarding-owner.md)
     - [Refactor oversized source file src/query/query-executor-segment-2-part-1.js](../packages/done-20260524-oversized-query-query-alpha.md)
     - [Refactor oversized source file src/node/replica-state-machine.js](../packages/done-20260524-oversized-node-replica-state-machine.md)
     - [Refactor oversized source file src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js](../packages/done-20260524-oversized-bootstrap-owners-bootstrap-readiness-owner.md)
     - [Refactor oversized source file src/entrypoint-runtime-helpers.js](../packages/done-20260524-oversized-entrypoint-runtime-helpers.md)
     - [Refactor oversized source file src/config/config-constants.js](../packages/done-20260524-oversized-config-config-constants.md)
     - [Refactor oversized source file src/partition/partition-split-merge-manager.js](../packages/done-20260524-oversized-partition-partition-split-merge-manager.md)
     - [Refactor oversized source file src/control-plane/priority-recovery-snapshot-stage-3.js](../packages/done-20260524-oversized-control-plane-priority-recovery-snapshot.md)
     - [Refactor oversized source file src/bootstrap/owners/bootstrap-request-owner.js](../packages/done-20260524-oversized-bootstrap-owners-bootstrap-request-owner.md)
     - [Refactor oversized source file src/query/table-creation-service-class-part-1.js](../packages/done-20260524-oversized-query-table-creation-service.md)
     - [Refactor oversized source file src/control-plane/publication-recovery-gate.js](../packages/done-20260524-oversized-control-plane-publication-recovery-gate.md)
     - [Refactor oversized source file src/live-query/live-query-manager.js](../packages/done-20260524-oversized-live-query-live-query-manager.md)
     - [Refactor oversized source file src/control-plane/replica-dispatch-service-segment-4.js](../packages/done-20260524-oversized-control-plane-replica-dispatch-service.md)
     - [Refactor oversized source file src/rebalancer/replica-operation-repository-read-methods.js](../packages/done-20260524-oversized-rebalancer-replica-operation-repository-read-methods.md)
     - [Refactor oversized source file src/partition/partition-service-segment-4-part-2.js](../packages/done-20260524-oversized-partition-partition-service.md)
     - [Refactor oversized source file src/query/sql-query-engine-segment-4.js](../packages/done-20260524-oversized-query-sql-query-engine.md)
     - [Refactor oversized source file src/rebalancer/unified-rebalancer-segment-1.js](../packages/done-20260524-oversized-rebalancer-unified-rebalancer.md)
     - [Refactor oversized source file src/control-plane/control-plane-system-table-gateway-segment-1.js](../packages/done-20260524-oversized-control-plane-control-plane-system-table-gateway.md)
     - [Refactor oversized source file src/transport/message-router-segment-1.js](../packages/done-20260524-oversized-transport-message-router.md)
     - [Refactor oversized source file src/control-plane/control-plane-readiness-service-segment-2.js](../packages/done-20260524-oversized-control-plane-control-plane-readiness-service.md)
     - [Refactor oversized source file src/rebalancer/unified-rebalancer-segment-2.js](../packages/done-20260524-oversized-rebalancer-unified-alpha.md)
     - [Refactor oversized source file src/bootstrap/join-readiness-evaluator-tail-methods.js](../packages/done-20260524-oversized-bootstrap-join-readiness-evaluator-tail-methods.md)
     - [Refactor oversized source file src/node/replica-handler-runtime-methods.js](../packages/done-20260524-oversized-node-replica-handler-runtime-methods.md)
     - [Refactor oversized source file src/control-plane/control-plane-readiness-service-segment-3.js](../packages/done-20260524-oversized-control-plane-control-plane-readiness-alpha.md)
     - [Refactor oversized source file src/bootstrap/node-joining-service-segment-1.js](../packages/done-20260524-oversized-bootstrap-node-joining-service.md)
     - [Refactor oversized source file src/runtime/pgwire-protocol-handler.js](../packages/done-20260524-oversized-runtime-pgwire-protocol-handler.md)
     - [Refactor oversized source file src/rebalancer/rebalance-coordinator-segment-4.js](../packages/done-20260524-oversized-rebalancer-rebalance-coordinator.md)
     - [Refactor oversized source file src/query/sql-query-engine.js](../packages/done-20260524-oversized-query-sql-query-alpha.md)
     - [Refactor oversized source file src/runtime/service-runtime-lifecycle.js](../packages/done-20260524-oversized-runtime-service-runtime-lifecycle.md)
     - [Refactor oversized source file src/control-plane/invariant-engine.js](../packages/done-20260524-oversized-control-plane-invariant-engine.md)
     - [Refactor oversized source file src/query/query-executor-segment-1.js](../packages/done-20260524-oversized-query-query-bravo.md)
     - [Refactor oversized source file src/control-plane/control-plane-system-table-gateway-segment-2.js](../packages/done-20260524-oversized-control-plane-control-plane-system-table-alpha.md)
     - [Refactor oversized source file src/query/sql-query-engine-segment-7.js](../packages/done-20260524-oversized-query-sql-query-bravo.md)
     - [Refactor oversized source file src/diagnostics/topology-convergence-normalizers.js](../packages/done-20260524-oversized-diagnostics-topology-convergence-normalizers.md)
     - [Refactor oversized source file src/partition/managed-split-workflow-provisioning-methods.js](../packages/done-20260524-oversized-partition-managed-split-workflow-provisioning-methods.md)
     - [Refactor oversized source file src/query/distributed/parallel-query-coordinator.js](../packages/done-20260524-oversized-query-distributed-parallel-query-coordinator.md)
     - [Refactor oversized source file src/admin/admin-websocket-api-segment-1.js](../packages/done-20260524-oversized-admin-admin-websocket-api.md)
     - [Refactor oversized source file src/rebalancer/operation-workflow-owner-segment-7-stage-3.js](../packages/done-20260524-oversized-rebalancer-operation-workflow-owner.md)
     - [Refactor oversized source file src/rebalancer/rebalance-coordinator-segment-1.js](../packages/done-20260524-oversized-rebalancer-rebalance-alpha.md)
     - [Refactor oversized source file src/query/sql-query-engine-segment-6.js](../packages/done-20260524-oversized-query-sql-query-charlie.md)
     - [Refactor oversized source file src/query/sql-parser.js](../packages/done-20260524-oversized-query-sql-parser.md)
     - [Refactor oversized source file src/query/sql-query-engine-segment-5.js](../packages/done-20260524-oversized-query-sql-query-delta.md)
     - [Refactor oversized source file src/admin/admin-websocket-api-segment-2.js](../packages/done-20260524-oversized-admin-admin-websocket-alpha.md)
     - [Refactor oversized source file src/rebalancer/rebalancer-planning-gate-methods.js](../packages/done-20260524-oversized-rebalancer-rebalancer-planning-gate-methods.md)
     - [Refactor oversized source file src/control-plane/control-plane-readiness-service-segment-1.js](../packages/done-20260524-oversized-control-plane-control-plane-readiness-bravo.md)
     - [Refactor oversized source file src/bootstrap/phases/create-message-group-phase.js](../packages/done-20260524-oversized-bootstrap-phases-create-message-group-phase.md)
     - [Refactor oversized source file src/partition/managed-split-workflow.js](../packages/done-20260524-oversized-partition-managed-split-workflow.md)
     - [Refactor oversized source file src/cli/sql/sql-query-view.js](../packages/done-20260524-oversized-cli-sql-sql-query-view.md)
     - [Refactor oversized source file src/query/sql-query-engine-segment-3.js](../packages/done-20260524-oversized-query-sql-query-echo.md)
     - [Refactor oversized source file src/message-group/message-group-forwarding-owner-delivery-methods.js](../packages/done-20260524-oversized-message-group-message-group-forwarding-owner-delivery-methods.md)
     - [Refactor oversized source file src/admin/admin-control-snapshot-readiness-diagnostics-methods.js](../packages/done-20260524-oversized-admin-admin-control-snapshot-readiness-diagnostics-methods.md)
     - [Refactor oversized source file src/query/sql-query-engine-segment-1.js](../packages/done-20260524-oversized-query-sql-query-foxtrot.md)
     - [Refactor oversized source file src/query/query-executor-segment-3-part-1.js](../packages/done-20260524-oversized-query-query-charlie.md)
     - [Refactor oversized source file src/message-group/message-group-service-runtime-methods-class-part-2.js](../packages/done-20260524-oversized-message-group-message-group-service-runtime-methods.md)
     - [Refactor oversized source file src/rebalancer/operation-workflow-recovery-reconcile.js](../packages/done-20260524-oversized-rebalancer-operation-workflow-recovery-reconcile.md)
     - [Refactor oversized source file src/node/replica-handler-class-part-2.js](../packages/done-20260524-oversized-node-replica-alpha.md)
     - [Refactor oversized source file src/admin/admin-service-discovery.js](../packages/done-20260524-oversized-admin-admin-service-discovery.md)
     - [Refactor oversized source file src/control-plane/control-plane-system-table-gateway-segment-3.js](../packages/done-20260524-oversized-control-plane-control-plane-system-table-bravo.md)
     - [Refactor oversized source file src/rebalancer/operation-lifecycle.js](../packages/done-20260524-oversized-rebalancer-operation-lifecycle.md)
     - [Refactor oversized source file src/message-group/message-group-service-class-part-2.js](../packages/done-20260524-oversized-message-group-message-group-service.md)
     - [Refactor oversized source file src/service/service-reconciler.js](../packages/done-20260524-oversized-service-service-reconciler.md)
     - [Refactor oversized source file src/debug-runtime/debug-metadata-service.js](../packages/done-20260524-oversized-debug-runtime-debug-metadata-service.md)
     - [Refactor oversized source file src/bootstrap/shared/node-registration-owner.js](../packages/done-20260524-oversized-bootstrap-shared-node-registration-owner.md)
     - [Refactor oversized source file src/topology/latency-group-manager.js](../packages/done-20260524-oversized-topology-latency-group-manager.md)
     - [Refactor oversized source file src/message-group/message-group-service-runtime-methods-class-part-1.js](../packages/done-20260524-oversized-message-group-message-group-service-runtime-alpha.md)
     - [Refactor oversized source file src/control-plane/priority-recovery-dispatch-snapshot.js](../packages/done-20260524-oversized-control-plane-priority-recovery-dispatch-snapshot.md)
     - [Refactor oversized source file src/logging/logging-service.js](../packages/done-20260524-oversized-logging-logging-service.md)
     - [Refactor oversized source file src/message-group/message-group-service-class-part-1.js](../packages/done-20260524-oversized-message-group-message-group-alpha.md)
     - [Refactor oversized source file src/rebalancer/replica-operation-liveness.js](../packages/done-20260524-oversized-rebalancer-replica-operation-liveness.md)
     - [Refactor oversized source file src/policy/table-policy-service.js](../packages/done-20260524-oversized-policy-table-policy-service.md)
     - [Refactor oversized source file src/bootstrap/phases/query-system-state-phase.js](../packages/done-20260524-oversized-bootstrap-phases-query-system-state-phase.md)
     - [Refactor oversized source file src/raft/raft-replica-base.js](../packages/done-20260524-oversized-raft-raft-replica-base.md)
     - [Refactor oversized source file src/node/replica-lifecycle-manager.js](../packages/done-20260524-oversized-node-replica-lifecycle-manager.md)
     - [Refactor oversized source file src/node/failure-detector.js](../packages/done-20260524-oversized-node-failure-detector.md)
     - [Refactor oversized source file src/rebalancer/operation-workflow-owner.js](../packages/done-20260524-oversized-rebalancer-operation-workflow-alpha.md)
     - [Refactor oversized source file src/rebalancer/replica-status.js](../packages/done-20260524-oversized-rebalancer-replica-status.md)
     - [Refactor oversized source file src/partition/partition-service-segment-4-part-1.js](../packages/done-20260524-oversized-partition-partition-alpha.md)
     - [Refactor oversized source file src/admin/admin-control-snapshot-class-part-6.js](../packages/done-20260524-oversized-admin-admin-control-alpha.md)
     - [Refactor oversized source file src/control-plane/replica-dispatch-service-segment-2.js](../packages/done-20260524-oversized-control-plane-replica-dispatch-alpha.md)
     - [Refactor oversized source file src/node/message-group-service-handler.js](../packages/done-20260524-oversized-node-message-group-service-handler.md)
     - [Refactor oversized source file src/rebalancer/unified-rebalancer-segment-4-stage-1.js](../packages/done-20260524-oversized-rebalancer-unified-bravo.md)
     - [Refactor oversized source file src/bootstrap/phases/contact-seed-phase.js](../packages/done-20260524-oversized-bootstrap-phases-contact-seed-phase.md)
     - [Refactor oversized source file src/bootstrap/phases/seed-cache-hydration-phase.js](../packages/done-20260524-oversized-bootstrap-phases-seed-cache-hydration-phase.md)
     - [Refactor oversized source file src/cli/core/dev-tools.js](../packages/done-20260524-oversized-cli-core-dev-tools.md)
     - [Refactor oversized source file src/bootstrap/shared/node-state-publication-owner.js](../packages/done-20260524-oversized-bootstrap-shared-node-state-publication-owner.md)
     - [Refactor oversized source file src/admin/admin-service-discovery-repair-methods.js](../packages/done-20260524-oversized-admin-admin-service-discovery-repair-methods.md)
     - [Refactor oversized source file src/control-plane/recovery-protocol-snapshot.js](../packages/done-20260524-oversized-control-plane-recovery-protocol-snapshot.md)
     - [Refactor oversized source file src/node/node-reintegration-service.js](../packages/done-20260524-oversized-node-node-reintegration-service.md)
     - [Refactor oversized source file src/query/query-executor-segment-2-part-2.js](../packages/done-20260524-oversized-query-query-delta.md)
     - [Refactor oversized source file src/partition/partition-cdc-generator.js](../packages/done-20260524-oversized-partition-partition-cdc-generator.md)
     - [Refactor oversized source file src/node/replica-recovery-service.js](../packages/done-20260524-oversized-node-replica-recovery-service.md)
     - [Refactor oversized source file src/bootstrap/phases/seed-partitions-phase.js](../packages/done-20260524-oversized-bootstrap-phases-seed-partitions-phase.md)
     - [Refactor oversized source file src/partition/partition-service-segment-1-part-2.js](../packages/done-20260524-oversized-partition-partition-bravo.md)
     - [Refactor oversized source file src/cli/views/config-view.js](../packages/done-20260524-oversized-cli-views-config-view.md)
     - [Refactor oversized source file src/rebalancer/storage-admission-service.js](../packages/done-20260524-oversized-rebalancer-storage-admission-service.md)
     - [Refactor oversized source file src/raft/sqlite-log-adapter.js](../packages/done-20260524-oversized-raft-sqlite-log-adapter.md)
     - [Refactor oversized source file src/cache/system-table-cache.js](../packages/done-20260524-oversized-cache-system-table-cache.md)
     - [Refactor oversized source file src/transport/websocket-transport.js](../packages/done-20260524-oversized-transport-websocket-transport.md)
     - [Refactor oversized source file src/transport/websocket-transport-provider.js](../packages/done-20260524-oversized-transport-websocket-transport-provider.md)
     - [Refactor oversized source file src/control-plane/startup-authority-snapshot-owner.js](../packages/done-20260524-oversized-control-plane-startup-authority-snapshot-owner.md)
     - [Refactor oversized source file src/admin/admin-control-snapshot.js](../packages/done-20260524-oversized-admin-admin-control-bravo.md)
     - [Refactor oversized source file src/diagnostics/budget-timeout-accounting.js](../packages/done-20260524-oversized-diagnostics-budget-timeout-accounting.md)
     - [Refactor oversized source file src/worker/partition-worker-service.js](../packages/done-20260524-oversized-worker-partition-worker-service.md)
     - [Refactor oversized source file src/cli/core/remote-cache.js](../packages/done-20260524-oversized-cli-core-remote-cache.md)
     - [Refactor oversized source file src/partition/partition-service-segment-2-part-1.js](../packages/done-20260524-oversized-partition-partition-charlie.md)
     - [Refactor oversized source file src/query/partition-resolver.js](../packages/done-20260524-oversized-query-partition-resolver.md)
     - [Refactor oversized source file src/cdc/cdc-integration-service-shared.js](../packages/done-20260524-oversized-cdc-cdc-integration-service-shared.md)
     - [Refactor oversized source file src/rebalancer/topology-owner-constants.js](../packages/done-20260524-oversized-rebalancer-topology-owner-constants.md)
     - [Refactor oversized source file src/diagnostics/topology-convergence-constants.js](../packages/done-20260524-oversized-diagnostics-topology-convergence-constants.md)
     - Test/support packages (55):
     - [Split oversized test/support file test/distributed/harness/failure-bundle-segment-5.js](../packages/done-20260524-oversized-distributed-harness-failure-bundle.md)
     - [Split oversized test/support file test/distributed/harness/publication-evidence-replay.js](../packages/done-20260524-oversized-distributed-harness-publication-evidence-replay.md)
     - [Split oversized test/support file test/admin/admin-control-snapshot-publication-convergence-test-cases.js](../packages/done-20260524-oversized-admin-admin-control-snapshot-publication-convergence-cases.md)
     - [Split oversized test/support file test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js](../packages/done-20260524-oversized-admin-admin-control-snapshot-repair-handoff-outcome-cases.md)
     - [Split oversized test/support file test/rebalancer/unified-rebalancer-part-5-2-stage-2.js](../packages/done-20260524-oversized-rebalancer-unified-charlie.md)
     - [Split oversized test/support file test/distributed/harness/publication-evidence-contract.js](../packages/done-20260524-oversized-distributed-harness-publication-evidence-contract.md)
     - [Split oversized test/support file test/distributed/harness/assertions-segment-3.js](../packages/done-20260524-oversized-distributed-harness-assertions.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js](../packages/done-20260524-oversized-distributed-harness-failure-bundle-playback-cases.md)
     - [Split oversized test/support file test/control-plane/publication-recovery-evidence.test.js](../packages/done-20260524-oversized-control-plane-publication-recovery-evidence.md)
     - [Split oversized test/support file test/bootstrap/move-replica-assignment-token.test.js](../packages/done-20260524-oversized-bootstrap-move-replica-assignment-token.md)
     - [Split oversized test/support file test/distributed/harness/cluster-segment-7-class-4.js](../packages/done-20260524-oversized-distributed-harness-cluster.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js](../packages/done-20260524-oversized-distributed-harness-cluster-control-snapshot-timeout-repair.md)
     - [Split oversized test/support file test/rebalancer/replace-replica-workflow.test.js](../packages/done-20260524-oversized-rebalancer-replace-replica-workflow.md)
     - [Split oversized test/support file test/distributed/harness/cluster-segment-7.js](../packages/done-20260524-oversized-distributed-harness-alpha.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/cluster.test-part-4.js](../packages/done-20260524-oversized-distributed-harness-bravo.md)
     - [Split oversized test/support file test/control-plane/replica-dispatch-node-state-update.test-part-4.js](../packages/done-20260524-oversized-control-plane-replica-dispatch-node-state-update.md)
     - [Split oversized test/support file test/bootstrap/bootstrap-api.test.js](../packages/done-20260524-oversized-bootstrap-bootstrap-alpha.md)
     - [Split oversized test/support file test/distributed/harness/failure-bundle-segment-1.js](../packages/done-20260524-oversized-distributed-harness-failure-alpha.md)
     - [Split oversized test/support file test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js](../packages/done-20260524-oversized-rebalancer-coordinator-created-operation-progress-remote-handoff.md)
     - [Split oversized test/support file test/control-plane/membership-publication-coordinator-tail-more-test-cases.js](../packages/done-20260524-oversized-control-plane-membership-publication-coordinator-tail-more-cases.md)
     - [Split oversized test/support file test/distributed/harness/cluster-segment-2.js](../packages/done-20260524-oversized-distributed-harness-charlie.md)
     - [Split oversized test/support file test/query/query-executor.test-part-6.js](../packages/done-20260524-oversized-query-query-echo.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/assert-consistency.test.js](../packages/done-20260524-oversized-distributed-harness-assert-consistency.md)
     - [Split oversized test/support file test/distributed/harness/failure-bundle-segment-3.js](../packages/done-20260524-oversized-distributed-harness-failure-bravo.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/assertions.test.js](../packages/done-20260524-oversized-distributed-harness-delta.md)
     - [Split oversized test/support file test/rebalancer/replica-operation-repository.test.js](../packages/done-20260524-oversized-rebalancer-replica-operation-alpha.md)
     - [Split oversized test/support file test/rebalancer/rebalance-coordinator-operation-ownership-tail-test-cases.js](../packages/done-20260524-oversized-rebalancer-rebalance-coordinator-operation-ownership-tail-cases.md)
     - [Split oversized test/support file test/bootstrap/bootstrap-api.test-part-3.js](../packages/done-20260524-oversized-bootstrap-bootstrap-bravo.md)
     - [Split oversized test/support file test/distributed/harness/cluster-segment-7-class-5.js](../packages/done-20260524-oversized-distributed-harness-echo.md)
     - [Split oversized test/support file test/node/replica-handler.test.js](../packages/done-20260524-oversized-node-replica-bravo.md)
     - [Split oversized test/support file test/query/sql-query-engine.test.js](../packages/done-20260524-oversized-query-sql-query-golf.md)
     - [Split oversized test/support file test/rebalancer/rebalance-coordinator-operation-ownership.test.js](../packages/done-20260524-oversized-rebalancer-rebalance-coordinator-operation-ownership.md)
     - [Split oversized test/support file test/control-plane/membership-publication-coordinator-tail-test-cases.js](../packages/done-20260524-oversized-control-plane-membership-publication-coordinator-tail-cases.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/cluster.test-part-3.js](../packages/done-20260524-oversized-distributed-harness-foxtrot.md)
     - [Split oversized test/support file test/control-plane/replica-dispatch-node-state-update.test.js](../packages/done-20260524-oversized-control-plane-replica-dispatch-node-state-alpha.md)
     - [Split oversized test/support file test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js](../packages/done-20260524-oversized-admin-admin-control-snapshot-deferred-refresh-membership.md)
     - [Split oversized test/support file test/admin/admin-websocket-api.test-part-2.js](../packages/done-20260524-oversized-admin-admin-websocket-bravo.md)
     - [Split oversized test/support file test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js](../packages/done-20260524-oversized-rebalancer-rebalance-coordinator-timeout-cache-visibility.md)
     - [Split oversized test/support file test/rebalancer/replace-replica-workflow-tail-more-test-cases.js](../packages/done-20260524-oversized-rebalancer-replace-replica-workflow-tail-more-cases.md)
     - [Split oversized test/support file test/control-plane/replica-dispatch-node-state-update.test-part-3.js](../packages/done-20260524-oversized-control-plane-replica-dispatch-node-state-bravo.md)
     - [Split oversized test/support file test/control-plane/active-node-projection.test.js](../packages/done-20260524-oversized-control-plane-active-node-alpha.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/cluster.test-part-2.js](../packages/done-20260524-oversized-distributed-harness-golf.md)
     - [Split oversized test/support file test/migration/migration-coordinator-core.test.js](../packages/done-20260524-oversized-migration-migration-coordinator-core.md)
     - [Split oversized test/support file test/distributed/run.js](../packages/done-20260524-oversized-distributed-run.md)
     - [Split oversized test/support file test/rebalancer/rebalance-coordinator-atomic-transitions.test.js](../packages/done-20260524-oversized-rebalancer-rebalance-coordinator-atomic-transitions.md)
     - [Split oversized test/support file test/bootstrap/connect-websocket-phase.test.js](../packages/done-20260524-oversized-bootstrap-connect-websocket-phase.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js](../packages/done-20260524-oversized-distributed-harness-failure-bundle-core-cases.md)
     - [Split oversized test/support file test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js](../packages/done-20260524-oversized-distributed-harness-cluster-active-gate-startup-acknowledgement.md)
     - [Split oversized test/support file test/admin/admin-control-snapshot-tail-test-cases.js](../packages/done-20260524-oversized-admin-admin-control-snapshot-tail-cases.md)
     - [Split oversized test/support file test/topology/cdc-group-propagation-service.test.js](../packages/done-20260524-oversized-topology-cdc-group-propagation-alpha.md)
     - [Split oversized test/support file test/query/query-executor.test-part-3.js](../packages/done-20260524-oversized-query-query-foxtrot.md)
     - [Split oversized test/support file test/distributed/harness/failure-bundle-segment-6.js](../packages/done-20260524-oversized-distributed-harness-failure-charlie.md)
     - [Split oversized test/support file test/distributed/harness/report-writer.js](../packages/done-20260524-oversized-distributed-harness-report-writer.md)
     - [Split oversized test/support file test/distributed/harness/failure-bundle-segment-2.js](../packages/done-20260524-oversized-distributed-harness-failure-delta.md)
     - [Split oversized test/support file test/rebalancer/quorum-conditioned-remove-safety.test.js](../packages/done-20260524-oversized-rebalancer-quorum-conditioned-remove-safety.md)

11. [Split replica-dispatch-node-state-update test-part-2 below file-size limit](../packages/done-20260524-replica-dispatch-node-state-update-test-part-2-suites.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Split semantically grouped replica-dispatch-node-state-update test-part-2 suites until `test/control-plane/replica-dispatch-node-state-update.test-part-2.js` is below the configured test file-size limit.
   - First-run reason: next largest oversized test file in the current audit (2519 lines).

12. [Fix four hard steering-doc contradictions](../packages/done-20260525-steering-docs-contradictions-fix.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Align steering docs with the enforced reality of the file-size script (src 800 / test 1500), default `theoryLedgerRefs` to `[]` so new packages are not born invalid, document the closure validator's required `parent revalidated focused proof: yes` grammar, and add an atomic Closure Recipe to `core.md` and `boot.md`.
   - First-run reason: each of these four ambiguities cost real workflow time during the May 24 oversized-file tranche, and the contradictions are still active in the steering surface.

13. [Document Sprint Queue Maintenance procedure](../packages/done-20260525-sprint-queue-maintenance-procedure.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add a `Sprint Queue Maintenance` section to `work/RULES.md` describing how to insert, renumber, and cross-link sprint queue items when closing a package or inserting new work, and link it from `boot.md` so LLM agents follow the same procedure observed in recent oversized-file closures.
   - First-run reason: sprint queue mutation was undocumented; the procedure was reconstructed by reading prior commits rather than steering, which is the LLM-ambiguity class this sprint already promised to eliminate.

14. [Collapse cross-domain rule duplicates via canonical_of](../packages/done-20260525-steering-pack-canonical-of-aliases.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add a `ruleAliases` mechanism to the steering pack generator so cross-pack duplicate rules collapse to a single master id; rules.json gains `canonical_of` / `aliases` fields and per-domain markdown packs suppress alias rules. Six duplicate groups (no-ordinal-filenames, null-state-encoding, file-size thresholds, cache-observes-owners-decide, no-skipped-tests, do-not-weaken-guardrails) collapse to one master each.
   - First-run reason: identical rules were emitted under up to four IDs across architecture/style/testing/governance packs, forcing LLM agents to cite different IDs for the same rule depending on which pack happened to be loaded.

15. [Reject aphoristic rules and emit citation links in generated packs](../packages/done-20260525-steering-pack-no-aphorisms.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add an aphorism heuristic to the steering pack generator that rejects admonition-marker prefixes (e.g. `STOP -`, `DO NOT IGNORE -`) and dangling-pronoun openings followed by action verbs (e.g. `They do not replace…`), and append a per-rule `(see file:line)` citation to every emitted rule in the per-domain markdown packs. Rewrites the cited STOP/ANALYZE/FIX and DO NOT IGNORE/DEFER/INVESTIGATE/FIX/VERIFY admonition lists in harness.md and regression-policy.md, and resolves the orphan pronoun in subagents.md.
   - First-run reason: cited examples (TEST-0011, TEST-0019, ARCH-0029, GOV-0021) showed that the generator was emitting rules an LLM could not act on without guessing — either bare imperatives with no trigger or pronouns with no antecedent — and rules carried no link back to their source for verification.

16. [Collapse boot.md authority order to three runtime levels](../packages/done-20260525-boot-authority-order-collapse.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Rewrite `.kiro/steering/llm/boot.md` Authority Order from six levels to three runtime levels (user instructions and safety limits; `work/RULES.md` + `npm run work:context`; domain packs scoped by lane and touched boundary). Remove the runtime "source vs pack" distinction; pack staleness is repaired by regenerating, not by selectively preferring source steering at execution time. Update the Conflict Rule section and the generated README pack-truth note to match.
   - First-run reason: the previous six-level order combined runtime authority with load-surface ordering and generator staleness in one numbered list, so an LLM could not tell whether to follow a compact pack rule when its source happened not to be loaded. Items #4 ("source wins") and #5 ("packs are default load surface") directly contradicted each other at execution time.

17. [Boot lane closure tails and steering doc final cleanups](../packages/done-20260525-steering-docs-final-cleanups.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Append a four-step **Closure Tail** (work:validate --closure → rename + sed status → work:repair → focused commit + push) inline to every lane block in `boot.md` so an LLM reading a single lane sees the full closure ceremony without scrolling; merge the redundant AGENTS.md L31-34 paragraph into the surrounding sentence; rewrite `core.md` Template Picker as a 1-to-1 lane→template mapping table; remove the silently-drifting `Generated rules` / `Estimated tokens` / `Domains` header lines from generated per-domain packs (manifest.json already tracks these numbers).
   - First-run reason: every lane block previously ended before the closure ceremony, only the `proof` lane mentioned `work:validate --closure`, and no lane mentioned `work:repair` or the rename+commit+push sequence — forcing the LLM to reconstruct the procedure from prior package history. The inline rule-count headers in `architecture.md` and `testing.md` were duplicating manifest data that drifts silently when the generator changes domains.

18. [Rolling Restart Active Gate Snapshot Coverage Repair](../packages/done-20260523-rolling-restart-active-gate-snapshot-coverage-repair.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Align active-gate cohort fallbacks and repair snapshot recovery projection logic.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:validate -- --pre-impl <package>`
4. Run focused cluster and rebalancer tests.
5. Run representative reruns to verify stability.
6. `npm run work:validate -- --closure <package>` before closure.

## Closure Rules

1. The sprint closes only after all queued packages are completed (renamed to `done-...`) or explicitly superseded.
2. Stability must be proven by a green representative rerun or a clear, bounded successor blocker.
3. All commits must be focused, clean, and contain only package-owned files and allowed sprint handoffs.
4. The sprint must not resume runtime stability package execution while `npm run audit:file-size` or `npm run work:oversized-next -- --markdown` still names oversized-file candidates without a concrete front-of-queue cleanup package.
