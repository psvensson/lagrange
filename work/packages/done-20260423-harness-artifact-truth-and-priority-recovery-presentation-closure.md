# Harness Artifact Truth And Priority-Recovery Presentation Closure

## Why

The current harness/report pipeline can preserve stale failure-only artifacts
after a later passing rerun.

At the same time, priority-recovery presentation consumers still contain local
semantic fallback logic that can reconstruct meaning instead of consuming the
decision-layer answer directly.

Those are matrix-readiness problems, not just cosmetic issues:

1. the repo’s own ladder requires reading `triage-summary.*` before raw logs
2. stale failure bundles can therefore override fresh truth in human triage
3. presentation-local semantic inference weakens the runtime grammar boundary
   exactly where operators and harness diagnostics read it

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Matrix readiness core grammar hardening sprint](../sprints/archived/done-2026-q2-matrix-readiness-core-grammar-hardening.md)

## In Scope

1. Ensure scenario-local and run-level failure-bundle artifacts cannot preserve
   stale failure truth after a later pass.
2. Make touched priority-recovery presentation consumers consume explicit
   semantic state instead of silently rebuilding it from lower-layer evidence.
3. Update focused harness and control-plane tests to lock the new behavior.
4. Update the owner map if the presentation/decision contract becomes
   materially sharper.

## Out Of Scope

1. Broad report-format redesign.
2. New priority-recovery vocabulary outside the touched shared contract.
3. Startup/join/rebalancer middle-layer refactors outside the touched
   presentation and artifact boundary.

## Invariants

1. Fresh authoritative report output is the primary truth for the current run.
2. Presentation consumers may summarize decision-layer output but must not
   invent new runtime meaning.
3. Failure artifacts remain available for failing runs with the existing file
   names and general shape.

## Hotspots

1. `test/distributed/harness/failure-bundle-segment-7.js`
2. `test/distributed/harness/failure-bundle-segment-1.js`
3. `test/distributed/harness/cluster-segment-2.js`
4. `src/control-plane/priority-recovery-observation-snapshot.js`
5. `test/distributed/harness/__tests__/failure-bundle.test.js`
6. `test/control-plane/priority-recovery-snapshot.test.js`
7. `architecture/current-owner-maps.md`

## Shared Boundary Contract

- Semantic owner:
  `PriorityRecoveryDecisionSnapshot` and the current run report output
- Canonical contract shape / vocabulary:
  passing runs must not leave stale scenario/run failure-bundle artifacts in
  place, and touched presentation consumers must read explicit
  `semanticState` / `semanticStateId` from the decision-layer snapshot rather
  than reconstructing semantic meaning locally; bounded semantic-state
  inference is allowed only when normalizing legacy retained artifacts that
  predate the decision-layer semantic-state contract
- Allowed consumers:
  failure-bundle writers, triage summaries, observation snapshots, harness
  diagnostics, admin/report consumers
- Prohibited reinterpretations:
  stale failure artifacts surviving as current truth, or presentation-local
  semantic-state inference substituting for the decision layer
- Primary diagnostics / proof surfaces:
  failure-bundle tests, observation-snapshot tests, and one representative
  harness rerun

## Detection / Analysis Tasks

- [x] Confirm exactly how stale scenario/run failure artifacts survive a later
      pass today.
- [x] Inventory touched presentation-local semantic-state fallbacks.
- [x] Record the post-fix authority order for report, failure-bundle, and
      triage outputs.

## Implementation Tasks

- [x] Add failing proof for pass-after-fail artifact truth.
- [x] Remove stale failure artifacts or replace them with current pass truth on
      the touched writer path.
- [x] Tighten touched presentation consumers so semantic-state reading is
      explicit and bounded.
- [x] Update the owner map if the presentation contract is materially sharper.

## Residual Closure Inventory

- [x] Scenario-local and run-level artifact truth matches the current run
      result.
- [x] Touched presentation consumers stop silently inventing semantic state.
- [x] Harness/report/admin consumers still receive the required diagnostics
      vocabulary from the shared decision path.
- [x] Required focused proof and representative harness proof are complete.

## Execution Summary

Implemented:

1. stale scenario-local and run-level failure artifacts are deleted on passing
   reruns
2. observation/report readers now consume the explicit decision-layer
   semantic-state contract and only allow bounded legacy inference when the
   contract is absent
3. owner-map documentation now records the sharper observation/presentation
   contract

Representative harness confirmation was completed at sprint level.
`node-join-under-load` no longer failed on stale-artifact or presentation-local
semantic drift; it exposed a new leader-identity divergence that is split to
[Publication-scoped consistency and node-join closure](./active-20260423-publication-scoped-consistency-and-node-join-closure.md).

## Validation

1. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
2. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
   result: new blocker split to follow-on package; no regression in this
   package scope
4. `npm run test:metrics`

## Done When

1. Passing reruns cannot leave stale failure bundles or triage summaries behind
   as current truth.
2. Touched presentation consumers rely on explicit semantic state from the
   decision layer rather than local inference.
3. Focused tests and the representative harness scenario pass.
