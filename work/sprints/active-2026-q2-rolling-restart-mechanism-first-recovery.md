# Rolling Restart Mechanism First Recovery Sprint

Status: active. Created on May 28, 2026.

## Goal

Make `rolling-restart` representative-green with all nodes ACTIVE, or produce one validated owner-boundary migration or architecture stop from fresh representative evidence. The sprint starts at the current invariant blocker instead of reopening the stale active-gate theory-loop queue.

## Sprint Strategy Brief

- Goal state: `rolling-restart` passes, or the fresh route after the active package proves a named owner-boundary migration or architecture stop.
- Current causal thesis: fresh representative evidence at `test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json` cleared priority-recovery residual witnesses and returned to `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`; the active blocker is now the missing snapshot coverage contract, migration, or architecture-gap stop.
- Competing hypotheses: H1 the startup active-gate owner lacks a wake, retry, reconcile, drain, or handoff contract from available evidence to coverage progress; H2 typed snapshot handoff ownership belongs to startup readiness or another owner boundary; H3 no existing owner contract can bridge the evidence to coverage progress and the correct result is architecture-gap; H4 selected-source timeout stays downstream until snapshot coverage moves.
- Confidence and evidence: High confidence that pending ACK and priority recovery are not current blockers from the cited representative report, `work:scenario-route`, `work:frontier-history`, and `analyze:causal-model`; medium confidence in startup-active-gate ownership because the route selects it while typed handoff migration remains live.
- Expected green path: the active autonomous architecture package selects a concrete snapshot coverage `src/` source contract, owner-boundary migration, or architecture-gap stop before any runtime child package opens.
- Wrong direction signals: editing selected-source ordering, readiness, admin API, transport, table bootstrap, generic timeouts, or promotion gates before owner recovery progress exists; opening another classifier from the same artifact; using placeholder report timestamps.
- Next best package: [Rolling Restart Active Gate Snapshot Coverage Autonomous Architecture](../packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md)
- Stop or escalate rule: because fresh evidence returned to repeated `startup_active_gate_owner / snapshot_coverage`, the next package must keep two-level theory: first explain the whole-system causal map, then select one executable `src/` source contract, migration, or architecture-gap stop. Human escalation is only for contradictory or blocked evidence.

## Evidence Anchor

- Current problem: `rolling-restart` remains red at active-gate snapshot coverage after priority recovery residuals clear and fresh route evidence returns to `startup_active_gate_owner / snapshot_coverage`.
- Representative artifact: `test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json`.
- Comparison artifact: `test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
- Success condition: representative `rolling-restart` passes, moves snapshot coverage beyond `1/5`, selects a concrete snapshot coverage contract, proves an owner-boundary migration, or closes as architecture-gap.
- Stable facts: `active_gate_snapshot_coverage`, `active_gate_timed_out`, priority residual witness count `0`, selected snapshot source timeout, and startup active gate remain selected by the fresh route.
- Changed facts: priority recovery split evidence no longer reproduces as the first frontier, the active blocker moved back from workflow progress to snapshot coverage, and runtime promotion is blocked pending architecture route selection.
- Current unknowns: whether the remaining missing edge is a startup active-gate coverage progress contract, a typed handoff owner migration, an architecture-gap, or a selected-source timeout that only becomes actionable after snapshot coverage moves.

## Mechanism Card

- Failure mechanism: `contract_gap`, with `ownership_gap` retained as the first alternate after priority recovery residuals cleared.
- Rejected alternatives: pending ACK, recovery eligibility, and priority recovery residuals are rejected as current blockers because the fresh route reports zero priority residual witnesses and selects active-gate snapshot coverage; `observation_gap` is rejected because route, handoff, queue, retry, and coverage facts are visible; selected-source ordering remains downstream while active-gate snapshot coverage is the first frontier.
- Owner who decides: `startup_active_gate_owner`.
- Current action: active-gate exhausts snapshot coverage attempts with owner recovery still `write_deferred` and coverage still `1/5`.
- Missing transition or observation: the owner boundary must explain how write-deferred owner recovery becomes coverage progress, or prove the typed handoff/coverage owner must migrate.
- Smallest falsifier: `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`.
- Expected movement: an architecture or owner-migration discriminator names the next owner contract before any local runtime edit.
- Negative result means: unchanged invariant evidence stops local runtime patching.
- Escalation rule: no second local runtime package may run from unchanged `owner_reconcile_pending`, `write_deferred`, and coverage `1/5` evidence.

## Two-Level Theory Rule

1. System theory comes first for repeated frontiers, architecture packages, and owner migrations. It must name the phase chain, owner-boundary map, stable and changed facts, competing and eliminated theories, downstream symptoms, transition table, migration triggers, architecture-gap triggers, and whole-system invariant.
2. Slice theory follows only after the system theory has selected the current explanation. It must cite the system theory, name one `src/` source contract, one focused falsifier, expected representative movement, kill rule, theory-fit score, and wrong-slice triggers.
3. Evidence-only reasoning stays at sprint level. A real package opens only when the slice theory can execute a declared contract or close as migration or architecture-gap.

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
   - Modification if promoted: create an architecture or causal package that first names the `src/` source contract; do not start with selected-source ordering, generic timeout, startup readiness, admin API, transport, table bootstrap, or promotion-gate edits.
   - Cheapest discriminator: `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
   - Promotion trigger: H1 is falsified while the route remains `startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`.
   - Rejection signal: architecture discriminator names a different deciding owner or shows no `src/` source contract can move the frontier.
3. H3 typed snapshot handoff owner boundary must migrate.
   - Mechanism: `ownership_gap`.
   - Intervention style: resume or replace the typed handoff architecture experiment after the ledger sequence closes.
   - Modification if promoted: name the deciding owner and exact contract before opening runtime work.
   - Cheapest discriminator: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage` plus the latest `work:scenario-route`.
   - Promotion trigger: H2 cannot name an in-boundary transition that moves coverage.
   - Rejection signal: H2 names a single startup-active-gate `src/` source contract that can be proven without forbidden scope.
4. H4 selected-source timeout is the next local runtime blocker.
   - Mechanism: `downstream_symptom` promoted to `selection_gap` only after owner coverage progress or boundary migration.
   - Intervention style: selected-source analysis after the owner contract moves, not before.
   - Modification if promoted: update selected-source `src/` source code only after fresh evidence clears `owner_reconcile_pending` or moves snapshot coverage beyond `1/5`.
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

The active package executes the two-level discriminator for H2/H3/H4: `work:scenario-route` confirms the fresh frontier, `work:frontier-history` proves repeated same-boundary risk, and `analyze:causal-model` must either select the startup active-gate `src/` source contract, migrate owner boundary, or close as architecture-gap. Runtime edits remain blocked until that discriminator selects the slice.

## Promotion Rule

Only the evidence-selected option becomes executable work. The active package owns architecture route selection with explicit owner, boundary, write scope, proof, system theory, slice theory, and stop rule. A runtime successor is created only after fresh proof selects one `src/` source contract inside a declared owner boundary.

## Real Package Rule

A theory-loop work package must test its promoted theory through an in-scope `src/` source-code modification, then verify whether the theory was correct with its falsifier, regression proof, recorded result, and successor package creation. If the next step is only classification, evidence inspection, source/log reading, or route comparison without a source-code modification, it remains sprint-level discrimination and does not become a work package.

## Learning Rule

After the active package's discriminator, fix, or representative rerun, record the option result as supported, avoided, falsified, fixed, migrated, representative-green, architecture-gap, or needs-rerun. Then update this option set before any further local patch so the sprint keeps generating new solutions without accumulating speculative package tracks.

## Closure Summary Policy

Closed packages in this sprint should record `closureSummary` in their top metadata block before closure. The summary must state `resultClassification`, `predictionAccuracy`, `observedMovement`, `successorReason`, `nextOwnerBoundary`, and `evidenceArtifact` so `work:package:cost`, `work:frontier-history`, and `work:negative-learning` can read the package outcome without prose inference.

For repeated `startup_active_gate_owner / snapshot_coverage` work, the closure summary is the first source of truth for whether the package moved the representative frontier, stayed same-frontier, migrated to diagnostics ownership, or selected architecture-gap handling. Do not rely on `v3`/`v4` naming alone to communicate movement.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out
Active package: work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v6.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: Close as architecture-gap; do not open another local startup_active_gate_owner / snapshot_coverage runtime patch from this evidence.
Representative status: architecture-gap
Causal outcome: continue_local_fix
Architecture gate: selected / architecture-gap
Expected delta: Architecture proof selects a source contract, owner-boundary migration, or architecture-gap stop before runtime edits.
Current state: Post-diagnostics canonical proof still returns to startup_active_gate_owner / snapshot_coverage, but no concrete source contract or owner migration is selected.
Allowed edits: work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v6.md, work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json
Candidate runtime files: src/admin/admin-control-snapshot-publication-convergence-diagnostics.js, src/control-plane/membership-publication-active-gate-reconcile.js, src/control-plane/snapshot-service.js
Forbidden edits: proof selects owner-boundary migration, proof cannot distinguish a concrete owner-owned source contract, runtime files must be edited before the architecture decision is closed
Required latest proof: falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage, regression: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 8, supporting: npm run work:negative-learning -- --package-dir work/packages --limit 8, supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json
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
   - Purpose: Prove the pending ACK/recovery eligibility theory through `src/` source modification, then reroute fresh rolling-restart evidence.
   - First-run reason: The latest finding added pending ACK eligibility filtering, but the first executable theory-loop package must verify the promoted theory with an in-scope source falsifier before representative routing.
6. [Rolling Restart Snapshot Coverage Architecture Discriminator](../packages/done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md)
   - Lane: `causal-escalation`
   - Purpose: Select the architecture contract, owner-boundary migration, or architecture-gap stop for `write_deferred` recovery-to-coverage progress before runtime edits.
   - First-run reason: The fresh representative rerun closed ACK debt but repeated `snapshotCoverage=1/5`, `owner_reconcile_pending`, and `write_deferred`, so another local runtime package is blocked until the architecture route is selected.
7. [Rolling Restart Owner Recovery Queue Drain Runtime](../packages/done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Convert observed `pendingWrites=1` / `enqueued=true` owner recovery into drain, wake, retry, or reconcile progress before active-gate snapshot coverage repeats.
   - First-run reason: The architecture discriminator selected this concrete owner-local contract after ACK debt closed and enqueue admission was no longer the missing edge.
8. [Startup Active Gate Snapshot Coverage Architecture v5](../packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md)
   - Lane: `experiment`
   - Purpose: Select the architecture route for the missing SQL query engine availability observation before another local runtime patch.
   - First-run reason: The v4 representative rerun repeated `startup_active_gate_owner / snapshot_coverage / active_gate_timed_out` and playback did not contain SQL query engine availability fields, so the active package kill rule requires an autonomous architecture experiment.
9. [Failure Bundle SQL Availability Diagnostics Capture](../packages/done-20260528-failure-bundle-sql-availability-diagnostics-capture.md)
   - Lane: `test-only-proof`
   - Purpose: Preserve SQL query engine availability fields in failure-bundle active-gate diagnostics playback.
   - First-run reason: Architecture v5 selected diagnostics_owner / failure_bundle_diagnostics_capture after route and causal-model stayed on active_gate_snapshot_coverage while playback lacked SQL query availability fields.
10. [Work Tracking Closure Summary Adoption](../packages/done-20260528-work-tracking-closure-summary-adoption.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Add closure summaries to workflow tooling, current sprint tracking, and the six most recent package records.
   - First-run reason: The active rolling-restart representative gate needs high-signal tracking for repeated same-frontier and diagnostics-migration packages before the next runtime package is selected.
11. [Rolling Restart Startup Active Gate Owner Snapshot Coverage v6](../packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v6.md)
   - Lane: `experiment`
   - Purpose: Select the post-diagnostics source contract, owner-boundary migration, or architecture-gap stop before any runtime edit.
   - First-run reason: The validator rejected another startup_active_gate_owner / snapshot_coverage runtime package after closure summary and negative-learning evidence returned the sprint to the repeated same frontier.

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

1. The sprint remains active indefinitely until rolling-restart passes or the active package's fresh route proves a named owner-boundary migration or architecture stop.
2. Local focused proof alone cannot close the sprint as green.
3. A representative same-frontier result with unchanged owner-reconcile blockers cannot create another local runtime package.
4. Any successor package must cite the fresh representative artifact produced by the active package and must carry a mechanism card before implementation.
5. Closing the sprint requires `## Theory Loop Success Evidence` with `Success condition met: yes`, fresh representative evidence, a result of `representative-green`, `owner-boundary-migration`, `architecture-gap`, or `success-condition-met`, and the concrete reason continuation stops. Same-frontier, classification-only, needs-rerun, pending, or unknown evidence keeps this sprint active.
