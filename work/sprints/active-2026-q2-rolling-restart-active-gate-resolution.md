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
- Current causal thesis: model contracts are green and fresh representative
  evidence after the observation-route source change still selects
  `active_gate_snapshot_coverage` under `startup_active_gate_owner /
  snapshot_coverage` with `owner_reconcile_pending`; the source-route shape is
  visible as `wait_owner_recovery` with one pending recovery node and zero pending
  reconcile nodes, but runtime promotion is blocked by saturated same-frontier
  history until a non-repeated route is selected.
- Competing hypotheses: H1 a new non-repeated active-gate source contract exists
  for `selected_snapshot_source_timeout` plus `snapshot_repair_deferred`; H2 the
  same evidence is an architecture-gap stop; H3 ownership migrates to startup
  readiness after active-gate coverage improves; H4 the evidence becomes
  unavailable or contradictory.
- Confidence and evidence: high — the active-gate model route is liveness-proven
  (`test-output/reports/active-gate-tlc-route.model.report.json`,
  `livenessHolds: true`) and the selected observation route is recorded in
  `architecture/contracts/active-gate-convergence.md`.
- Expected green path: select one non-repeated successor route from the fresh
  same-frontier evidence, then open only the selected runtime, migration,
  representative-green, or architecture-gap package.
- Wrong direction signals: editing runtime before the discriminator selects the
  route, widening scope beyond the declared owner/boundary, or treating
  classification-only output as sprint success.
- Next best package:
  `work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md`
- Redirect rule: if the rerun is red, run canonical route/evidence tools and open
  the selected successor; do not stop the theory loop on non-terminal
  classification, same-frontier, migration, or architecture-gap evidence.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending
Active package: none
Active package owner: representative_evidence_owner
Active package boundary: rolling_restart_rerun
Selected cause: post_observation_route_rerun
Required action: Close the rerun as same-frontier and queue the same-frontier architecture experiment before any runtime source write.
Representative status: same-frontier
Causal outcome: continue_local_fix
Architecture gate: watching / unknown
Expected delta: Fresh representative evidence stayed same-frontier but exposed the source-route shape; open the selected architecture experiment to choose a non-repeated route before runtime promotion.
Current state: Fresh representative rolling-restart evidence after the observation-route source implementation stayed same-frontier at active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending.
Allowed edits: work/packages/done-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md, work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md, work/theory-ledger.md
Candidate runtime files: unknown
Forbidden edits: Verification must not edit runtime files.
Required latest proof: falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose, regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage, supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
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
3. `todo` -
   [Rolling Restart Active Gate Observation Route Same Frontier Architecture Experiment](work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md)
   - Same-frontier architecture discriminator after the fresh rerun stayed at
     active_gate_snapshot_coverage with runtimePromotionGuard blocked.

## Sprint Proof Ladder

Before closing this sprint, record the following evidence:

- `npm run model:contracts`
- The selected route discriminator command.
- The implementation package proof command for the chosen owner/boundary.
- The final representative rolling-restart command and artifact.
- `npm run work:validate -- --closure`

## Joint Coupled-Invariant Probe

- Command: npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage
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
