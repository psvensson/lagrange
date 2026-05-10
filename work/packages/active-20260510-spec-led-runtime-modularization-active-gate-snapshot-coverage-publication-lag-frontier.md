# Spec-Led Runtime Modularization Active Gate Snapshot Coverage Publication Lag Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The workflow-progress recovering-in-flight package closed the focused operation owner re-entry residual. The fresh representative rerun remains non-green with activeNodeCount=5/5, snapshotCoverage=3/5, publicationStatus=PUBLISHED, pendingAck=0, missingPublishedCount=3 on the selected active-gate snapshot, closureWitnessClass startup_active_publication_lag, and no detailed priorityRecoveryProgressSummary. Topology and causal analysis select startup_active_gate_owner / snapshot_coverage as the next blocked frontier.",
  "nextAction": "Review the just-closed workflow-progress package, then freeze the CL-006 startup_active_publication_lag active-gate snapshot witness and repair or classify why active nodes are not all covered by the selected active-gate publication snapshot.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json",
    "Focused startup_active_gate_owner snapshot coverage fixture for activeNodeCount=5/5, snapshotCoverage=3/5, closureWitnessClass startup_active_publication_lag, pendingAck=0, publicationStatus=PUBLISHED, and selected missing published nodes",
    "Focused owner tests selected by the implementation boundary",
    "Touched-file static guardrails: guideline literals, decision boundaries, runtime grammar, and git diff hygiene",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/bootstrap/owners/*.js",
    "src/control-plane/*publication*.js",
    "src/control-plane/*recovery*.js",
    "test/bootstrap/*.test.js",
    "test/control-plane/*publication*.test.js",
    "test/distributed/harness/*publication*.js",
    "test/distributed/harness/*active-gate*.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/cross-boundary-causal-edge",
    "escalationTriggers": [
      "focused fixture proves the selected snapshot is diagnostics-only and the runtime owner is not startup_active_gate_owner",
      "proof requires reopening the completed workflow-progress re-entry repair",
      "proof requires diagnostics schema alias deletion instead of active-gate snapshot coverage owner work",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md"
}
-->

## Why

The recovering-in-flight workflow-progress package closed its focused owner
residual: direct priority-recovery owner snapshots now enqueue canonical
dispatch-pending wake/replay work. The fresh representative proof did not go
green, but it no longer has the detailed `sql_write_operations-p1`
workflow-progress witness or the `priority_recovery_event_wait` causal class.

The current blocked frontier is active-gate snapshot coverage. Every node is
active, publication ACK convergence is satisfied, and priority recovery has only
class-only retryable evidence, but the selected active-gate snapshot still covers
only three of five expected nodes.

## Scope Basis

1. Predecessor package:
   `work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md`.
2. Representative artifact:
   `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json`.
3. Generated owner evidence block selects `active_gate_snapshot_coverage` with
   owner `startup_active_gate_owner`, boundary `snapshot_coverage`, and dominant
   reason `active_gate_timed_out`.
4. Fresh causal output reports `widen_architecture_work / architecture_gap` with
   dominant `active_gate_snapshot_coverage_incomplete`; it no longer includes
   `priority_recovery_event_wait`.
5. Phase `0.1` internal-coherence work in the Community / AGPL repository.

## In Scope

1. Review the just-closed workflow-progress package before implementation starts.
2. Freeze the smallest active-gate snapshot coverage witness: `activeNodeCount=5`,
   `snapshotCoverageNodeCount=3`, `publicationStatus=PUBLISHED`, `pendingAck=0`,
   `missingPublishedCount=3`, closure record `CL-006`, closure witness class
   `startup_active_publication_lag`, selected active-gate snapshot node
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, selected published active nodes
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
   `7493b0ab-a054-5fad-a91b-5e331db29304`, and selected missing published nodes
   `11601fe0-72d6-5853-8590-ec2881853e72`,
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
3. Trace the owner path that selects active-gate publication snapshots and
   determines snapshot coverage for startup active readiness.
4. Repair or classify why all active nodes are not covered by the selected
   active-gate snapshot despite satisfied publication ACK convergence.
5. Keep the completed workflow-progress re-entry, publication ACK convergence,
   and reduced startup admission behavior from regressing.
6. Rerun representative rolling-restart and either close the gate or migrate the
   next canonical owner-boundary blocker.

## Out Of Scope

1. Repeating the completed `sql_write_operations-p1` dispatch-pending
   workflow-progress repair.
2. Reopening the previous active-gate stale-admission architecture-gap package
   unless the focused fixture proves direct regression.
3. Diagnostics schema alias deletion.
4. Harness timeout increases, report relabeling, or analyzer changes that hide
   snapshot coverage.
5. Pro or Enterprise work.

## Invariants

1. `active_gate_snapshot_coverage` is owned by
   `startup_active_gate_owner / snapshot_coverage` for this witness.
2. Publication ACK convergence being satisfied must not be reinterpreted as
   active-gate snapshot coverage when the selected snapshot still misses active
   nodes.
3. Class-only retryable `recovering_in_flight` priority evidence remains
   downstream unless a focused owner fixture restores a direct workflow-progress
   blocker.
4. Startup active-gate consumers must use one owner snapshot contract instead of
   reconstructing coverage from raw node IDs, elapsed time, or admin reachability.
5. No package-owned change may demote active nodes or hide missing published
   active nodes to make the gate pass.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: active-gate snapshot coverage owner files, publication/recovery
  surfaces only where they feed the selected active-gate snapshot, focused tests,
  package/sprint/current-blocker trackers, and `work/model-ledger.jsonl`.
- Forbidden files: completed workflow-progress re-entry repair except regression
  tests if needed, diagnostics schema alias cleanup, Pro or Enterprise surfaces,
  unrelated package files.
- Frozen decisions: predecessor workflow-progress package is closed; the current
  residual is active-gate snapshot coverage with publication lag, not direct
  operation workflow progress; publication ACK convergence remains satisfied.
- Escalation triggers: focused fixture proves the selected snapshot is
  diagnostics-only and the runtime owner is not `startup_active_gate_owner`;
  proof requires reopening the completed workflow-progress re-entry repair; proof
  requires diagnostics schema alias deletion instead of active-gate snapshot
  coverage owner work; runtime implementation would need Pro or Enterprise
  features.
- Focused proof: topology explain for `active_gate_snapshot_coverage`,
  causal-model output, focused owner fixture, touched-file guardrails, and one
  representative rolling-restart rerun.

## Shared Boundary Contract

Semantic owner: `startup_active_gate_owner`.

Canonical contract shape / vocabulary: active-gate snapshot coverage,
publication status, publication epoch, pending ACK count, selected snapshot node,
selected published active node ids, selected missing published node ids,
snapshot coverage node count, expected node count, closure record, closure
witness class, and snapshot-coverage outcome.

Allowed consumers: startup active-gate owner, publication recovery evidence,
distributed failure bundle, topology convergence analyzer, diagnostics/admin
surfaces, and sprint/package handoff notes.

Prohibited reinterpretations:

1. Do not treat class-only retryable priority recovery evidence as the direct
   owner unless a focused owner fixture restores detailed workflow-progress
   evidence.
2. Do not treat publication ACK convergence alone as active-gate snapshot
   coverage.
3. Do not infer snapshot coverage from admin reachability, elapsed time, or raw
   active node counts outside the owner snapshot contract.
4. Do not use `null`, `undefined`, cache absence, or missing diagnostics fields
   as semantic snapshot coverage states.

Primary diagnostics / proof surfaces: generated owner evidence block, topology
owner explain output, focused active-gate snapshot coverage fixture, touched-file
static guardrails, causal-model output, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact:
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `active_gate_snapshot_coverage`
- Current semantic owner: `startup_active_gate_owner`
- Current boundary: `snapshot_coverage`
- Frontier state: `blocked`
- Dominant reason: `active_gate_timed_out`
- Evidence path:
  `report.scenarios[0].publicationConvergence.activeGate.progress`
- Reasons: `active_gate_timed_out, snapshot_coverage_incomplete`
- Active-gate witness: expected node count `5`, active node count `5`,
  snapshot coverage node count `3`, publication status `PUBLISHED`, publication
  epoch `2`, pending ACK count `0`, selected snapshot node
  `8be8d30f-4499-5eed-865c-71b4d529a67a`, selected published active nodes
  `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
  `7493b0ab-a054-5fad-a91b-5e331db29304`, selected missing published nodes
  `11601fe0-72d6-5853-8590-ec2881853e72`,
  `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
  `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, closure record `CL-006`, closure
  witness class `startup_active_publication_lag`, blockers
  `snapshot_coverage=3/5`.
- Next explain command:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json --explain active_gate_snapshot_coverage`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Gatecheck (`6dc3e7d5-3f5e-4976-a506-2872c0f3d8e9`) reviewed `work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md`; result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [ ] Implementation subagent recorded:
      Agent Copilot (`8f971078-63fd-40d9-a0be-6de4c4a27a36`) implemented `work/packages/active-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md`.
