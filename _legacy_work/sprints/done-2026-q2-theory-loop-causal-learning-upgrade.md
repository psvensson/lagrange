# Theory Loop Causal Learning Upgrade Sprint

Status: done. Created on May 28, 2026.

## Goal

Upgrade the theory loop from an artifact-routing package queue into a general causal learning workflow that classifies failure mechanisms, preserves negative learning, compares representative evidence across attempts, and prevents repeated local patches when the same mechanism has not moved.

## Sprint Strategy Brief

- Goal state: future scenario and runtime packages must state the failure mechanism, owner who decides, missing transition or observation, smallest discriminator, expected movement, negative-learning result, and escalation rule before implementation. The workflow must be validated against the current rolling-restart active-gate evidence so it selects transition or scheduling work instead of another witness-selection or timeout patch.
- Current causal thesis: the current workflow can name owner and boundary accurately, but it does not consistently distinguish observation gaps, selection gaps, budget gaps, transition gaps, scheduling gaps, and ownership gaps before opening the next package. That lets same-frontier work drift across adjacent local fixes even when the invariant blocker has not moved.
- Competing hypotheses: H1 a package-template and rules update is enough; H2 agents need executable mechanism-card and artifact-compare commands to make the reasoning repeatable; H3 validators must enforce mechanism cards and negative-learning fields before the loop reliably changes behavior; H4 the current rolling-restart active-gate evidence is too domain-specific and should be used only as calibration, not as workflow policy.
- Confidence and evidence: High confidence that mechanism classification is missing because recent rolling-restart packages improved reachability, witness order, remaining-witness concurrency, and retry cadence while the invariant blocker stayed `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, and `snapshotCoverageNodeCount=1/5`. Medium confidence that validator enforcement is required; prove it after the doc and CLI packages exist.
- Expected green path: define the mechanism taxonomy and card contract, add a `work:mechanism-card` command, add `work:artifact-compare`, enforce templates and validator gates, add negative-learning/frontier-history extraction, then run a calibration proof over the active-gate artifacts.
- Wrong direction signals: creating another prose-only sprint without executable checks, hard-coding rolling-restart or active-gate logic into general tools, weakening current package validators, requiring raw JSON before canonical extractors, or using the calibration package to change runtime behavior.
- Next best package: [Theory Loop Mechanism Taxonomy And Card Contract](../packages/done-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md)
- Stop or escalate rule: if the mechanism-card and artifact-compare commands cannot classify the active-gate evidence without hard-coded owner names, stop for a workflow architecture package instead of adding validator enforcement.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json
Visible first frontier: active_gate_snapshot_coverage
Active package: work/packages/done-20260528-theory-loop-active-gate-calibration-proof.md
Active package owner: workflow_tooling_owner
Active package boundary: theory_loop_active_gate_calibration
Selected cause: active_gate_timed_out
Required action: Prove the upgraded theory loop classifies the active-gate evidence as a transition or scheduling gap and rejects another witness-selection, timeout-only, or downstream-symptom package from unchanged evidence.
Representative status: unknown
Causal outcome: continue_local_fix
Architecture gate: not-required / unknown
Expected delta: migrate owner or open architecture gate (to prevent loop oscillation on invariant blockers)
Current state: The current active-gate evidence stayed on snapshot coverage with owner_reconcile_pending, write_deferred, enqueued=false, pendingReconcileCount=0, and snapshotCoverageNodeCount=1/5 after witness-selection, bounded-return, and retry-cadence work.
Allowed edits: test/scripts/work-theory-loop-active-gate-calibration.test.js
Candidate runtime files: test/distributed/harness/cluster-segment-7-class-5.js, test/distributed/harness/cluster-control-snapshot-recovery.js, test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
Forbidden edits: the proof requires runtime changes, the tools cannot classify the evidence without active-gate-specific branches, the active-gate artifacts are missing or contradict current blocker state
Required latest proof: falsifier: npm test -- test/scripts/work-theory-loop-active-gate-calibration.test.js, regression: npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json, supporting: npm run work:mechanism-card -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json, supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12, supporting: npm run work:validate -- --entry work/packages/done-20260528-theory-loop-active-gate-calibration-proof.md, supporting: npm run work:validate -- --pre-impl work/packages/done-20260528-theory-loop-active-gate-calibration-proof.md, supporting: git diff --check -- test/scripts/work-theory-loop-active-gate-calibration.test.js
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Mechanism Taxonomy

The sprint standardizes this domain-neutral mechanism vocabulary:

1. `observation_gap`: evidence is missing, stale, or misleading.
2. `selection_gap`: the system chooses the wrong source, candidate, route, owner, or witness.
3. `admission_gap`: valid work exists but is not admitted.
4. `transition_gap`: state is observed but no owner-owned action changes it.
5. `scheduling_gap`: an action exists but is not woken, retried, or rearmed.
6. `budget_gap`: valid work cannot complete inside the bounded attempt.
7. `concurrency_gap`: work fans out, races, starves, or consumes shared budget incorrectly.
8. `contract_gap`: producer and consumer disagree on the meaning of state or evidence.
9. `ownership_gap`: no single owner has authority for the decision.
10. `downstream_symptom`: visible failure inherits from an upstream blocker.

## Mechanism Card Contract

Every non-trivial scenario, runtime, experiment, proof, or workflow-tooling package produced after this sprint should carry a mechanism card with these fields:

```text
Failure mechanism:
Stable facts:
Changed facts:
Why not the alternatives:
Owner who decides:
Current code or workflow action:
Missing transition or missing observation:
Smallest falsifying probe:
Expected movement:
Negative result means:
Escalation rule:
```

## Current Calibration Target

```text
Baseline artifact: test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json
Fresh artifact: test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json
Invariant blocker: owner_reconcile_pending, write_deferred, enqueued=false, pendingRecoveryCount=1, pendingReconcileCount=0, snapshotCoverageNodeCount=1/5
Expected classification: transition_gap or scheduling_gap
Expected action bias: define or execute an owner-recovery retry/enqueue transition; do not select another witness-order, broad timeout, or downstream readiness package from unchanged evidence.
```

## Operating Rules

1. Keep this sprint parked until the current active rolling-restart sprint is closed or explicitly superseded.
2. Activate packages in queue order because each package provides input to later validation.
3. Keep workflow tools domain-neutral; current active-gate evidence is a regression fixture, not the general algorithm.
4. Do not change runtime behavior in this sprint unless a later package explicitly promotes a separate runtime-owner-boundary successor.
5. Do not update `work/sprints/current-blocker.*` while this sprint remains todo.

## Package Queue

1. [Theory Loop Mechanism Taxonomy And Card Contract](../packages/done-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add the general mechanism taxonomy and mechanism-card contract to canonical workflow rules and package/sprint templates.
   - First-run reason: The workflow must classify missing behavior before choosing implementation, otherwise repeated same-frontier packages can keep changing adjacent symptoms.
2. [Theory Loop Mechanism Card Command](../packages/done-20260528-theory-loop-mechanism-card-command.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add `npm run work:mechanism-card -- path-to-artifact-or-package` to emit a structured mechanism card from canonical package and evidence fields.
   - First-run reason: The mechanism card must be repeatable by tooling rather than recreated from memory in each handoff.
3. [Theory Loop Artifact Compare Invariants](../packages/done-20260528-theory-loop-artifact-compare-invariants.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add `npm run work:artifact-compare -- old-artifact.json new-artifact.json` to list stable facts, changed facts, invariant blockers, and plausible mechanism movement.
   - First-run reason: Same-frontier loops need an automatic distinction between real movement and presentation-only churn.
4. [Theory Loop Validator Templates And Gates](../packages/done-20260528-theory-loop-validator-templates-and-gates.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Wire mechanism cards, expected movement, and negative-learning requirements into package templates, schema help, and validators.
   - First-run reason: The contract should become part of package readiness, not an optional prose habit.
5. [Theory Loop Negative Learning Frontier History](../packages/done-20260528-theory-loop-negative-learning-frontier-history.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add commands that extract package learning lines and repeated owner/boundary/mechanism history before a new local patch is opened.
   - First-run reason: Agents need durable memory of mechanisms ruled out and metrics that stayed unchanged.
6. [Theory Loop Active Gate Calibration Proof](../packages/done-20260528-theory-loop-active-gate-calibration-proof.md)
   - Lane: `experiment`
   - Purpose: Use the new commands on the current rolling-restart active-gate artifacts and prove the upgraded loop selects transition or scheduling work rather than another witness-selection, timeout, or downstream-symptom package.
   - First-run reason: The sprint must improve the current failure pattern while staying general for future problem domains.

## Activation Instructions

Activate this sprint only after the current active sprint closes or is explicitly superseded:

```bash
mv work/sprints/todo-2026-q2-theory-loop-causal-learning-upgrade.md work/sprints/active-2026-q2-theory-loop-causal-learning-upgrade.md
perl -0pi -e 's/^Status: todo\\./Status: active./m' work/sprints/active-2026-q2-theory-loop-causal-learning-upgrade.md
npm run work:sprint:queue -- --activate theory-loop-mechanism-taxonomy-and-card-contract --sprint work/sprints/active-2026-q2-theory-loop-causal-learning-upgrade.md
npm run work:repair
npm run work:validate -- --entry work/packages/done-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md
npm run work:validate -- --pre-impl work/packages/done-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md
```

## Sprint Proof Ladder

1. `npm run work:package:schema`
2. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md`
3. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-mechanism-card-command.md`
4. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-artifact-compare-invariants.md`
5. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-validator-templates-and-gates.md`
6. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md`
7. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-active-gate-calibration-proof.md`
8. `git diff --check -- work/sprints/todo-2026-q2-theory-loop-causal-learning-upgrade.md work/packages/todo-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md work/packages/todo-20260528-theory-loop-mechanism-card-command.md work/packages/todo-20260528-theory-loop-artifact-compare-invariants.md work/packages/todo-20260528-theory-loop-validator-templates-and-gates.md work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md work/packages/todo-20260528-theory-loop-active-gate-calibration-proof.md`

## Closure Rules

1. This sprint closes only after the calibration proof demonstrates that the upgraded loop classifies the active-gate evidence as `transition_gap` or `scheduling_gap`, records invariant blocker facts, and rejects witness-selection, timeout-only, and downstream-symptom packages for unchanged evidence.
2. The sprint is not green if it only adds documentation; at least one executable mechanism-card path, one artifact-compare path, one validator/template gate, and one calibration proof must be complete.
3. Runtime fixes discovered during calibration must be opened as a separate runtime-owner-boundary sprint or package. They must not be implemented inside this workflow-tooling sprint.
