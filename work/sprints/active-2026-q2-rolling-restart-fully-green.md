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
  `work/packages/done-20260525-rolling-restart-fully-green-gate.md`.
- Stop or escalate rule: if a fresh rerun is red and same-frontier without
  concrete reduction, open/select an autonomous architecture experiment; human
  escalation only for contradictory or blocked evidence.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out
Active package: work/packages/active-20260525-rolling-restart-active-gate-snapshot-coverage-blocker.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: Fix the active-gate snapshot coverage timeout
Representative status: migrated
Causal outcome: continue_local_fix
Architecture gate: watching / unknown
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Scaffolded from representative evidence for active_gate_snapshot_coverage.
Allowed edits: unknown
Candidate runtime files: unknown
Forbidden edits: Startup readiness remains downstream until active-gate snapshot coverage is resolved.
Required latest proof: falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json, regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --markdown, supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --markdown
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. [Rolling Restart Fully Green Gate](../packages/done-20260525-rolling-restart-fully-green-gate.md)
   - Lane: `scenario-release-gate`
   - Purpose: run fresh `rolling-restart` and prove representative-green or
     route the first blocker into exactly one successor package.
   - First-run reason: the resume-activation sprint closed on migrated/reduced
     evidence, but the user requested a sprint whose success criterion is full
     representative green.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:validate -- --pre-impl work/packages/done-20260525-rolling-restart-fully-green-gate.md`
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --verbose`
4. `npm run work:scenario-route -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required`
5. `npm run work:evidence-summary -- test-output/reports/rolling-restart-fully-green-gate-20260525T172845Z.report.json`
6. `npm run work:validate -- --closure work/packages/done-20260525-rolling-restart-fully-green-gate.md`

## Closure Rules

1. The sprint closes only when representative `rolling-restart` is green.
2. Reduced, migrated, same-frontier, classification-only, or architecture-gap
   package outcomes keep the sprint active and must open/update the next
   bounded package.
3. Full green means clean scenario exit and canonical evidence with
   `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, zero
   priority-recovery residual witnesses, and clean convergence/adjudication.
4. Do not widen timeouts or relax admission to satisfy the gate.
