# Spec-Led Runtime Modularization Active Gate Snapshot Coverage Publication Lag Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Closed as migrated. The focused CL-006 startup_active_publication_lag owner-path fixture passes, exact changed-file guardrails pass, and the latest representative evidence moved the first critical path to publication_ack_convergence/publication_ack_blocked.",
  "nextAction": "Activate the publication_ack_convergence publication_published successor package only after the formal fixes-required predecessor review and separate fix result are recorded in the next package ledger.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "Focused startup_active_gate_owner snapshot coverage fixture for activeNodeCount=5/5, snapshotCoverage=3/5, closureWitnessClass startup_active_publication_lag, pendingAck=0, publicationStatus=PUBLISHED, and selected missing published nodes",
    "node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "Touched-file static guardrails: guideline literals, decision boundaries, runtime grammar, and git diff hygiene",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "work/model-ledger.jsonl",
    "work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md",
    "work/packages/done-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md",
    "work/sprints/archived/done-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/todo-2026-q2-spec-led-runtime-modularization-publication-ack-followup.md",
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
  "causalGovernance": {
    "hypothesis": "If startup active-gate snapshot coverage accounts for the selected CL-006 startup publication-lag witness, active_gate_snapshot_coverage should reduce or migrate away from startup_active_publication_lag without reopening workflow_progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "expectedCausalModelChange": "The CL-006 startup_active_publication_lag edge disappears, reduces, or migrates to a named publication_ack_convergence blocker; same-frontier without reduced witness evidence is contradictory.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh publication_ack_convergence evidence must be opened or closed separately; do not hide it inside active-gate snapshot coverage closure.",
    "crossBoundaryReview": "Required before the next runtime implementation because the package crosses startup_active_gate_owner, publication ACK convergence, and completed workflow_progress repairs."
  },
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md",
  "closed": "2026-05-11",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md"
}
-->

## Why

The recovering-in-flight workflow-progress package closed its focused owner
residual: direct priority-recovery owner snapshots now enqueue canonical
dispatch-pending wake/replay work. The fresh representative proof did not go
green, but it no longer has the detailed `sql_write_operations-p1`
workflow-progress witness or the `priority_recovery_event_wait` causal class.

The predecessor artifact selected active-gate snapshot coverage: every node was
active, publication ACK convergence was satisfied, and the selected active-gate
snapshot still covered only three of five expected nodes. The focused CL-006
fixture/proof in this package froze that original witness.

The latest representative artifact named in package metadata is different: it no
longer carries CL-006 closure data, the first frontier migrated to
`publication_ack_convergence`, and the active-gate snapshot-coverage evidence is
downstream with inactive-node evidence.

## Scope Basis

1. Predecessor package:
   `work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md`.
2. Focused CL-006 proof artifact:
   `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json`.
3. Latest representative migration artifact:
   `test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`.
4. The original owner evidence selected `active_gate_snapshot_coverage` with
   owner `startup_active_gate_owner`, boundary `snapshot_coverage`, and dominant
   reason `active_gate_timed_out`.
5. The latest generated owner evidence selects `publication_ack_convergence`
   with owner `topology_publication_owner`, boundary `publication_convergence`,
   and dominant reason `publication_published`.
6. Phase `0.1` internal-coherence work in the Community / AGPL repository.

## In Scope

1. Review the just-closed workflow-progress package before implementation starts.
2. For the focused fixture/proof, freeze the original active-gate snapshot
   coverage witness from the predecessor artifact: `activeNodeCount=5`,
   `snapshotCoverageNodeCount=3`, `publicationStatus=PUBLISHED`, `pendingAck=0`,
   `missingPublishedCount=3`, closure record `CL-006`, closure witness class
   `startup_active_publication_lag`, selected active-gate snapshot node
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, selected published active nodes
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
   `7493b0ab-a054-5fad-a91b-5e331db29304`, and selected missing published nodes
   `11601fe0-72d6-5853-8590-ec2881853e72`,
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`. The latest representative
   migration artifact must not be read as this CL-006 fixture.
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

## Causal Governance

- Causal hypothesis: if startup active-gate snapshot coverage accounts for the
  selected CL-006 startup publication-lag witness, the causal model should reduce
  or migrate away from `startup_active_publication_lag` without reopening the
  completed `workflow_progress` repair.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json`.
- Expected causal-model change: the CL-006 publication-lag edge disappears,
  reduces, or migrates to a named `publication_ack_convergence` blocker;
  same-frontier without reduced witness evidence is contradictory.
- Representative outcome: `migrated`.
- Causal debt: fresh `publication_ack_convergence` evidence must be opened or
  closed separately; do not hide it inside active-gate snapshot coverage closure.
- Cross-boundary review: required before the next runtime implementation because
  this package crosses startup active-gate ownership, publication ACK convergence,
  and completed workflow-progress repairs.

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
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `publication_ack_convergence`
- Current semantic owner: `topology_publication_owner`
- Current boundary: `publication_convergence`
- Frontier state: `blocked`
- Dominant reason: `publication_published`
- Evidence path: `report.scenarios[0].publicationConvergence`
- Reasons: `publication_published`
- Next explain command:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --explain publication_ack_convergence`

## Focused CL-006 Fixture Evidence

- Source artifact:
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json`
- This is the original focused proof surface, not the latest generated owner
  evidence block.
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
- Original focused explain command:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json --explain active_gate_snapshot_coverage`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Gatecheck (`6dc3e7d5-3f5e-4976-a506-2872c0f3d8e9`) reviewed `work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md`; result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
       Agent Copilot (`8f971078-63fd-40d9-a0be-6de4c4a27a36`) implemented `work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md`.

## Validation

1. `npm run work:package:doctor -- work/packages/active-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md`
2. `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --explain active_gate_snapshot_coverage`
4. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`
5. `node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
6. Touched-file literal, decision-boundary, runtime-grammar, and diff-hygiene guardrails.

## Validation Notes

- Package doctor passed before closure while the file was still active.
- The focused active-gate owner-path fixture passed: 3 tests, 3 pass.
- Latest representative evidence summary reports first frontier
  `publication_ack_convergence`, owner `topology_publication_owner`, boundary
  `publication_convergence`, dominant witness reason `publication_published`,
  and causal dominant failure class `publication_ack_blocked`.
- The latest causal summary reports first critical path
  `topology:publication_ack_convergence`. `active_gate_snapshot_coverage` is now
  downstream, so this package closed as migrated rather than green.
- The latest artifact active-gate progress is not the CL-006 closure witness:
  expected node count `5`, active node count `3`, inactive node count `2`,
  snapshot coverage node count `2`, selected snapshot node
  `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, closure record `null`, and closure
  witness class `null`.
- File-scoped literal and decision-boundary guardrails passed across the selected
  bootstrap/publication/recovery owner paths: 62 files, 0 new literal violations,
  0 decision-boundary violations.
- The broad selected source runtime-grammar guard still reports inherited debt:
  5 runtime-grammar-contract violations in
  `src/control-plane/membership-publication-coordinator.js`.
- Exact changed harness runtime-grammar guard passed for
  `test/distributed/harness/cluster-segment-2.js` and
  `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`.
- Runtime implementation for the focused CL-006 fixture landed in commit
  `904829d6`. Package closure, handoff, successor, sprint archive,
  current-blocker, and model-ledger proof landed in focused closure commit
  `da027f3d`, which is the Commit And Push Ledger commit for this closed
  package tracker.

## Failure Migration / Contraction

- Current dominant blocker: `publication_ack_convergence`.
- Current semantic owner: `topology_publication_owner`.
- Current boundary: `publication_convergence`.
- Generated evidence block:
  `npm run work:package:evidence-block -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`.
- Latest active-gate downstream evidence: expected node count `5`, active node
  count `3`, inactive node count `2`, snapshot coverage node count `2`, selected
  snapshot node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, closure record `null`,
  closure witness class `null`, blockers `inactive_nodes=2` and
  `snapshot_coverage=2/5`.
- Owner explain command:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --explain publication_ack_convergence`.
- Successor package:
  `work/packages/done-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md`.

## Commit And Push Ledger

1. Focused package commit: `da027f3d`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Runtime implementation commit for the focused CL-006 fixture: `904829d6`;
   package closure and handoff proof commit: `da027f3d`.
