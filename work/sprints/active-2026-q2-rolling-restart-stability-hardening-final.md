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
Active package: work/packages/active-20260524-cdc-integration-service-semantic-modules.md
Active package owner: cdc_integration_service_owner
Active package boundary: semantic_service_modules
Selected cause: oversized_file_ratchet
Required action: Extract semantically named CDC integration service modules until src/cdc/cdc-integration-service-segment-3.js is below the configured source file-size limit without changing behavior.
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: New package scaffolded from the shared work-package schema.
Allowed edits: src/cdc/cdc-integration-service-segment-3.js, src/control-plane/publication-active-gate-handoff-contract.js, src/control-plane/publication-active-gate-handoff-contract-constants.js, src/control-plane/publication-active-gate-handoff-contract-decision.js, src/control-plane/publication-active-gate-handoff-contract-evidence.js, src/control-plane/publication-active-gate-handoff-contract-fence.js, src/control-plane/publication-active-gate-handoff-contract-helpers.js, src/control-plane/publication-active-gate-handoff-contract-selection.js, src/control-plane/publication-active-gate-handoff-contract-workflow.js
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: npm run audit:owner-boundary-segments -- src/cdc/cdc-integration-service-segment-3.js
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

5. [Bring CDC integration service API below file-size limit](../packages/active-20260524-cdc-integration-service-semantic-modules.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named CDC integration service modules until `src/cdc/cdc-integration-service-segment-3.js` is below the source file-size limit.
   - First-run reason: next top owner-boundary segment candidate from `npm run work:oversized-next -- --markdown`.

6. [Bring operation workflow owner below file-size limit](../packages/todo-20260524-operation-workflow-owner-semantic-modules.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Extract semantically named operation workflow owner modules until `src/rebalancer/operation-workflow-owner-segment-6.js` is below the source file-size limit.
   - First-run reason: next top owner-boundary segment candidate from `npm run work:oversized-next -- --markdown`.

7. [Split quorum conditioned remove safety tail tests below file-size limit](../packages/todo-20260524-quorum-conditioned-remove-safety-test-suites.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Split semantically grouped quorum conditioned remove-safety test suites until `test/rebalancer/quorum-conditioned-remove-safety-tail-test-cases.js` is below the test file-size limit.
   - First-run reason: largest oversized test file reported by `npm run audit:file-size`.

8. [Split node joining service tests below file-size limit](../packages/todo-20260524-node-joining-service-test-suites.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Split semantically grouped node joining service test suites until `test/bootstrap/node-joining-service.test.js` is below the test file-size limit.
   - First-run reason: next largest oversized test file in the current audit.

9. [Split membership publication coordinator tests below file-size limit](../packages/todo-20260524-membership-publication-coordinator-test-suites.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Split semantically grouped membership publication coordinator test suites until `test/control-plane/membership-publication-coordinator-main-stage-2.js` is below the test file-size limit.
   - First-run reason: next largest oversized test file in the current audit.

10. Rerun `npm run audit:file-size` and `npm run work:oversized-next -- --markdown`; if any oversized files remain, insert the next concrete oversized-file packages here before resuming runtime stability work.
   - Lane: `lightweight-maintenance`
   - Purpose: Keep the sprint's front of queue pointed at the current largest source/test and owner-boundary oversized files until the audit reaches zero oversized files.
   - First-run reason: the current audit reports 154 source oversized files and 60 test oversized files, so this first tranche cannot complete the full backlog by itself.

11. [Rolling Restart Active Gate Snapshot Coverage Repair](../packages/done-20260523-rolling-restart-active-gate-snapshot-coverage-repair.md)
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
