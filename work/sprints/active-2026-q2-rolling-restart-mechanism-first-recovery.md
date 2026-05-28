# Rolling Restart Mechanism First Recovery Sprint

Status: active. Created on May 28, 2026.

## Goal

Make `rolling-restart` representative-green with all nodes ACTIVE, or produce one validated owner-boundary migration or architecture stop from fresh representative evidence. The sprint starts at the current invariant blocker instead of reopening the stale active-gate theory-loop queue.

## Sprint Strategy Brief

- Goal state: `rolling-restart` passes, or the fresh route after the active package proves a named owner-boundary migration or architecture stop.
- Current causal thesis: the pending ACK/recovery eligibility contract is now locally proven and the fresh representative artifact reports `pendingAck=0`, `publication_ack_closed`, and `enqueued=true`; the active blocker remains `active_gate_snapshot_coverage` with `snapshotCoverageNodeCount=1/5`, `owner_reconcile_pending`, `write_deferred`, selected snapshot timeout, and exhausted active-gate attempts.
- Competing hypotheses: H1 pending ACK/recovery eligibility was the active blocker and is now falsified; H2 the active-gate snapshot coverage progress contract lacks an architecture-level transition from write-deferred owner recovery to coverage progress; H3 the typed snapshot handoff owner boundary must migrate before local runtime edits; H4 selected-source timeout is downstream until the coverage owner contract changes.
- Confidence and evidence: High confidence that pending ACK eligibility is not the active blocker from `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `work:package:route-after-rerun`, `work:evidence-summary`, `work:scenario-route`, and `work:artifact-compare` on `test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
- Expected green path: close the pending eligibility proof as H1 falsified, then select an architecture or owner-migration discriminator before any further local runtime package. The next executable package must name the owner contract that turns `write_deferred` and `owner_reconcile_pending` into coverage progress or prove the boundary must migrate.
- Wrong direction signals: editing selected-source ordering, readiness, admin API, transport, table bootstrap, generic timeouts, or promotion gates before owner recovery progress exists; opening another classifier from the same artifact; using placeholder report timestamps.
- Next best package: [Rolling Restart Owner Recovery Queue Drain Runtime](../packages/done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md)
- Stop or escalate rule: because the representative rerun repeated `owner_reconcile_pending`, `write_deferred`, and coverage `1/5` after the focused proof, update this option set and open/select owner-boundary migration or an autonomous architecture experiment before another local runtime patch. Human escalation is only for contradictory or blocked evidence.

## Evidence Anchor

- Current problem: `rolling-restart` remains red at active-gate snapshot coverage after the pending ACK/recovery candidate contract is locally proven and representative ACK debt is closed.
- Representative artifact: `test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
- Comparison artifact: `test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json`.
- Success condition: representative `rolling-restart` passes, moves snapshot coverage beyond `1/5`, clears `owner_reconcile_pending`, moves `pendingReconcileCount` above `0`, or produces a fresh route that names an owner-boundary migration or architecture stop.
- Stable facts: `owner_reconcile_pending`, `write_deferred`, `snapshotCoverageNodeCount=1/5`, selected snapshot source timeout, and startup active gate remains the selected owner.
- Changed facts: pending ACK eligibility is locally proven, representative `pendingAck=0`, publication ACK is closed, owner recovery enqueue moved from `false` to `true`, and active-gate attempts moved from `2/8` to `3/8`.
- Current unknowns: whether the remaining missing edge is a startup active-gate coverage progress contract, a typed handoff owner migration, or a selected-source timeout that only becomes actionable after the owner boundary changes.

## Mechanism Card

- Failure mechanism: `contract_gap`, with `ownership_gap` retained as the first alternate after H1 falsification.
- Rejected alternatives: pending ACK/recovery eligibility is rejected as the active blocker because the focused fixture passes and the fresh artifact reports `pendingAck=0`; `observation_gap` is rejected because route, handoff, queue, retry, and coverage facts are visible; selected-source ordering remains downstream while active-gate snapshot coverage is the first frontier.
- Owner who decides: `startup_active_gate_owner`.
- Current action: active-gate exhausts snapshot coverage attempts with owner recovery still `write_deferred` and coverage still `1/5`.
- Missing transition or observation: the owner boundary must explain how write-deferred owner recovery becomes coverage progress, or prove the typed handoff/coverage owner must migrate.
- Smallest falsifier: `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
- Expected movement: an architecture or owner-migration discriminator names the next owner contract before any local runtime edit.
- Negative result means: unchanged invariant evidence stops local runtime patching.
- Escalation rule: no second local runtime package may run from unchanged `owner_reconcile_pending`, `write_deferred`, and coverage `1/5` evidence.

## Theory Option Set

1. H1 pending ACK/recovery eligibility is the active blocker.
   - Mechanism: `contract_gap`.
   - Intervention style: filter pending ACK and recovery nodes out of active snapshot candidate vectors.
   - Modification if promoted: completed in the active package by changing `src/admin/admin-control-snapshot-class-part-3.js` and the selected-source fixture.
   - Cheapest discriminator: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
   - Promotion trigger: predecessor evidence showed pending ACK/recovery nodes in eligibility vectors.
   - Rejection signal: focused proof passes but representative evidence stays at coverage `1/5` with ACK closed.
   - Result: falsified as the active blocker by `test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
2. H2 active-gate snapshot coverage lacks a progress contract after write-deferred owner recovery.
   - Mechanism: `contract_gap`.
   - Intervention style: architecture discriminator before runtime edits; name the owner-owned transition from `write_deferred`/`owner_reconcile_pending` to coverage progress.
   - Modification if promoted: create an architecture or causal package that first names the source/test contract; do not start with selected-source ordering, generic timeout, startup readiness, admin API, transport, table bootstrap, or promotion-gate edits.
   - Cheapest discriminator: `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
   - Promotion trigger: H1 is falsified while the route remains `startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`.
   - Rejection signal: architecture discriminator names a different deciding owner or shows no source/test contract can move the frontier.
3. H3 typed snapshot handoff owner boundary must migrate.
   - Mechanism: `ownership_gap`.
   - Intervention style: resume or replace the typed handoff architecture experiment after the ledger sequence closes.
   - Modification if promoted: name the deciding owner and exact contract before opening runtime work.
   - Cheapest discriminator: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage` plus the latest `work:scenario-route`.
   - Promotion trigger: H2 cannot name an in-boundary transition that moves coverage.
   - Rejection signal: H2 names a single startup-active-gate source/test contract that can be proven without forbidden scope.
4. H4 selected-source timeout is the next local runtime blocker.
   - Mechanism: `downstream_symptom` promoted to `selection_gap` only after owner coverage progress or boundary migration.
   - Intervention style: selected-source analysis after the owner contract moves, not before.
   - Modification if promoted: update selected-source source/test code only after fresh evidence clears `owner_reconcile_pending` or moves snapshot coverage beyond `1/5`.
   - Cheapest discriminator: fresh route evidence after H2/H3 shows selected-source timeout remains first frontier with owner recovery no longer pending.
   - Promotion trigger: owner coverage progress moves and selected-source remains first frontier.
   - Rejection signal: selected-source timeout appears only with unchanged owner recovery pending state.

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

## Real Package Rule

A theory-loop work package must test its promoted theory through an in-scope source or test code modification, then verify whether the theory was correct with its falsifier, regression proof, and recorded result. If the next step is only evidence inspection, source/log reading, or route comparison without a code modification, it remains sprint-level discrimination and does not become a work package.

## Learning Rule

After the active package's discriminator, fix, or representative rerun, record the option result as supported, avoided, falsified, fixed, migrated, representative-green, architecture-gap, or needs-rerun. Then update this option set before any further local patch so the sprint keeps generating new solutions without accumulating speculative package tracks.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json
Visible first frontier: priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait
Active package: work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Classify the priority recovery residual groups and select rerun, runtime work, or architecture escalation before editing operation workflow runtime.
Representative status: migrated
Causal outcome: accept_classified_backpressure
Architecture gate: not-required / unknown
Expected delta: Classify whether priority recovery residuals need rerun evidence, runtime workflow progress work, or architecture escalation.
Current state: Fresh representative evidence moved off startup_active_gate_owner: all five nodes report active, snapshot coverage moved to 3/5, and the canonical route now selects priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.
Allowed edits: work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md, work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond package and sprint tracker files, runtime ownership or shared operation workflow contracts must change, fresh route evidence contradicts operation_workflow_owner / workflow_progress
Required latest proof: falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json, regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown, supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Mechanism Classification

1. `contract_gap` is selected because ACK eligibility is fixed but no owner-owned coverage progress appears.
2. `ownership_gap` remains viable because repeated local fixes keep the same first frontier at coverage `1/5`.
3. `observation_gap` is rejected because the active-gate, handoff, queue, retry, and coverage facts are visible in fresh route evidence.
4. `selection_gap` remains downstream because selected-source timeout appears with unchanged owner recovery pending state.
5. Timeout-only `budget_gap` remains rejected; generic timeout edits are forbidden while the owner transition is unresolved.
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
4. [Rolling Restart Pending ACK Eligibility Filter](../packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Filter out non-admin-ready/unreachable node-ids from pending ack list in rolling restart.
   - First-run reason: To avoid timeout when querying snapshots from nodes during a rolling restart.
5. [Rolling Restart Pending ACK Eligibility Contract Proof](../packages/done-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md)
   - Lane: `bounded-experiment`
   - Purpose: Prove the pending ACK/recovery eligibility theory through source/test modification, then reroute fresh rolling-restart evidence.
   - First-run reason: The latest finding added pending ACK eligibility filtering, but the first executable theory-loop package must verify the promoted theory with an in-scope source/test falsifier before representative routing.
6. [Rolling Restart Snapshot Coverage Architecture Discriminator](../packages/done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md)
   - Lane: `causal-escalation`
   - Purpose: Select the architecture contract, owner-boundary migration, or architecture-gap stop for `write_deferred` recovery-to-coverage progress before runtime edits.
   - First-run reason: The fresh representative rerun closed ACK debt but repeated `snapshotCoverage=1/5`, `owner_reconcile_pending`, and `write_deferred`, so another local runtime package is blocked until the architecture route is selected.
7. [Rolling Restart Owner Recovery Queue Drain Runtime](../packages/done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Convert observed `pendingWrites=1` / `enqueued=true` owner recovery into drain, wake, retry, or reconcile progress before active-gate snapshot coverage repeats.
   - First-run reason: The architecture discriminator selected this concrete owner-local contract after ACK debt closed and enqueue admission was no longer the missing edge.

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
