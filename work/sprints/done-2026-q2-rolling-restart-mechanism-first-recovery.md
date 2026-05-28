# Rolling Restart Mechanism First Recovery Sprint

Status: done. Created on May 28, 2026.

## Goal

Make `rolling-restart` representative-green with all nodes ACTIVE, or produce one validated owner-boundary migration or architecture stop from fresh representative evidence. The sprint starts at the current invariant blocker instead of reopening the stale active-gate theory-loop queue.

## Sprint Strategy Brief

- Goal state: `rolling-restart` passes, or the fresh route after the active package proves a named owner-boundary migration or architecture stop.
- Current causal thesis: active-gate snapshot coverage is blocked because owner recovery is observed but not admitted into reconcile progress. The stable facts are `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, `pendingRecoveryCount=1`, `pendingReconcileCount=0`, and `snapshotCoverageNodeCount=1/5`.
- Competing hypotheses: H1 owner-reconcile admission/enqueue/wake is missing; H2 admission exists but scheduling/wake is not rearmed; H3 selected-source timeout becomes dominant only after owner recovery moves; H4 startup_active_gate_owner lacks authority and the boundary must migrate.
- Confidence and evidence: High confidence in H1/H2 from `work:mechanism-card`, `work:artifact-compare`, and `analyze:topology-convergence -- --handoff-probe` on `test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json`. Medium confidence on admission versus scheduling until focused proof inspects the owner path.
- Expected green path: implement the owner-reconcile admission/enqueue/wake contract, prove it with the focused selected-source repair fixture, guard the active-gate consumer contract, run runtime grammar, rerun representative `rolling-restart`, and route the fresh artifact before any successor is selected.
- Wrong direction signals: editing selected-source ordering, readiness, admin API, transport, table bootstrap, generic timeouts, or promotion gates before owner recovery progress exists; opening another classifier from the same artifact; using placeholder report timestamps.
- Next best package: [Rolling Restart Owner Reconcile Admission Runtime](../packages/done-20260528-rolling-restart-owner-reconcile-admission-runtime.md)
- Stop or escalate rule: if the representative rerun repeats `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, `pendingReconcileCount=0`, and coverage `1/5`, open/select owner-boundary migration or an autonomous architecture experiment. Human escalation is only for contradictory or blocked evidence.

## Evidence Anchor

- Current problem: `rolling-restart` remains red at active-gate snapshot coverage because observed owner recovery does not become observable reconcile progress.
- Representative artifact: `test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json`.
- Comparison artifact: `test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json`.
- Success condition: representative `rolling-restart` passes, moves snapshot coverage beyond `1/5`, clears `owner_reconcile_pending`, moves `pendingReconcileCount` above `0`, or produces a fresh route that names an owner-boundary migration or architecture stop.
- Stable facts: `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, `pendingRecoveryCount=1`, `pendingReconcileCount=0`, `snapshotCoverageNodeCount=1/5`, and startup active gate remains the selected owner.
- Changed facts: active-gate attempts moved from `1/8` to `2/8`; retry cadence moved, but owner recovery admission and coverage did not.
- Current unknowns: whether the missing edge is admission itself, wake/retry scheduling after admission, selected-source behavior after owner progress, or owner authority for the admission contract.

## Mechanism Card

- Failure mechanism: `transition_gap`, with `scheduling_gap` retained as the first alternate.
- Rejected alternatives: `observation_gap` is rejected because handoff, queue, retry, and coverage facts are visible; `selection_gap` is rejected because the pending owner recovery node is identified; timeout-only `budget_gap` is insufficient because time cannot create admission; `downstream_symptom` is rejected while active-gate snapshot coverage is the first frontier.
- Owner who decides: `startup_active_gate_owner`.
- Current action: active-gate retries snapshot coverage while owner recovery reports `write_deferred` and no queued reconcile progress.
- Missing transition or observation: a write-deferred owner recovery handoff with `enqueued=false` and `pendingReconcileCount=0` must admit, enqueue, wake, or otherwise expose owner-owned reconcile progress.
- Smallest falsifier: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
- Expected movement: focused proof observes owner-reconcile admission/enqueue/wake; representative rerun clears owner pending, moves reconcile or coverage, migrates owner boundary, or passes.
- Negative result means: unchanged invariant evidence stops local runtime patching and promotes owner-boundary migration or an autonomous architecture experiment.
- Escalation rule: no second local runtime package may run from unchanged `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, `pendingReconcileCount=0`, and coverage `1/5` evidence.

## Theory Option Set

1. H1 owner-reconcile admission transition is missing.
   - Mechanism: `transition_gap`.
   - Intervention style: owner-owned admission/enqueue/wake contract inside `startup_active_gate_owner`.
   - Cheapest discriminator: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
   - Promotion trigger: current artifact already shows `write_deferred`, `enqueued=false`, and `pendingReconcileCount=0`, so H1 is the active promoted option.
   - Rejection signal: focused proof shows admission/enqueue/wake already occurs before active-gate repeats.
2. H2 owner recovery is admitted but scheduling or retry wake is not rearmed.
   - Mechanism: `scheduling_gap`.
   - Intervention style: rearm the owner retry/wake path without changing selected-source ordering or generic timeouts.
   - Cheapest discriminator: the focused fixture or handoff probe observes admission exists while no wake/retry is scheduled.
   - Promotion trigger: H1 proof finds an existing admission transition but no subsequent wake, retry, queue growth, or progress.
   - Rejection signal: no admission event exists, or fresh representative evidence moves before scheduling changes.
3. H3 selected-source timeout becomes independently dominant only after owner recovery progresses.
   - Mechanism: `downstream_symptom` promoted to `selection_gap` only after upstream movement.
   - Intervention style: selected-source analysis after owner recovery movement, not before.
   - Cheapest discriminator: fresh route evidence shows `pendingReconcileCount > 0` or owner pending cleared while selected-source timeout remains first frontier.
   - Promotion trigger: representative rerun after H1/H2 movement names selected-source selection as the new owner-boundary blocker.
   - Rejection signal: selected-source timeout appears only with unchanged owner recovery pending state.
4. H4 startup active gate lacks authority for the admission contract.
   - Mechanism: `ownership_gap` or `contract_gap`.
   - Intervention style: owner-boundary migration or architecture experiment.
   - Cheapest discriminator: focused proof requires forbidden scope, or route evidence names a non-active-gate owner as the deciding boundary.
   - Promotion trigger: H1 and H2 cannot be implemented inside declared owner scope, or fresh evidence proves the deciding owner is elsewhere.
   - Rejection signal: focused proof can add owner-owned progress inside the declared scope and representative evidence moves.

## Creative Move Menu

1. Ownership inversion: ask which owner would make `owner_reconcile_pending` impossible if it owned the transition.
2. Minimal trace: capture the smallest handoff event that proves admission, wake, queue growth, or their absence.
3. Opposite intervention: prove active-gate should keep waiting until owner progress is explicit instead of relaxing coverage.
4. Boundary swap: test whether admission belongs to startup active gate, publication recovery, or snapshot coverage before editing another owner.
5. Missing-object search: look for the absent queue item, wake signal, retry token, progress contract field, or evidence projection rather than another timeout scalar.

## Discriminator First

The active package executes H1 because current evidence already promotes it. It must run entry/pre-implementation validation, the topology handoff probe, and the focused selected-source repair fixture before runtime edits. H2, H3, and H4 cannot become packages until those probes or fresh representative route evidence select them.

## Promotion Rule

Only the evidence-selected option becomes executable work. The active package owns H1 with explicit owner, boundary, write scope, proof, and stop rule. A successor is created only by fresh route-after-rerun evidence or a focused discriminator that rejects H1 and selects H2, H3, or H4.

## Learning Rule

After the active package's discriminator, fix, or representative rerun, record the option result as supported, avoided, falsified, fixed, migrated, representative-green, architecture-gap, or needs-rerun. Then update this option set before any further local patch so the sprint keeps generating new solutions without accumulating speculative package tracks.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-check-success-20260528T0722.report.json
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out
Active package: work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits.
Representative status: same-frontier
Causal outcome: continue_local_fix
Architecture gate: selected / open-architecture-package
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Representative evidence selects startup_active_gate_owner / snapshot_coverage at active_gate_snapshot_coverage; the package records the bounded next decision before runtime edits.
Allowed edits: work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md, work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md
Candidate runtime files: unknown
Forbidden edits: Runtime promotion remains blocked while snapshot coverage is incomplete.
Required latest proof: falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json, regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown, supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-check-success-20260528T0722.report.json --markdown
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Mechanism Classification

1. `transition_gap` is selected because state is observed but no owner-owned action changes it.
2. `scheduling_gap` remains viable only if admission exists but the wake/retry path is not rearmed.
3. `observation_gap` is rejected because the active-gate, handoff, queue, retry, and coverage facts are visible in two artifacts.
4. `selection_gap` is rejected because the pending recovery node and selected snapshot source are identified; choosing another witness does not explain `enqueued=false`.
5. `budget_gap` is not sufficient because increasing time cannot create owner-owned reconcile admission.
6. `downstream_symptom` is rejected while active-gate snapshot coverage is the first frontier.

## Non-Scaffold Policy

This sprint intentionally contains one active executable package and no speculative future packages. A successor package is created only by the active package's route-after-rerun command, when the fresh artifact path and observed movement are known. That keeps the sprint runnable without placeholder artifact names, stale package paths, or prewritten work for evidence that does not exist yet.

## Operating Rules

1. Keep one package active at a time.
2. Use canonical evidence commands before raw JSON, logs, broad search, or ad hoc queries.
3. Do not edit runtime until the active package passes entry and pre-implementation validation.
4. Keep source edits inside the active package write scope.
5. If proof needs forbidden scope, stop and record owner-boundary migration or architecture escalation.
6. Use timestamped representative report names generated at run time; do not write placeholder timestamps.
7. Closure remains atomic: execution evidence, `npm run work:repair`, closure validation, `npm run work:close`, focused commit, and push.

## Package Queue

1. [Rolling Restart Owner Reconcile Admission Runtime](../packages/done-20260528-rolling-restart-owner-reconcile-admission-runtime.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Implement owner-owned admission, enqueue, or wake progress for write-deferred active-gate owner recovery, then prove movement with focused and representative evidence.
   - First-run reason: The latest evidence keeps owner recovery pending with `write_deferred`, `enqueued=false`, and `pendingReconcileCount=0` after retry cadence moved, so the next executable concern is the missing transition rather than another classifier.
2. [Rolling Restart Startup Active Gate Owner Snapshot Coverage](../packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits.
   - First-run reason: The fresh representative rerun after admitting reconcile progress selects startup_active_gate_owner / snapshot_coverage as a classified local blocker, which requires triage and verification before promoting runtime changes.
3. [Rolling Restart Startup Active Gate Owner Snapshot Coverage v2](../packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md)
   - Lane: `causal-escalation`
   - Purpose: Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits.
   - First-run reason: The fresh representative rerun after prefiltering is still failing with active gate snapshot coverage timeout, requiring causal triage on startup_active_gate_owner / snapshot_coverage before further runtime edits.

## Sprint Proof Ladder

1. `npm run work:mechanism-card -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json`
2. `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json`
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json --handoff-probe`
4. `npm test -- test/scripts/work-theory-loop.test.js`
5. `npm run work:help`
6. `npm run work:validate -- --entry work/packages/done-20260528-rolling-restart-owner-reconcile-admission-runtime.md`
7. `npm run work:validate -- --pre-impl work/packages/done-20260528-rolling-restart-owner-reconcile-admission-runtime.md`
8. `git diff --check -- work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md work/packages/done-20260528-rolling-restart-owner-reconcile-admission-runtime.md work/sprints/superseded-2026-q2-rolling-restart-active-gate-theory-loop-resume.md work/packages/superseded-20260528-rolling-restart-active-gate-owner-reconcile-retry-runtime.md work/packages/superseded-20260528-rolling-restart-active-gate-owner-reconcile-no-progress-architecture.md work/packages/superseded-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md scripts/work-theory-loop.js test/scripts/work-theory-loop.test.js scripts/list-commands.js work/README.md work/RULES.md work/templates/sprint-strategy-brief.md`

## Closure Rules

1. The sprint closes as done only when rolling-restart passes or the active package's fresh route proves a named owner-boundary migration or architecture stop.
2. Local focused proof alone cannot close the sprint as green.
3. A representative same-frontier result with unchanged owner-reconcile blockers cannot create another local runtime package.
4. Any successor package must cite the fresh representative artifact produced by the active package and must carry a mechanism card before implementation.
