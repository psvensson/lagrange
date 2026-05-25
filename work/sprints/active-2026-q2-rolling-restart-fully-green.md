# Rolling Restart Fully Green Sprint

Status: active. Opened on May 25, 2026.

## Goal

Make `rolling-restart` fully green. This sprint is NOT considered done until the
representative `rolling-restart` scenario passes clean without timeouts,
admission relaxation, or unresolved topology/frontier blockers.

## Sprint Strategy Brief

- Goal state: representative `rolling-restart` is green with `active=5/5`,
  `snapshotCoverage=5/5`, `missingPublished=0`, zero priority-recovery
  residual witnesses, and clean convergence/adjudication.
- Current causal thesis: the previous resume-activation sprint proved the
  workflow-progress priority-recovery edge and migrated the remaining frontier
  to active-gate snapshot coverage, but migration is not green.
- Competing hypotheses: H1 the next rerun is green after workflow-progress fix;
  H2 active-gate snapshot coverage remains the first frontier; H3 a different
  owner/boundary emerges under fresh evidence.
- Confidence and evidence: medium; latest rerun reduced priority recovery
  witnesses from 5 to 0 but still failed at `active_gate_snapshot_coverage`.
- Expected green path: run the representative green gate, then either close as
  representative-green or keep this sprint active and open exactly one routed
  successor package for the first frontier.
- Wrong direction signals: declaring the sprint done on migrated/reduced
  evidence, widening timeouts, relaxing admission, or patching startup readiness
  before the routed owner/boundary is selected.
- Next best package:
  `work/packages/active-20260525-rolling-restart-fully-green-gate.md`.
- Stop or escalate rule: if a fresh rerun is red and same-frontier without
  concrete reduction, open/select an autonomous architecture experiment; human
  escalation only for contradictory or blocked evidence.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json
Visible first frontier: release_gate_owner/rolling_restart_fully_green_gate
Active package: work/packages/active-20260525-rolling-restart-fully-green-gate.md
Active package owner: release_gate_owner
Active package boundary: rolling_restart_fully_green_gate
Selected cause: representative_green_required
Required action: Run the rolling-restart representative gate and close this package only as representative-green; if the rerun is red, route the first frontier and open exactly one bounded successor while keeping the sprint active.
Representative status: pending-before-probe
Causal outcome: pending-before-rerun
Architecture gate: not-required / unknown
Expected delta: Representative-green or one routed owner/boundary successor while the sprint remains active.
Current state: No active sprint existed after rolling-restart resume activation closed. This release-gate package starts the sprint whose success criterion is that rolling-restart is fully green.
Allowed edits: work/packages/active-20260525-rolling-restart-fully-green-gate.md, work/sprints/active-2026-q2-rolling-restart-fully-green.md
Candidate runtime files: unknown
Forbidden edits: The sprint cannot be marked done until rolling-restart is fully green.
Required latest proof: falsifier: contract transition fixture release_gate_owner rolling_restart_fully_green_gate representative_green_required node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose, regression: npm run work:scenario-route -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required, supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json, supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. [Rolling Restart Fully Green Gate](../packages/active-20260525-rolling-restart-fully-green-gate.md)
   - Lane: `scenario-release-gate`
   - Purpose: run fresh `rolling-restart` and prove representative-green or
     route the first blocker into exactly one successor package.
   - First-run reason: the resume-activation sprint closed on migrated/reduced
     evidence, but the user requested a sprint whose success criterion is full
     representative green.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:validate -- --pre-impl work/packages/active-20260525-rolling-restart-fully-green-gate.md`
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose`
4. `npm run work:scenario-route -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required`
5. `npm run work:evidence-summary -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json`
6. `npm run work:validate -- --closure work/packages/active-20260525-rolling-restart-fully-green-gate.md`

## Closure Rules

1. The sprint closes only when representative `rolling-restart` is green.
2. Reduced, migrated, same-frontier, classification-only, or architecture-gap
   package outcomes keep the sprint active and must open/update the next
   bounded package.
3. Full green means clean scenario exit and canonical evidence with
   `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, zero
   priority-recovery residual witnesses, and clean convergence/adjudication.
4. Do not widen timeouts or relax admission to satisfy the gate.
