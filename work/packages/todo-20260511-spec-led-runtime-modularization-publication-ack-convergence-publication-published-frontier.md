# Spec-Led Runtime Modularization Publication ACK Convergence Publication-Published Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_published",
  "currentState": "Fresh representative evidence migrated the first critical path from startup active-gate snapshot coverage to publication_ack_convergence. The topology witness is blocked with reason publication_published while the causal summary names publication_ack_blocked as the dominant failure class.",
  "nextAction": "Activate this package only after recording the formal fixes-required predecessor review and this separate tracker-evidence fix in the active package ledger, then freeze the publication owner fixture for the publication_published ACK-blocked witness.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "Focused publication-owner ACK convergence fixture for the publication_published witness",
    "Touched-file static guardrails selected by topology_publication_owner",
    "Representative rolling-restart rerun"
  ],
  "touchedFiles": [
    "src/control-plane/*publication*.js",
    "src/control-plane/publication-recovery-*.js",
    "src/control-plane/membership-publication-coordinator*.js",
    "test/control-plane/*publication*.test.js",
    "test/distributed/harness/*publication*.js",
    "test/distributed/harness/*active-gate*.js",
    "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "work/packages/todo-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md",
    "work/sprints/todo-2026-q2-spec-led-runtime-modularization-publication-ack-followup.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/cross-boundary-causal-edge",
    "escalationTriggers": [
      "focused fixture proves publication_published is diagnostics-only and not a publication owner runtime blocker",
      "proof requires reopening startup_active_gate_owner snapshot coverage instead of publication convergence",
      "proof requires diagnostics schema alias cleanup instead of publication owner work",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If topology publication ownership accounts for the publication_published ACK-blocked witness, publication_ack_convergence should reduce or migrate away from publication_ack_blocked without reopening startup active-gate snapshot coverage.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "expectedCausalModelChange": "The publication_ack_blocked critical path disappears, reduces, or migrates to a named downstream active-gate or readiness blocker; same-frontier without reduced publication evidence is contradictory.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Budget timeout cascade remains architecture-analysis debt and must not be hidden by relabeling publication ACK evidence.",
    "crossBoundaryReview": "Required before activation because the predecessor crosses startup active-gate ownership and publication ACK convergence."
  },
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md"
}
-->

## Why

The active-gate publication-lag package reduced the original CL-006 startup
publication lag fixture. The latest representative rerun is still non-green, but
it no longer carries CL-006 closure data; the first frontier moved to
`publication_ack_convergence` with owner
`topology_publication_owner / publication_convergence`.

## Scope Basis

Successor split from the active-gate publication-lag package after:
`test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Freeze the `publication_published` ACK-blocked witness from the latest report.
2. Trace the publication owner path that should explain or settle the blocked
   publication witness.
3. Keep startup active-gate snapshot coverage and workflow-progress repairs from
   regressing.
4. Rerun representative rolling-restart and either close the frontier or migrate
   the next canonical owner-boundary blocker.

## Out Of Scope

1. Reopening the completed active-gate CL-006 publication-lag reduction unless a
   focused fixture proves direct regression.
2. Active-gate report schema alias deletion.
3. Harness timeout increases, report relabeling, or analyzer changes that hide
   publication ACK evidence.
4. Pro or Enterprise work.

## Invariants

1. `publication_ack_convergence` remains owned by
   `topology_publication_owner / publication_convergence`.
2. Publication ACK debt must not be reclassified as startup active-gate coverage,
   readiness delay, or priority-recovery progress.
3. Active-gate snapshot coverage remains downstream while the publication
   frontier is first critical path.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: publication owner/runtime files, publication tests, direct
  publication/active-gate harness consumers, this package, and successor sprint
  handoff notes.
- Forbidden files: completed active-gate publication-lag package runtime code
  except regression tests if needed, diagnostics schema alias cleanup, Pro or
  Enterprise surfaces, unrelated package files.
- Frozen decisions: predecessor active-gate CL-006 publication-lag package is
  closed; the current residual is publication convergence, not direct startup
  active-gate snapshot coverage.
- Escalation triggers: focused fixture proves the selected witness is
  diagnostics-only; proof requires reopening startup active-gate snapshot
  coverage; proof requires schema alias deletion; runtime implementation would
  need Pro or Enterprise features.
- Focused proof: evidence summary, topology explain, causal-model output,
  focused publication owner fixture, touched-file guardrails, and representative
  rolling-restart rerun.

## Shared Boundary Contract

Semantic owner: `topology_publication_owner`.

Canonical contract shape / vocabulary: publication status, publication epoch,
pending ACK count, blocked publication node count, missing published active
count, publication frontier state, owner reasons, and publication convergence
outcome.

Allowed consumers: publication owner, active-gate diagnostics, failure bundle,
topology convergence analyzer, causal model, and sprint/package handoff notes.

Prohibited reinterpretations:

1. Do not treat publication ACK convergence as startup active-gate snapshot
   coverage.
2. Do not infer ACK convergence from readiness, elapsed time, cache visibility,
   or priority-recovery state outside the publication owner contract.
3. Do not use missing diagnostics fields, `null`, or `undefined` as publication
   convergence states.

Primary diagnostics / proof surfaces: generated owner evidence block, topology
owner explain output, focused publication ACK fixture, touched-file static
guardrails, causal-model output, and representative rolling-restart.

## Causal Governance

- Causal hypothesis: if topology publication ownership accounts for the
  `publication_published` ACK-blocked witness, the causal model should reduce or
  migrate away from `publication_ack_blocked` without reopening startup
  active-gate snapshot coverage.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`.
- Expected causal-model change: the `publication_ack_blocked` critical path
  disappears, reduces, or migrates to a named downstream active-gate/readiness
  blocker; same-frontier without reduced publication evidence is contradictory.
- Representative outcome: `pending-before-rerun`.
- Causal debt: budget timeout cascade remains architecture-analysis debt and
  must not be hidden by relabeling publication ACK evidence.
- Cross-boundary review: required before activation because the predecessor
  crosses startup active-gate ownership and publication ACK convergence. The
  formal predecessor review returned `fixes-required`; activation must record
  that review and the separate tracker-evidence fix before implementation.

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

## Activation Note

This package is intentionally `todo`. Before runtime implementation starts, move
it to `active` and record the formal `fixes-required` predecessor review plus
this separate tracker-evidence fix in the active package Subagent Sequencing
Ledger; an unrecorded informal review is not sufficient. Only then assign the
fresh implementation subagent under the current package sequencing policy.
