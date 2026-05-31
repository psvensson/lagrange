# Sprint: Rolling Restart Contract-First Green Theory Loop

Status: done. Opened on May 31, 2026.
systemTheoryRederivedAt: 2026-05-31

## Goal

Get the rolling-restart path green by running a contract-first theory loop rather
than continuing package-by-package frontier chasing.

This sprint starts from the final residual of
`work/sprints/superseded-2026-q2-spec-led-runtime-modularization.md`: a rerun that
stayed at `accept_classified_backpressure` under
`operation_workflow_owner / rebalancer_handoff`.

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

- `architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff`
- `architecture/contracts/active-gate-convergence.md#active-gate-convergence`
- `architecture/contracts/package-lifecycle.md#package-lifecycle`

## Theory Loop Shape

This sprint uses a two-level theory loop.

- System theory: the rolling-restart path is blocked by a contract mismatch between
  priority recovery, rebalancer handoff, active-gate convergence, and publication
  handoff.
- Slice theory: each package must isolate one owner/boundary pair and make one
  observable prediction before editing runtime code.
- Model gate: packages should use executable decision tables, statecharts, TLA+
  specs, or contract checks where those artifacts can express the invariant more
  cheaply than another representative runtime rerun.
- Promotion rule: a package may edit runtime code only after the discriminator
  selects one owner/boundary path and names the expected green movement.

## Parallel Diagnostics

This sprint may use read-only subagent scouts before selecting a successor route.
The coordinator remains the only actor allowed to change package status,
current-blocker files, sprint state, package queues, or theory-ledger decisions.

The active fresh-rerun package requests these cards after a red rerun route, or
before any runtime successor opens:

- `evidence-scout`: decide whether the new evidence is stale, accepted, causal,
  contradictory, or green-capable.
- `model-contract-scout`: decide whether contract/model records support the
  selected route.
- `source-map-scout`: map the selected owner/boundary to candidate source files
  without editing them.

Coordinator commands:

- `npm run work:agent:plan -- --package work/packages/done-20260531-rolling-restart-fresh-representative-rerun-gate.md`
- `npm run work:agent:collect -- --package work/packages/done-20260531-rolling-restart-fresh-representative-rerun-gate.md`
- `npm run work:agent:validate -- --package work/packages/done-20260531-rolling-restart-fresh-representative-rerun-gate.md`

## Sprint Strategy Brief

- Goal state: representative rolling-restart evidence exits green with no active
  residual at priority-recovery, active-gate, or publication handoff frontiers.
- Current causal thesis: model contracts are green, release-gate observation-gap
  saturation was rederived, and fresh representative evidence drained
  priority-recovery residual witnesses to zero but selected
  active_gate_snapshot_coverage under startup_active_gate_owner /
  snapshot_coverage.
- Competing hypotheses: H1 the observation-layer architecture route moves
  active-gate snapshot coverage toward convergence; H2 the same evidence remains
  architecture-gap and must select a different route; H3 ownership migrates to
  startup readiness after active-gate coverage improves; H4 the evidence becomes
  unavailable or contradictory.
- Confidence and evidence: `npm run model:contracts` passed in
  `work/packages/done-20260531-rolling-restart-contract-first-route-discriminator.md`,
  and canonical route evidence selected `accept_classified_backpressure`.
- Expected green path: close the fresh rerun package as reduced, run the
  startup_active_gate_owner / snapshot_coverage observation-route successor,
  then rerun representative evidence and continue only from green, migration,
  reduction, or one canonical successor.
- Wrong direction signals: rerouting from the stale artifact, editing runtime
  before fresh evidence, or treating classification-only output as sprint
  success.
- Next best package:
  `work/packages/active-20260531-rolling-restart-active-gate-observation-route.md`
- Redirect rule: if the rerun is red, run canonical route/evidence tools and
  open the selected successor; do not stop the theory loop on non-terminal
  classification, same-frontier, migration, or architecture-gap evidence.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-contract-first-green-rerun.report.json
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending
Active package: work/packages/active-20260531-rolling-restart-active-gate-observation-route.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: owner_reconcile_pending
Required action: Implement the selected observation-layer architecture route so selected snapshot observation retry produces owner-owned snapshot coverage progress.
Representative status: active-theory-loop
Causal outcome: continue_local_fix
Architecture gate: selected / continue-local-proof
Expected delta: The selected observation-layer architecture route is implemented locally, then fresh representative evidence must reduce active_gate_snapshot_coverage, migrate, go green, or record architecture-gap.
Current state: Frontier history reports startup_active_gate_owner / snapshot_coverage is in architecture-route implement-pending state after the selected architecture-gap route; this package is the bounded observation-layer implementation, not another unguided local slice.
Allowed edits: work/packages/active-20260531-rolling-restart-active-gate-observation-route.md, src/control-plane/publication-active-gate-handoff-contract-decision.js, work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md, work/theory-ledger.md
Candidate runtime files: src/control-plane/publication-active-gate-handoff-contract.js, src/control-plane/publication-active-gate-handoff-contract-selection.js, src/control-plane/membership-publication-active-gate-reconcile.js
Forbidden edits: Selected snapshot observation retry must create owner-owned snapshot coverage progress before downstream readiness or release-gate logic reinterprets the active-gate state.
Required latest proof: falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js, regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js, supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12, supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage, supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json
Allowed stop modes: success-condition-met only; representative-green, owner-boundary-migration, architecture-gap, same-frontier, classification-only, needs-rerun, pending, and unknown are package outcomes unless they exactly match the original sprint success condition
```

## Package Queue

1. `done` -
   [Rolling Restart Contract First Route Discriminator](work/packages/done-20260531-rolling-restart-contract-first-route-discriminator.md)
   - Contract/model gates are green after contract reference repair. The
     current residual is accepted classified backpressure, so the selected next
     route is fresh representative evidence before runtime source work.

2. `done` -
   [Rolling Restart Fresh Representative Rerun Gate](work/packages/done-20260531-rolling-restart-fresh-representative-rerun-gate.md)
   - Rederived the release gate and ran fresh representative evidence. The
     artifact is red but reduced priority-recovery residuals to zero and routes
     to active_gate_snapshot_coverage / startup_active_gate_owner /
     snapshot_coverage.

3. `active` -
   [Rolling Restart Active Gate Observation Route](work/packages/active-20260531-rolling-restart-active-gate-observation-route.md)
   - Selected observation-layer architecture-route implementation for the fresh
     active-gate owner_reconcile_pending frontier.

## Sprint Proof Ladder

Before closing this sprint, record the following evidence:

- `npm run model:contracts`
- The selected route discriminator command.
- The implementation package proof command for the chosen owner/boundary.
- The final representative rolling-restart command and artifact.
- `npm run work:validate -- --closure`

## Theory Loop Success Evidence

- Success condition met: no
- Result: reduced; fresh representative evidence drained priority-recovery
  residual witnesses to zero and selected active_gate_snapshot_coverage under
  startup_active_gate_owner / snapshot_coverage
- Matched original success condition: no
- Evidence artifact:
  `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- Closure package:
  `work/packages/done-20260531-rolling-restart-fresh-representative-rerun-gate.md`

## Joint Coupled-Invariant Probe

- Command: npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain active_gate_snapshot_coverage
- Last run: 2026-05-31
- Last residual count: 0
- Residual trend: decreasing
- Boundaries covered: release_gate_owner / rolling_restart_fully_green_gate, startup_active_gate_owner / snapshot_coverage

## Operating Rules

- Do not mark this sprint done while the rolling-restart representative evidence
  still reports an active residual.
- If the same frontier repeats twice without a new discriminator, stop and create a
  discovery-framing package instead of editing runtime code again.
- If the discriminator shows a contract record is wrong or incomplete, update the
  contract first, then regenerate or rerun the executable model gate.
