# Rolling Restart Three Theory Recovery Sprint

Status: active. Created on May 26, 2026.

## Goal

Test the three current rolling-restart theories, fix only confirmed bugs, rerun the representative `rolling-restart` scenario, and route the fresh artifact.

## Sprint Strategy Brief

- Goal state: Representative `rolling-restart` is green, or the fresh artifact shows a reduced/migrated first frontier with concrete metrics and exactly one successor owner boundary.
- Work Ratio Rule: Explicitly allocate 90% of development effort/time to analyzing, diagnosing, and repairing source code files (`src/`), and 10% of effort/time to reading, updating, or editing markdown files (`work/` / `.md`).
- Current causal thesis: Gather experimental evidence for or against the top three rolling-restart theories, diagnose target source code paths, and repair confirmed bugs.
- Competing hypotheses:
  - H1 (Snapshot Source Staleness/Overload): Node `7493b0ab` is the selected snapshot source but experiences high query latency and timeouts under load, starving progress.
  - H2 (Workflow Budget Mismatch): The coordinator classifies a healthy backpressure wait as a timeout due to a diagnostic/capture mismatch where actual deadlines had expired.
  - H3 (Selected-View vs Best-View Split): The coordinator's view of active publication coverage lags a fresher quorum or best viewpoint due to un-retained per-node probe details.
- Confidence and evidence: High for representative movement. Current active gate snapshot coverage timeout has been successfully resolved, downstream operation workflow progress has been unblocked, and the frontier has shifted downstream.
- Expected green path: Run experimental scenarios, analyze corresponding codebase modules under `src/` to confirm or falsify each theory, fix verified bugs, rerun rolling-restart to collect fresh evidence, and route the resulting metrics.
- Wrong direction signals: Raising timeouts, ignoring load-induced query stress, or bypassing priority recovery convergence issues.
- Next best package: work/packages/done-20260526-rolling-restart-operation-workflow-owner-workflow-progress.md
- Stop or escalate rule: If fresh evidence remains same-frontier with no reduction, transition to an autonomous architecture experiment or escalate if conflicting signals occur.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: priority_recovery_partition_progress
Active package: work/packages/done-20260526-rolling-restart-three-theory-source-analysis-verification.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Analyze source code under H1, H2, H3, run scenarios, find and fix bugs, rerun rolling-restart to collect fresh evidence
Representative status: reduced-migrated-after-h2-fix
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: New package scaffolded from the shared work-package schema.
Allowed edits: work/releases/0.1-dependency-map.md, work/tracks/topology-convergence.md, src/rebalancer/rebalance-coordinator-priority-budget-helper.js
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: falsifier: npm run work:advance -- --check, regression: npm run work:advance -- --check
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. All packages must select the lightest valid workflow lane as defined in `work/RULES.md#lane-definitions`.
2. Run `npm run work:context` and `npm run work:llm-start` before package activation or edits.
3. Do not modify runtime code without a preceding pre-implementation validator check (`npm run work:validate -- --pre-impl`).
4. Closure is atomic: rename packages to `done-...`, update theory ledger and edge cards, run closure validation (`npm run work:validate -- --closure`), then commit and push.
5. Do not widen timeouts or relax admission filters to mask underlying coordination errors.

## Package Queue

1. [Rolling Restart Three Theory Discriminator](../packages/done-20260526-rolling-restart-three-theory-discriminator.md)
   - Lane: `experiment`
   - Purpose: Test the selected snapshot timeout, deferred owner-recovery enqueue, and unreachable-node pressure theories, then promote only the confirmed fix.
   - First-run reason: Latest `rolling-restart` routes to `startup_active_gate_owner / snapshot_coverage` with priority recovery residuals cleared.
2. [Distributed Harness Scenario Teardown Cleanup](../packages/done-20260526-distributed-harness-scenario-teardown-cleanup.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Ensure teardown continues to stop node containers even when playback shutdown or diagnostics fail.
   - First-run reason: Residual harness processes and containers were suspected after scenario end.
3. [Control-Plane Priority Publication & ACK Handoff Triage](../packages/done-20260526-control-plane-priority-publication-ack-handoff-triage.md)
   - Lane: `diagnostic-classification`
   - Purpose: Explore publication coordinate state and ACK handoff logic.
   - First-run reason: Earlier `rolling-restart` evidence showed priority spread delays.
4. [Outbound Message Queue Backpressure Stabilization](../packages/done-20260526-outbound-message-queue-backpressure-stabilization.md)
   - Lane: `scenario-release-gate`
   - Purpose: Separate metadata control signals from data messages to stabilize outbound queue.
   - First-run reason: Earlier evidence showed priority recovery rebalancer handoff stalls due to outbound queue backpressure.
5. [Cache Watermark and Stale Operation Reconciler Hardening](../packages/done-20260526-cache-watermark-stale-operation-reconciler-hardening.md)
   - Lane: `scenario-release-gate`
   - Purpose: Proactively cancel or clean up obsolete replica operations on node rejoin.
   - First-run reason: Earlier evidence showed stale-operation reconciliation delaying coordinator active-gate snapshot progress.
6. [Artifact Triage - operation_workflow_owner - workflow_progress](../packages/done-20260526-rolling-restart-operation-workflow-owner-workflow-progress.md)
   - Lane: `causal-escalation`
   - Purpose: Repair workflow handoff state and classify the current `priority_recovery_partition_progress` edge before runtime edits.
   - First-run reason: Fresh `rolling-restart` evidence and generated current-blocker state selected `operation_workflow_owner / workflow_progress`, while track/release/package scope records still carried stale active references.
7. [Rolling Restart Three Theory Source Analysis and Verification](../packages/done-20260526-rolling-restart-three-theory-source-analysis-verification.md)
   - Lane: `causal-escalation`
   - Purpose: Analyze source code under H1, H2, H3, run scenarios, find and fix bugs, rerun rolling-restart to collect fresh evidence.
   - First-run reason: Test the three rolling-restart theories by analyzing source code, running experiments, and fixing bugs.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:validate -- --pre-impl <package>`
4. Run the package proof ladder before runtime edits.
5. `npm run work:validate -- --closure <package>` before closure.

## Closure Rules

1. The sprint closes only after all queued packages are completed (renamed to `done-...`) or explicitly superseded.
2. Stability must be proven by a green representative rerun or a clear, bounded successor blocker.
3. All commits must be focused, clean, and contain only package-owned files and allowed sprint handoffs.
