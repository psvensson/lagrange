# Priority-Recovery Harness, Reporting, And Tail-Consumer Cutover

## Why

The latest `node-join-under-load` artifact exposes a contract mismatch on the
tail-consumer path.

In one recorded run:

1. detailed control-plane diagnostics show blocked priority partitions with
   real spread gaps
2. normalized report sections show `blockedPartitionCount: 0`,
   `closureWitnessClass: null`,
   `projectionDiagnostics: null`, and no progress classes
3. the scenario-specific retained diagnostics still narrow the shared
   control-plane snapshot before failure-bundle/report-writer consumers see it

That means the harness/reporting path is still reinterpreting a shared
boundary locally instead of consuming one canonical observation contract.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Sequencing dependencies:

1. [Priority-recovery completion and remove-safety under load closure](./done-20260421-priority-recovery-completion-and-remove-safety-under-load-closure.md)
2. [Priority-recovery observation contract and state grammar closure](./done-20260421-priority-recovery-observation-contract-and-state-grammar-closure.md)

## In Scope

1. Cut the touched scenario retained diagnostics, failure bundle, triage
   summary, report writer, and playback artifacts over to the canonical
   priority-recovery observation snapshot.
2. Remove touched scenario-local narrowing that drops shared observation
   fields before reporting surfaces consume them.
3. Preserve blocked partition counts, spread gaps, closure witnesses,
   projection diagnostics, invariant failures, and progress/blocker history
   across report JSON, failure-bundle markdown, triage markdown, and playback
   artifacts.
4. Add regression tests for the latest contradiction shape so the same run
   cannot produce incompatible summaries again.
5. Re-run `node-join-under-load` once the touched reporting surfaces consume
   the canonical snapshot.

## Out Of Scope

1. Runtime owner-path redesign beyond consuming the canonical observation
   contract
2. Admin/control-snapshot grammar redesign beyond the predecessor observation
   package
3. Unrelated harness decomposition, viewer redesign, or file-hygiene work
4. Broad scenario policy changes outside the touched priority-recovery
   reporting path

## Invariants

1. One recorded run must not publish conflicting blocked-partition counts or
   witness state across its report surfaces.
2. Tail consumers may summarize the canonical observation snapshot, but they
   must not reinterpret it locally.
3. Missing data must stay explicit `unknown` or `deferred`, not collapse to
   zero, empty, or passed.
4. Shared boundary contracts must not be narrowed to scenario-specific subsets
   on the touched path.

## Hotspots

1. `test/distributed/scenarios/node-join-under-load.js`
2. `test/distributed/harness/failure-bundle-segment-1.js`
3. `test/distributed/harness/failure-bundle-segment-4.js`
4. `test/distributed/harness/failure-bundle-segment-6.js`
5. `test/distributed/harness/report-writer.js`
6. `test/distributed/harness/report-writer-summary-methods.js`
7. `test/distributed/harness/failure-bundle.js`
8. `test/distributed/harness/cluster-segment-7.js`

## Shared Boundary Contract

- Semantic owner:
  the canonical `PriorityRecoveryObservationSnapshot` from the predecessor
  observation-contract package
- Canonical contract shape / vocabulary:
  harness/reporting surfaces consume
  `PriorityRecoveryObservationSnapshot` and
  `PriorityRecoveryPartitionSnapshot`
  without local narrowing; summary surfaces may derive
  `blockedPartitionCount`,
  `largestSpreadGap`,
  `dominantReason`, and
  `operator-facing summary`
  only from that snapshot plus load metrics through one shared mapping
- Allowed consumers:
  scenario retained diagnostics,
  cluster wait/error shaping,
  report writer,
  failure bundle,
  triage summary,
  playback artifacts,
  and bounded harness tests
- Prohibited reinterpretations:
  scenario-local copies that drop fields,
  recomputing blocked counts from partial subsets,
  defaulting missing fields to success/zero,
  or mixing load wait reasons into semantic recovery state without an explicit
  shared mapping
- Primary diagnostics / proof surfaces:
  failure-bundle tests,
  report-writer tests,
  playback test cases,
  node-join scenario tests,
  and the named `node-join-under-load` scenario rerun

## Detection / Analysis Tasks

- [x] Diff the latest `node-join-under-load` report sections and list every
      contradiction between detailed control-plane diagnostics and normalized
      summaries.
- [x] Trace where scenario retained diagnostics drop priority-recovery fields
      before failure-bundle/report-writer consumers receive them.
- [x] Identify where the touched report surfaces coerce `unknown` or
      `deferred` into `0`, `[]`, `null`, or `passed`.
- [x] Define one shared summary mapping from the canonical observation snapshot
      to operator-facing report text.

## Implementation Tasks

- [x] Add regression tests first for contradictory blocked-partition,
      witness, and projection output on the latest failure shape.
- [x] Cut `node-join-under-load` retained diagnostics over to the canonical
      observation snapshot instead of a bespoke subset.
- [x] Update failure-bundle, triage, report-writer, and playback surfaces to
      preserve the canonical priority-recovery fields.
- [x] Delete touched scenario-local narrowing helpers and zero/null fallback
      grammar.
- [x] Ensure operator-facing summaries surface closure witness,
      blocker history, per-partition blockers, and invariant failures when the
      canonical snapshot provides them.
- [x] Re-run `node-join-under-load` and record the repaired artifact set via
      the later runtime-grammar confirmation pass.

## Residual Closure Inventory

- [x] Scenario retained diagnostics use the canonical snapshot directly on the
      touched path.
- [x] Failure bundle, triage summary, report JSON, and playback artifacts
      agree on blocked-partition counts, witnesses, and semantic state.
- [x] Superseded zero/null/empty fallback grammar is deleted on the touched
      path.
- [x] The sprint-level scenario confirmation pass can rely on recorded results
      for this boundary instead of log archaeology.
- [x] Required proof layers are complete before closure.

## Execution Notes

1. Completed the tail-consumer cutover to the canonical priority-recovery
   observation snapshot across retained scenario diagnostics, cluster active
   wait shaping, failure bundle, triage, and report-writer outputs.
2. Restored the split cluster unit suite support with one shared test helper
   so the touched harness unit surfaces validate the canonical contract
   directly.
3. Focused non-harness proof is green:
   - `npx tap test/distributed/harness/__tests__/failure-bundle.test.js test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js test/distributed/harness/__tests__/report-writer.test.js test/distributed/harness/__tests__/report-writer.property.test.js`
   - `npx tap test/distributed/harness/__tests__/node-join-under-load-scenario.test.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/cluster.test-part-6.js test/distributed/harness/__tests__/cluster.test-part-7.js`
4. The named `node-join-under-load` scenario rerun was later executed in
   [Runtime-grammar pilot harness confirmation](./done-20260422-runtime-grammar-pilot-harness-confirmation.md),
   and the resulting artifact set preserved the repaired tail-consumer
   contract while exposing a narrower runtime blocker.

## Validation

1. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js test/distributed/harness/__tests__/report-writer.test.js test/distributed/harness/__tests__/report-writer.property.test.js`
2. `npx tap test/distributed/harness/__tests__/node-join-under-load-scenario.test.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/cluster.test-part-6.js test/distributed/harness/__tests__/cluster.test-part-7.js`
3. Named scenario evidence for `node-join-under-load`
4. `npm run test:metrics`

## Done When

1. The latest `node-join-under-load` report, failure bundle, triage summary,
   and playback artifacts no longer contradict each other on
   priority-recovery blockers.
2. Shared tail consumers consume one canonical observation snapshot without
   scenario-local narrowing.
3. The sprint-level scenario confirmation pass can diagnose this boundary from
   recorded artifacts instead of reconstructing it from logs.
