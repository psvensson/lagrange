# Spec-Led Runtime Modularization Publication ACK Convergence Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Focused publication owner fixtures close unchanged recovery-eligible ACK debt through canonical owner planning. Representative rerun reduced pendingAck to 0, missingPublished to 0, and the analyzer now moves the first frontier to active_gate_snapshot_coverage.",
  "nextAction": "Migrate this package to the active-gate snapshot coverage successor and keep active-gate report schema alias cleanup separate.",
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
    "work/packages/active-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md"
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
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md"
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

- [x] Review the legacy deletion package before implementation starts.
- [x] Extract the smallest publication ACK fixture from the final report.
- [x] Trace the publication owner path that should settle ACK debt.
- [x] Identify any readiness/startup/cache branch that can mask ACK debt.

## Implementation Tasks

- [x] Add or update the focused publication-owner ACK convergence fixture.
- [x] Rewrite the owner logic so ACK debt has one canonical decision path.
- [x] Delete or guard superseded ACK fallback branches.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
- [x] Rerun representative rolling-restart and migrate any fresh frontier.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Hooke (`019e0c7a-0e49-7950-a5a9-09d558144d07`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Epicurus (`019e0c7c-87d6-7de1-ac7b-ca448c0741d5`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md`.
- [x] Implementation subagent recorded:
      Agent Mencius (`019e0c84-3d22-76c3-bea0-cfe3ee0ba0b4`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-publication-ack-convergence-frontier.md`.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --explain publication_ack_convergence`
3. `node --test test/control-plane/*publication*.test.js test/distributed/harness/__tests__/failure-bundle.test.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js`
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json --fast-local --verbose`

## Validation Notes

- `npm run work:validate` passed: Work tracker validation OK for 25 files.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json --explain publication_ack_convergence`
  passed. The explain output now preserves `pendingAckNodeIds`,
  `publishedActiveNodeIds`, and `missingPublishedNodeIds`; the owner decision
  table ranks pending ACK debt before missing-published evidence.
- `node --test test/control-plane/membership-publication-coordinator.test.js`
  passed after adding the unchanged recovery-eligible ACK closure fixture.
- `node --test test/control-plane/*publication*.test.js test/distributed/harness/__tests__/failure-bundle.test.js test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js`
  passed after review-finding repair: 613 tests, 613 pass, 0 skipped.
  The three Task 27 publication interleaving property tests now emit explicit
  tap pass assertions after their fast-check properties complete.
- `node scripts/check-guideline-literals.js src/control-plane/*publication*.js src/control-plane/publication-recovery-*.js src/control-plane/membership-publication-coordinator*.js src/diagnostics/topology-convergence-graph.js`
  passed: 19 files, 0 new literal violations.
- `node scripts/check-guideline-decision-boundaries.js src/control-plane/*publication*.js src/control-plane/publication-recovery-*.js src/control-plane/membership-publication-coordinator*.js src/diagnostics/topology-convergence-graph.js`
  passed: 19 files, 0 decision-boundary violations.
- `npm run audit:runtime-grammar:file -- src/control-plane/*publication*.js src/control-plane/publication-recovery-*.js src/control-plane/membership-publication-coordinator*.js src/diagnostics/topology-convergence-graph.js`
  failed on inherited baseline only: 5 runtime-grammar-contract violations in
  `src/control-plane/membership-publication-coordinator.js`.
- Exact changed production runtime-grammar guard passed:
  `npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-planning.js src/diagnostics/topology-convergence-graph.js`.
- Exact changed production literal and decision-boundary guards passed:
  `node scripts/check-guideline-literals.js src/control-plane/membership-publication-planning.js src/diagnostics/topology-convergence-graph.js`
  and
  `node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-planning.js src/diagnostics/topology-convergence-graph.js`.
- First representative rerun after diagnostics/planning fixture work still
  failed at `publication_ack_convergence`: `ACK_PENDING`, `pendingAck=1`,
  `missingPublished=3`.
- Second representative rerun after canonical ACK carry fix:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json --fast-local --verbose`
  failed overall, but moved off ACK debt in the scenario error:
  `publicationConvergence=ready`, `pendingAck=0`, `missingPublished=0`,
  active progress `4/5`, snapshot coverage `0/5`.
- Parent review fixed the reduced-report analyzer handoff so
  `publicationStatus=UNKNOWN` with no pending publication evidence, no ACK
  debt, and no missing-published debt no longer keeps
  `publication_ack_convergence` blocked.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-ack.report.json`
  now reports first frontier `active_gate_snapshot_coverage`, owner
  `startup_active_gate_owner`, boundary `snapshot_coverage`, and dominant
  reason `active_gate_timed_out`.
- Successor package opened:
  `work/packages/active-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md`.
  Active-gate report schema alias cleanup remains out of scope for this
  package.

## Commit And Push Ledger

1. Focused package commit: `b8f0161f`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Done When

1. Publication ACK convergence has one owner-bound decision path.
2. Focused publication and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
