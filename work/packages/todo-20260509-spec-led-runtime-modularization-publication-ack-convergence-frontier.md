# Spec-Led Runtime Modularization Publication ACK Convergence Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Representative rolling-restart moved off legacy deletion and now stops at publication_ack_convergence: publication epoch 4 is ACK_PENDING with pendingAckCount=1 and missingPublishedCount=3.",
  "nextAction": "Build a focused publication-owner ACK convergence fixture from the final report, prove ACK debt cannot remain hidden behind readiness/startup evidence, and either close ACK convergence or migrate to the next owner frontier.",
  "proof": [
    "Focused publication owner ACK convergence fixture from the representative report",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --explain publication_ack_convergence",
    "node --test test/control-plane/*publication*.test.js test/distributed/harness/__tests__/failure-bundle.test.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js",
    "Touched-file static guardrails selected by topology_publication_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/control-plane/*publication*.js",
    "src/control-plane/publication-recovery-*.js",
    "src/control-plane/membership-publication-coordinator*.js",
    "test/control-plane/*publication*.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/failure-bundle*.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "publication ACK convergence requires runtime owner behavior changes",
      "focused fixture exposes a different topology owner boundary",
      "representative proof still fails on publication_ack_convergence after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md"
}
-->

## Why

Legacy deletion proof moved the representative rolling-restart failure to a
fresh owner frontier instead of hiding it. The current blocker is no longer
runtime compatibility deletion. It is publication ACK convergence: one active
node remains pending acknowledgement while three active nodes are missing from
the published active set.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md`
after the final representative report:
`test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Freeze the publication-owner ACK convergence contract from the final report.
2. Build the smallest focused fixture that reproduces `pending_acks_present`.
3. Remove or rewrite any old publication ACK branch that lets ACK debt hide
   behind readiness, startup, cache visibility, or missing-publication evidence.
4. Keep diagnostics and harness consumers read-only and owner-bound.
5. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Active-gate report schema alias deletion.
2. New publication features or operator controls.
3. Harness timeout increases, report relabeling, or fallback ACK paths.
4. Pro or Enterprise work.

## Invariants

1. `publication_ack_convergence` remains owned by
   `topology_publication_owner / publication_convergence`.
2. ACK debt is decided from canonical publication evidence, not raw readiness
   or startup symptoms.
3. Pending acknowledgements must stay visible as `pending_acks_present` until
   the owner emits the canonical satisfied outcome.
4. Missing-published evidence may defer or explain, but it must not supersede
   pending ACK debt.

## Tactical Inspiration

1. Kubernetes controller status conditions: observed generation and ACK debt
   are reconciled by the owning controller, then exposed as stable conditions.
2. KRaft metadata propagation: publication epochs must not be considered
   globally visible until acknowledgement debt is settled.
3. etcd watch progress notifications: freshness fences are explicit owner
   evidence, not inferred from incidental cache reads.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: publication ACK convergence requires runtime owner
  behavior changes; focused fixture exposes a different topology owner
  boundary; representative proof still fails on `publication_ack_convergence`
  after owner fix.

## Shared Boundary Contract

Semantic owner: `topology_publication_owner`.

Canonical contract shape / vocabulary: publication epoch, publication status,
pending ACK count, blocked publication node count, missing published active
count, recovery protocol state, and owner reasons
`publication_pending` and `pending_acks_present`.

Allowed consumers: topology convergence analyzer, failure bundle, active-gate
diagnostics, and sprint/package handoff notes.

Prohibited reinterpretations: do not treat ACK debt as readiness delay, startup
progress, cache freshness, or priority-recovery state. Do not add fallback ACK
classification outside the publication owner.

Primary diagnostics / proof surfaces: focused publication tests, topology
convergence explain output, failure-bundle owner evidence, static guardrails,
and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `publication_ack_convergence`
- Current semantic owner: `topology_publication_owner`
- Current boundary: `publication_convergence`
- Frontier state: `blocked`
- Dominant reason: `pending_acks_present`
- Evidence path: `report.scenarios[0].publicationConvergence`
- Reasons: `publication_pending, pending_acks_present`
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --explain publication_ack_convergence`

## Detection / Analysis Tasks

- [ ] Review the legacy deletion package before implementation starts.
- [ ] Extract the smallest publication ACK fixture from the final report.
- [ ] Trace the publication owner path that should settle ACK debt.
- [ ] Identify any readiness/startup/cache branch that can mask ACK debt.

## Implementation Tasks

- [ ] Add or update the focused publication-owner ACK convergence fixture.
- [ ] Rewrite the owner logic so ACK debt has one canonical decision path.
- [ ] Delete or guard superseded ACK fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --explain publication_ack_convergence`
3. `node --test test/control-plane/*publication*.test.js test/distributed/harness/__tests__/failure-bundle.test.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js`
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json --fast-local --verbose`

## Done When

1. Publication ACK convergence has one owner-bound decision path.
2. Focused publication and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
