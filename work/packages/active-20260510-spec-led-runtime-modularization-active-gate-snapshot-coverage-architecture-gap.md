# Spec-Led Runtime Modularization Active Gate Snapshot Coverage Architecture Gap

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage_architecture_gap",
  "dominantReason": "active_gate_snapshot_coverage_incomplete",
  "currentState": "Implementation froze startup-complete stale-evidence admission in BootstrapRequestOwner: bootstrap-join authority must be available, the snapshot must not be draining, BOOTSTRAP_PHASE_INCOMPLETE must be present, and every stale reason must belong to the allowed startup-complete set (BOOTSTRAP_PHASE_INCOMPLETE, SQL_ENGINE_UNAVAILABLE, BOOTSTRAP_NOT_READY, PRIORITY_CONTROL_PLANE_RECOVERY_PENDING). The focused cascade fixture covers all four readiness/budget reasons, and the existing phase-only fixture remains admitted. Representative rolling-restart remains non-green, but the readiness/contact-seed budget cascade is reduced: top failure reasons migrated to priority_recovery_workflow_progress_event_driven while causal analysis still reports widen_architecture_work / architecture_gap with dominant active_gate_snapshot_coverage_incomplete.",
  "nextAction": "Continue from the reduced representative artifact. The contact-seed readiness cascade no longer dominates top reasons; inspect the next owner edge exposed by the same active-gate snapshot coverage frontier: operation_workflow_owner / workflow_progress with priority_recovery_workflow_progress_event_driven and recovering_in_flight priority partitions, without reopening diagnostics schema alias cleanup.",
  "proof": [
    "npm run work:current-blocker -- --write",
    "npm run work:validate",
    "git diff --check -- work/packages work/sprints",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json confirms outcome widen_architecture_work, condition architecture_gap, dominant active_gate_snapshot_coverage_incomplete, classes active_gate_snapshot_coverage_incomplete/priority_recovery_event_wait/startup_readiness_blocked/budget_timeout_cascade",
    "Focused owner fixture: npx tap --reporter=base test/bootstrap/bootstrap-request-admission-precheck.test.js fails on the old stale-cascade admission decision and passes after BootstrapRequestOwner admits the startup-complete readiness budget cascade through the canonical admission path",
    "Representative rolling-restart rerun stays non-green but reduces the readiness/contact-seed budget cascade; triage top reasons now identify priority_recovery_workflow_progress_event_driven under operation_workflow_owner / workflow_progress while topology still has first frontier active_gate_snapshot_coverage"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "test/bootstrap/bootstrap-request-admission-precheck.test.js",
    "work/packages/active-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-architecture-gap.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "architecture-gap runtime owner package",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/cross-boundary-causal-edge",
    "escalationTriggers": [
      "causal critical path no longer starts at topology:active_gate_snapshot_coverage",
      "proof requires diagnostics schema alias deletion instead of startup active-gate owner contraction",
      "runtime implementation would need Pro or Enterprise features",
      "readiness or budget cascade cannot be represented through one startup active-gate owner contract"
    ]
  },
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md"
}
-->

## Why

The high-level causal-analysis infrastructure package is closed. Its verified
representative output does not point to more diagnostics framework work; it
classifies the rolling-restart gate as `widen_architecture_work` under
`architecture_gap` with dominant class
`active_gate_snapshot_coverage_incomplete`, additional classes
`startup_readiness_blocked` and `budget_timeout_cascade`, and critical path
`topology:active_gate_snapshot_coverage`.

This successor keeps the active package on the current evidence-driven
architecture gap: startup active-gate snapshot coverage remains incomplete while
readiness and contact-seed budgets cascade.

## Scope Basis

1. Predecessor causal-analysis artifact:
   `test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json`.
2. Causal-analysis schema and artifact producer:
   `src/diagnostics/causal-analysis-schema.js`,
   `src/diagnostics/causal-graph-builder.js`, and
   `scripts/analyze-causal-model.js`.
3. Stop-condition decision table:
   `src/diagnostics/stop-condition-decision.js` classifies the current output as
   `widen_architecture_work / architecture_gap`.
4. Failure-class taxonomy:
   `src/diagnostics/failure-class-taxonomy.js` names
   `active_gate_snapshot_coverage_incomplete`, `startup_readiness_blocked`, and
   `budget_timeout_cascade`.
5. Phase `0.1` internal-coherence work in the Community / AGPL repository.

## In Scope

1. Contract the owner boundary for `startup_active_gate_owner / snapshot_coverage`
   around the active-gate snapshot coverage architecture gap.
2. Freeze the smallest replayable owner-decision fixture that captures incomplete
   active-gate snapshot coverage plus the startup readiness and budget cascade.
3. Map the causal critical path from `topology:active_gate_snapshot_coverage` to
   the runtime owner modules that must emit one canonical outcome.
4. Prepare the implementation proof ladder for the next implementation subagent.

## Out Of Scope

1. Diagnostics schema alias deletion; that todo remains deferred because the
   causal output points at an architecture gap, not alias cleanup.
2. New causal-analysis framework or schema work already closed by the predecessor.
3. Pro or Enterprise features.
4. Harness timeout increases, report relabeling, or local fallback readiness paths.

## Model Fit

- Package class: `architecture-gap runtime owner package`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: `src/bootstrap/owners/bootstrap-request-owner.js`, `test/bootstrap/bootstrap-request-admission-precheck.test.js`, this package file, `work/model-ledger.jsonl`, and current-blocker tracker refreshes.
- Forbidden files: diagnostics schema alias cleanup package, causal-analysis framework reinvention, Pro or Enterprise surfaces, unrelated sprint/package files.
- Frozen decisions: predecessor causal-analysis package stays closed; causal output drives this successor; schema alias cleanup remains deferred; contact-seed admission changes must stay inside the canonical `BootstrapRequestOwner` admission decision path.
- Escalation triggers: causal critical path no longer starts at `topology:active_gate_snapshot_coverage`; proof requires diagnostics schema alias deletion instead of startup active-gate owner contraction; runtime implementation would need Pro or Enterprise features; readiness or budget cascade cannot be represented through one startup active-gate owner contract.
- Focused proof: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json`; `npm run work:current-blocker -- --write`; `npm run work:validate`; `git diff --check -- work/packages work/sprints`.

## Proof Ladder

1. Confirm the predecessor causal output remains
   `widen_architecture_work / architecture_gap` with dominant
   `active_gate_snapshot_coverage_incomplete` and critical path
   `topology:active_gate_snapshot_coverage`.
2. Freeze a smallest owner-decision fixture for incomplete active-gate snapshot
   coverage plus startup readiness and budget cascade.
3. Identify the single runtime owner contract that emits the canonical active-gate
   snapshot-coverage outcome.
4. Run focused owner tests and static guardrails selected by the implementation
   package once runtime behavior starts.
5. Rerun the representative rolling-restart proof or classify the next canonical
   owner boundary with the causal-analysis artifact.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent rolling-restart-causal-closure-review (`9dd7789c-c8cc-5cc5-83ef-36b0834b53f3`) reviewed `work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent rolling-restart-causal-closure-fix (`e09afd66-25ba-57b5-ac3c-d2f621b9fa23`) fixed `work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md`.
- [x] Implementation subagent recorded:
      Agent rolling-restart-active-gate-gap-impl (`27e32982-561d-5246-9c9a-ba1d5d442726`) implemented `work/packages/active-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-architecture-gap.md`.

## Implementation Handoff

Implementation is complete for this slice. The runtime owner change is in
`BootstrapRequestOwner`: startup-complete admission permits stale
bootstrap-incomplete snapshots when bootstrap-join authority is available, the
snapshot is not draining, `BOOTSTRAP_PHASE_INCOMPLETE` is present, and every
stale reason belongs to the allowed startup-complete set:
`BOOTSTRAP_PHASE_INCOMPLETE`, `SQL_ENGINE_UNAVAILABLE`,
`BOOTSTRAP_NOT_READY`, and
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`. Non-stale blockers still defer before
leader readiness and assignment reservation.

The focused owner fixture in
`test/bootstrap/bootstrap-request-admission-precheck.test.js` reproduces the old
causal edge: startup-complete contact-seed admission stopped on the four-reason
stale readiness/budget cascade, feeding the active-gate snapshot coverage
timeout. The fixture fails on the old decision because it returns `503`; it now
passes and reaches normal leader readiness plus assignment reservation. The
existing phase-only fixture remains part of the allowed stale-evidence contract:
it is intentionally admitted because `BOOTSTRAP_PHASE_INCOMPLETE` is present and
all stale reasons are within the allowed set.

Representative rolling-restart did not go green. It reduced/migrated the tail:
contact-seed readiness reasons are no longer the top failure evidence. The new
triage dominant reason is
`priority_recovery_workflow_progress_event_driven` under
`operation_workflow_owner / workflow_progress`, while topology and causal
analysis still keep the first active-gate frontier at
`startup_active_gate_owner / snapshot_coverage` with `snapshotCoverage=3/5`.

## Validation

1. PASS — `npx tap --reporter=base test/bootstrap/bootstrap-request-admission-precheck.test.js` (`18 pass`).
2. PASS — `npx tap --reporter=base test/bootstrap/bootstrap-request-admission-precheck.test.js test/bootstrap/bootstrap-request-execution-timeout.test.js test/bootstrap/node-joining-service.test.js` (exit 0).
3. PASS — `node scripts/check-guideline-literals.js src/bootstrap/owners/bootstrap-request-owner.js`; `node scripts/check-guideline-decision-boundaries.js src/bootstrap/owners/bootstrap-request-owner.js test/bootstrap/bootstrap-request-admission-precheck.test.js`; `npm run audit:runtime-grammar:file -- src/bootstrap/owners/bootstrap-request-owner.js test/bootstrap/bootstrap-request-admission-precheck.test.js`.
4. SAME-FRONTIER-REDUCED / migrated tail — `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json --fast-local --verbose` failed with active-gate `snapshotCoverage=3/5`, but triage dominant reason moved to `priority_recovery_workflow_progress_event_driven` and top reasons no longer include the contact-seed readiness cascade.
5. PASS — `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json` reports `widen_architecture_work / architecture_gap`, dominant `active_gate_snapshot_coverage_incomplete`, classes `active_gate_snapshot_coverage_incomplete`, `priority_recovery_event_wait`, `startup_readiness_blocked`, and `budget_timeout_cascade`.
6. PASS — `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json` reports first frontier `startup_active_gate_owner / snapshot_coverage`; next expected frontier includes `operation_workflow_owner / workflow_progress` with `priority_recovery_event_driven_wait`.

