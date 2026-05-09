# Spec-Led Runtime Modularization Active Gate Snapshot Coverage Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Publication ACK convergence is satisfied in the reduced representative report, but startup active gate blocks on snapshot coverage 0/5 with active=4/5 and selected snapshot timeout evidence.",
  "nextAction": "Freeze the active-gate snapshot coverage fixture from the reduced report, rewrite the startup active-gate owner path so snapshot coverage timeout is explicit owner evidence, and either close the startup frontier or migrate the next owner-boundary blocker.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json --explain active_gate_snapshot_coverage",
    "Focused active-gate snapshot coverage fixture from the reduced representative report",
    "Focused startup/readiness and diagnostics tests selected by startup_active_gate_owner",
    "Touched-file static guardrails selected by startup_active_gate_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/control-plane/*readiness*.js",
    "src/control-plane/bootstrap-readiness-owner*.js",
    "test/control-plane/*readiness*.test.js",
    "test/distributed/harness/active-gate-contract.js",
    "test/distributed/harness/failure-bundle*.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/packages/active-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "snapshot coverage requires runtime active-gate or readiness behavior changes",
      "focused fixture exposes a different startup owner boundary",
      "representative proof still fails on active_gate_snapshot_coverage after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md"
}
-->

## Why

The publication ACK package moved rolling-restart off publication convergence:
`pendingAck=0`, `missingPublished=0`, and the publication edge is satisfied in
the topology analyzer. The fresh blocker is startup snapshot coverage:
`active_gate_snapshot_coverage` is blocked with `snapshot_coverage=0/5` and a
terminal snapshot timeout.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md`
after the reduced representative report:
`test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Freeze the active-gate snapshot coverage fixture from the reduced report.
2. Trace the startup active-gate owner path that decides snapshot coverage.
3. Delete or rewrite any branch that lets snapshot timeouts hide behind
   publication, readiness, or cache-presence evidence.
4. Keep diagnostics and harness consumers read-only and owner-bound.
5. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Publication ACK convergence; that is predecessor proof.
2. Active-gate report schema alias deletion.
3. Harness timeout increases, report relabeling, or fallback readiness paths.
4. Pro or Enterprise work.

## Invariants

1. `active_gate_snapshot_coverage` is owned by
   `startup_active_gate_owner / snapshot_coverage`.
2. Snapshot timeout and incomplete coverage must remain explicit owner
   evidence until the active gate emits a canonical satisfied outcome.
3. Publication readiness must not mask startup snapshot coverage debt.
4. Diagnostics may present the active-gate owner decision but must not recreate
   it from raw publication fields.

## Tactical Inspiration

1. Kubernetes readiness gates: startup condition debt remains visible until the
   owning condition is satisfied.
2. Controller reconcile loops: a timeout is an owner status transition, not a
   reason for consumers to guess from incidental cache state.
3. SRE incident diagnostics: the first fresh blocker carries a stable
   owner-bound evidence path and a reproducible fixture.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: snapshot coverage requires runtime active-gate or
  readiness behavior changes; focused fixture exposes a different startup owner
  boundary; representative proof still fails on
  `active_gate_snapshot_coverage` after owner fix.

## Shared Boundary Contract

Semantic owner: `startup_active_gate_owner`.

Canonical contract shape / vocabulary: active gate state, active gate ready
state, expected node count, snapshot coverage node count, snapshot coverage
completion, selected snapshot error, and owner reasons `active_gate_timed_out`
and `snapshot_coverage_incomplete`.

Allowed consumers: topology convergence analyzer, failure bundle, startup
readiness diagnostics, and sprint/package handoff notes.

Prohibited reinterpretations: do not treat snapshot coverage debt as
publication convergence, priority recovery progress, or generic readiness
failure. Do not add fallback snapshot classification outside the startup
active-gate owner.

Primary diagnostics / proof surfaces: active-gate snapshot coverage fixture,
topology convergence explain output, startup/readiness focused tests, static
guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `active_gate_snapshot_coverage`
- Current semantic owner: `startup_active_gate_owner`
- Current boundary: `snapshot_coverage`
- Frontier state: `blocked`
- Dominant reason: `active_gate_timed_out`
- Evidence path: `report.scenarios[0].publicationConvergence.activeGate.progress`
- Reasons: `active_gate_timed_out, snapshot_coverage_incomplete`
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json --explain active_gate_snapshot_coverage`

## Subagent Sequencing Ledger

- [x] Agent Socrates (019e0ca0-9175-7f62-8949-e054f7db9e0e) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md`; result fixes-required.
- [x] Agent Poincare (019e0ca3-2125-7fd3-b7e0-7cb8e0aaef71) fixed `work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md`.

## Detection / Analysis Tasks

- [x] Review the publication ACK package before implementation starts.
- [ ] Extract the smallest active-gate snapshot coverage fixture from the
      reduced report.
- [ ] Trace the startup active-gate owner path that should settle snapshot
      coverage.
- [ ] Identify any publication/readiness/cache branch that can mask snapshot
      coverage timeout.

## Implementation Tasks

- [ ] Add or update the focused startup active-gate snapshot coverage fixture.
- [ ] Rewrite the owner logic so snapshot coverage debt has one canonical
      decision path.
- [ ] Delete or guard superseded snapshot/readiness fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json --explain active_gate_snapshot_coverage`
3. Focused startup/readiness and diagnostics tests selected by
   `startup_active_gate_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json --fast-local --verbose`

## Done When

1. Active-gate snapshot coverage has one owner-bound decision path.
2. Focused startup/readiness and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
