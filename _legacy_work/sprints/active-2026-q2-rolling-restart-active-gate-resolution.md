# Sprint: Rolling Restart Active Gate Resolution

Status: active. Opened on May 31, 2026.
systemTheoryRederivedAt: 2026-05-31

## Goal

Solve the remaining rolling-restart failures by driving the active-gate
snapshot-coverage frontier to representative-green, continuing the contract-first
theory loop rather than package-by-package frontier chasing.

This sprint is the runtime successor to
`work/sprints/done-2026-q2-rolling-restart-contract-first-green-theory-loop.md`,
which was retired with its success condition unmet (representative evidence still
red at `active_gate_snapshot_coverage`). It is kept distinct from the framework
sprint `work/sprints/done-2026-q2-system-reasoning-surface-upgrade.md` per CORE-02
(one bounded concern per sprint): that sprint delivered the reasoning surface
(invariant registry, systemTheory home, model-proven-route forcing, model-coverage
trigger, circuit breaker, owner dossier); this sprint owns the runtime frontier.

## Success Condition

This sprint is complete only when representative rolling-restart evidence exits
green and records no active residual at the priority-recovery, active-gate, or
publication handoff frontiers.

The success evidence must include:

- The representative rolling-restart command and artifact path.
- The exact model or contract checks run before the representative evidence.
- The observed owner and boundary result.
- The package that closed the final residual.

## Evidence Anchor

- Current representative artifact:
  `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- Current residual:
  `active_gate_snapshot_coverage`
- Current owner and boundary:
  `startup_active_gate_owner / snapshot_coverage`
- Current dominant reason:
  `owner_reconcile_pending`

## System Contract Records

All implementation packages in this sprint must name the system contract they are
testing or changing.

- `architecture/contracts/active-gate-convergence.md#active-gate-convergence`
- `architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff`
- `architecture/contracts/package-lifecycle.md#package-lifecycle`

## Theory Loop Shape

This sprint uses a two-level theory loop.

- System theory: the rolling-restart path is blocked by a contract mismatch between
  priority recovery, rebalancer handoff, active-gate convergence, and publication
  handoff; the current first frontier is active-gate snapshot coverage.
- Slice theory: each package must isolate one owner/boundary pair and make one
  observable prediction before editing runtime code.
- Model gate: packages should use executable decision tables, statecharts, TLA+
  specs, or contract checks where those artifacts can express the invariant more
  cheaply than another representative runtime rerun. The active-gate pair now has a
  liveness-proven model route recorded in the contract record, so the reasoning
  surface (R15 model-proven-route forcing) constrains re-analysis.
- Promotion rule: a package may edit runtime code only after the discriminator
  selects one owner/boundary path and names the expected green movement.

## Parallel Diagnostics

This sprint may use read-only subagent scouts before selecting a successor route.
The coordinator remains the only actor allowed to change package status,
current-blocker files, sprint state, package queues, or theory-ledger decisions.

## Sprint Strategy Brief

- Goal state: representative rolling-restart evidence exits green with no active
  residual at priority-recovery, active-gate, or publication handoff frontiers.
- Current causal thesis: the priority-recovery representative rerun kept the first
  frontier at `priority_recovery_partition_progress` under
  `operation_workflow_owner / rebalancer_handoff`, but reduced the residual from
  8 witnesses to 2. The model/contract route now distinguishes
  `representativeRerunRoute=eligible` from `blocked_model_route` so accepted
  backpressure under the representative-progress circuit breaker cannot emit a
  repeated representative rerun.
- Competing hypotheses: H1 priority recovery drains on one more fresh
  representative rerun; H2 priority recovery repeats with no reduction and must
  redirect to a concrete runtime/tooling successor or architecture analysis; H3
  ownership migrates after priority recovery clears; H4 evidence becomes
  unavailable or contradictory.
- Confidence and evidence: high — the active-gate model route is liveness-proven
  (`test-output/reports/active-gate-tlc-route.model.report.json`,
  `livenessHolds: true`) and the selected observation route is recorded in
  `architecture/contracts/active-gate-convergence.md`.
- Expected green path: close the repaired rebalancer-handoff decision table and
  contract route, then open only the selected concrete successor from the
  repaired route: runtime transition, evidence regeneration, owner migration, or
  architecture-stop continuation.
- Wrong direction signals: editing runtime before the discriminator selects the
  route, widening scope beyond the declared owner/boundary, or treating
  classification-only output as sprint success.
- Next best package:
  `work/packages/done-20260531-representative-rerun-progress-model-coverage-binding.md`
- Redirect rule: if the rederive cannot select one route, open the
  architecture-gap or contract/model repair successor; do not stop the theory
  loop on non-terminal classification, same-frontier, migration, or
  architecture-gap evidence.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json
Visible first frontier: operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait
Active package: work/packages/active-20260601-rolling-restart-priority-recovery-rebalancer-handoff-backpressure-drain-residual-split.md
Active package owner: operation_workflow_owner
Active package boundary: rebalancer_handoff
Selected cause: priority_recovery_event_driven_wait
Required action: Implement a retry timer/scheduling re-arm in the operation workflow rebalancer handoff path so stuck event-driven waits can advance retry states.
Representative status: active-theory-loop
Causal outcome: accept_classified_backpressure
Architecture gate: watching / unknown
Expected delta: Implementing a retry timer in the event-driven progress path of rebalancer handoff allows event-driven wait states to re-arm and drain.
Current state: Escalation package confirmed H2: backpressure drains are stalled in event-driven wait and require a scheduling-layer timer or retry.
Allowed edits: src/rebalancer/operation-workflow-owner-ports.js, test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js, .gitignore, .kiro/steering/code-style.md, .kiro/steering/doctrine/INDEX.md, .kiro/steering/llm/architecture.md, .kiro/steering/llm/boot.md, .kiro/steering/llm/core.md, .kiro/steering/llm/governance.md, .kiro/steering/llm/manifest.json, .kiro/steering/llm/rules.json, .kiro/steering/roadmap.md, .kiro/steering/system-guidelines.md, .kiro/steering/workflow-guidelines/lifecycle.md, AGENTS.md, scripts/list-commands.js, scripts/work-context.js, scripts/work-llm-start.js, scripts/work-summary.js, scripts/work-tracker.js, test/scripts/list-commands.test.js, test/scripts/work-context.test.js, test/scripts/work-llm-usability-tools.test.js, work/RULES.md, test/scripts/work-tracker-analysis-loop-cap.test.js, test/scripts/work-tracker-iteration-log.test.js
Candidate runtime files: unknown
Forbidden edits: rebalancer_handoff retry progress timer re-arms event-driven wait state on retry scheduler
Required latest proof: falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js, regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress, supporting: npm run work:advance -- --check
Allowed stop modes: success-condition-met only; representative-green, owner-boundary-migration, architecture-gap, same-frontier, classification-only, needs-rerun, pending, and unknown are package outcomes unless they exactly match the original sprint success condition
```

## Package Queue

1. `done` -
   [Rolling Restart Active Gate Observation Route](work/packages/done-20260531-rolling-restart-active-gate-observation-route.md)
   - Selected observation-layer architecture-route implementation for the fresh
     active-gate owner_reconcile_pending frontier. Carried over from the retired
     contract-first theory-loop sprint.
2. `done` -
   [Rolling Restart Active Gate Observation Route Rerun Gate](work/packages/done-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md)
   - Fresh representative rolling-restart rerun after the observation-layer
     source route, then canonical route classification before any further
     runtime package.
3. `superseded` -
   [Rolling Restart Active Gate Observation Route Same Frontier Architecture Experiment](work/packages/superseded-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md)
   - Same-frontier architecture discriminator after the fresh rerun stayed at
     active_gate_snapshot_coverage with runtimePromotionGuard blocked. Superseded
     after pre-implementation validation selected the model-proven route instead
     of another analysis package.
4. `superseded` -
   [Rolling Restart Active Gate Owner Recovery Retry Schedule](work/packages/superseded-20260531-rolling-restart-active-gate-owner-recovery-retry-schedule.md)
   - Candidate source package for the model-proven observation route. Superseded
     because pre-implementation validation blocked another local active-gate
     slice and fresh representative evidence migrated to priority recovery.
5. `done` -
   [Rolling Restart Active Gate Post Architecture Gap Rerun Gate](work/packages/done-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md)
   - Fresh representative rerun selected because the source successor is blocked
     before implementation by the representative-progress circuit breaker.
     Closed as migrated to priority recovery rebalancer handoff.
6. `done` -
   [Rolling Restart Priority Recovery Backpressure Rerun Gate](work/packages/done-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md)
   - Fresh representative rerun after priority recovery was classified as
     retryable backpressure with zero failed invariants. Closed as reduced:
     witnesses dropped from 8 to 2 while the same priority-recovery frontier
     remained first.
7. `superseded` -
   [Rolling Restart Priority Recovery Backpressure Drain Rerun Gate](work/packages/superseded-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md)
   - Superseded before implementation because pre-implementation validation
     blocked another representative drain rerun under the progress circuit
     breaker.
8. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff System Theory Rederive](work/packages/done-20260530-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-system-theory-rederive.md)
   - System-theory rederive selected when the drain rerun is blocked by the
     representative progress circuit breaker and rebalancer handoff frontier
     history reports same-mechanism-repeat contract_gap.
9. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Contract Gap Architecture Experiment](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-architecture-experiment.md)
   - Architecture-gap successor selected workflow_tooling_owner /
     owner_dossier_contract_binding after proof found no non-repeated runtime
     transition and owner-dossier could not bind the valid rebalancer handoff
     System Contract Record.
10. `done` -
   [Owner Dossier Contract Owners Binding Repair](work/packages/done-20260531-owner-dossier-contract-owners-binding-repair.md)
   - Workflow-tooling repair bound owner-dossier contract lookup to validated
     `owners[]` entries and now resolves the dedicated rebalancer handoff
     System Contract Record.
11. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Owner Wake Route](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-route.md)
   - Runtime architecture-route implementation for the selected scheduling-layer
     owner wake/progress path before another representative rerun.
12. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Owner Wake Rerun Model Gate](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-rerun-gate.md)
   - Model-layer route for the representative-progress circuit breaker after
     the focused owner wake proof blocks another direct rerun.
13. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Post Model System Theory Rederive](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-system-theory-rederive.md)
   - Rederive operation_workflow_owner / rebalancer_handoff after the
     model-blocked representative rerun route.
14. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Post Model Architecture Gap Experiment](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md)
   - Architecture-gap successor selected by the post-model rederive before
     runtime source promotion or another representative rerun.
15. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Decision Table Circuit Breaker Repair](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md)
   - Model/contract repair successor for accepted backpressure under the
     blocked representative-rerun circuit breaker.
16. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Blocked Rerun Route State](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md)
   - Runtime architecture-route implementation that emits the
     `blocked_model_route` discriminator from the rebalancer handoff progress
     contract for the repaired decision-table route.
17. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Blocked Route Rerun Gate](work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md)
   - Architecture-gap analysis after the runtime progress contract emits
     `blocked_model_route`; direct rerun is blocked by the representative
     progress circuit breaker and selects model coverage binding.
18. `done` -
   [Workflow Admin Metadata Derivation](work/packages/done-20260531-workflow-admin-metadata-derivation.md)
   - Workflow-tooling maintenance to derive package lifecycle, scope, route,
     result, and sprint handoff views from package metadata instead of
     hand-maintained mirror state.
19. `done` -
   [Representative Rerun Progress Model Coverage Binding](work/packages/done-20260531-representative-rerun-progress-model-coverage-binding.md)
   - Bind the existing representative rerun progress model into a System
     Contract Record and invariant registry entries so owner-dossier reports
     proven coverage before another representative rerun is considered.
20. `done` -
   [Theory Loop Queue Exhaustion Guard](work/packages/done-20260601-queue-exhaustion-guard.md)
   - Workflow-tooling maintenance that prevents an active theory-loop sprint
     from reaching zero active/todo packages without terminal success evidence,
     blocked termination evidence, or an autonomous successor package.
21. `done` -
   [Representative Rerun Progress Model Route Decision](work/packages/done-20260601-representative-rerun-progress-model-route-decision.md)
   - Classification successor that uses the proven representative rerun progress
     model coverage to select the next legal route before any representative
     rerun, runtime promotion, migration, or architecture continuation.
22. `done` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Backpressure Drain Escalation](work/packages/done-20260601-rolling-restart-priority-recovery-rebalancer-handoff-backpressure-drain-escalation.md)
   - Escalate priority recovery backpressure under model-blocked representative rerun; analyze if backpressure drains or if rebalancer handoff requires scheduling-layer timer or manual recovery.
23. `active` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Backpressure Drain Residual Split](work/packages/active-20260601-rolling-restart-priority-recovery-rebalancer-handoff-backpressure-drain-residual-split.md)
   - Implement a retry timer/scheduling re-arm in the operation workflow rebalancer handoff path so stuck event-driven waits can advance retry states.
24. `todo` -
   [Rolling Restart Priority Recovery Rebalancer Handoff Backpressure Drain Representative Rerun](work/packages/todo-20260601-rolling-restart-priority-recovery-rebalancer-handoff-backpressure-drain-representative-rerun.md)
   - Rerun the representative rolling-restart scenario to measure priority recovery progress.

## Sprint Proof Ladder

Before closing this sprint, record the following evidence:

- `npm run model:contracts`
- The selected route discriminator command.
- The implementation package proof command for the chosen owner/boundary.
- The final representative rolling-restart command and artifact.
- `npm run work:validate -- --closure`

## Joint Coupled-Invariant Probe

- Command: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress # rebalancer_handoff rolling_restart_rerun rolling_restart_fully_green_gate # coupled-invariant
- Last run: 2026-05-31
- Last residual count: 1
- Residual trend: decreasing
- Boundaries covered: startup_active_gate_owner / snapshot_coverage, release_gate_owner / rolling_restart_fully_green_gate

## Operating Rules

- Do not mark this sprint done while the rolling-restart representative evidence
  still reports an active residual.
- If the same frontier repeats twice without a new discriminator, stop and create a
  discovery-framing package instead of editing runtime code again.
- If the discriminator shows a contract record is wrong or incomplete, update the
  contract first, then regenerate or rerun the executable model gate.
