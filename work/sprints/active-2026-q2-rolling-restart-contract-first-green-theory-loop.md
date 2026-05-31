# Sprint: Rolling Restart Contract-First Green Theory Loop

Status: active. Opened on May 31, 2026.
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
  `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json`
- Current residual:
  `accept_classified_backpressure`
- Current owner and boundary:
  `operation_workflow_owner / rebalancer_handoff`
- Current dominant reason:
  `priority_recovery_event_driven_wait`

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

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json
Visible first frontier: accept_classified_backpressure / operation_workflow_owner / rebalancer_handoff
Active package: work/packages/done-20260531-rolling-restart-contract-first-route-discriminator.md
Active package owner: release_gate_owner
Active package boundary: rolling_restart_fully_green_gate
Selected cause: contract_first_route_selection
Required action: Close the discriminator as accepted-backpressure route selection and open fresh representative rolling-restart evidence before runtime source work.
Representative status: needs-rerun
Causal outcome: classification-only
Architecture gate: not-required / unknown
Expected delta: The active route becomes fresh representative evidence after accepted classified backpressure; runtime source promotion remains blocked until the rerun selects a stable local blocker.
Current state: Package opened to classify the active rolling-restart residual before more runtime edits.
Allowed edits: work/packages/done-20260531-rolling-restart-contract-first-route-discriminator.md, work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md, work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-system-theory-rederive.md, work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md, work/sprints/superseded-2026-q2-spec-led-runtime-modularization.md, architecture/contracts/rolling-restart-rebalancer-handoff.md, work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/theory-ledger.md
Candidate runtime files: src/rebalancer/operation-workflow-owner-ports.js, src/control-plane/publication-active-gate-handoff-contract-decision.js
Forbidden edits: model contracts fail, route evidence is stale or ambiguous, proof does not select exactly one next owner-boundary route
Required latest proof: falsifier: npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write, regression: npm run model:contracts, supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. `active` -
   `work/packages/done-20260531-rolling-restart-contract-first-route-discriminator.md`
   - Contract/model gates are green after contract reference repair. The
     current residual is accepted classified backpressure, so the selected next
     route is fresh representative evidence before runtime source work.

2. `todo` - Fresh representative rolling-restart rerun gate
   - Run only after the route discriminator closes. If it is green, close the
     sprint; if it is red, route the fresh first frontier before runtime edits.

3. `todo` - Runtime owner implementation or representative green closure package
   - Created only after fresh representative evidence selects a stable local
     owner/boundary or exits green.

## Sprint Proof Ladder

Before closing this sprint, record the following evidence:

- `npm run model:contracts`
- The selected route discriminator command.
- The implementation package proof command for the chosen owner/boundary.
- The final representative rolling-restart command and artifact.
- `npm run work:validate -- --closure`

## Theory Loop Success Evidence

- Success condition met: no
- Result: classification-only; accepted classified backpressure selected fresh
  representative rerun before runtime source work
- Matched original success condition: no
- Evidence artifact: pending
- Closure package: pending

## Joint Coupled-Invariant Probe

- Command: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --explain snapshot_coverage
- Last run: 2026-05-31
- Last residual count: 7
- Residual trend: unknown
- Boundaries covered: release_gate_owner / rolling_restart_fully_green_gate, startup_active_gate_owner / snapshot_coverage

## Operating Rules

- Do not mark this sprint done while the rolling-restart representative evidence
  still reports an active residual.
- If the same frontier repeats twice without a new discriminator, stop and create a
  discovery-framing package instead of editing runtime code again.
- If the discriminator shows a contract record is wrong or incomplete, update the
  contract first, then regenerate or rerun the executable model gate.
