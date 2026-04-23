# Priority-Recovery Progress Consumer Cutover

## Why

Once the shared priority-recovery snapshot emits one explicit progress/handoff
contract, the remaining consumers need to stop reconstructing that meaning
locally.

Without this cutover:

1. runtime and observation surfaces may know who owns next progress
2. admin, harness, failure-bundle, and report surfaces may still fall back to
   broad labels such as `nodeAdmissionBlocked` or generic wait reasons
3. the system remains harder to discuss than it should be, even if the core
   owner path is already coherent

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Sequencing dependency:

1. [Priority-recovery progress handoff contract](./done-20260422-priority-recovery-progress-handoff-contract.md)

## In Scope

1. Cut readiness/admin/control-snapshot consumers over to the canonical
   `PriorityRecoveryProgressContract`.
2. Cut harness retained diagnostics, failure bundle, triage summary, and
   report-writer summaries over to that same contract.
3. Remove touched local summary labels that re-infer next-progress ownership
   from partial evidence.
4. Add regressions for the exact contradiction shape seen in the latest
   `node-join-under-load` run.
5. Use the shared contract during the deferred named harness rerun.

## Out Of Scope

1. New runtime scheduling logic beyond consuming the shared contract
2. A new reporting-only progress model
3. Unrelated harness decomposition or report layout redesign

## Invariants

1. Tail consumers may summarize the shared contract, but they must not invent
   a different owner/wait explanation.
2. The same run must not report one partition as admission-blocked in one
   surface and handoff-stalled in another unless the shared contract explicitly
   says so.
3. Missing information must stay explicit rather than collapsing to success,
   `null`, `[]`, or `0`.

## Hotspots

1. `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`
2. `src/admin/admin-control-snapshot.js`
3. `test/distributed/scenarios/node-join-under-load.js`
4. `test/distributed/harness/failure-bundle-segment-4.js`
5. `test/distributed/harness/failure-bundle-segment-5.js`
6. `test/distributed/harness/report-writer.js`
7. `test/distributed/harness/cluster-segment-7-class-4.js`

## Implementation Tasks

- [x] Add regression tests first for the current contradiction shape.
- [x] Route the touched consumers through the canonical progress contract.
- [x] Remove touched consumer-local owner/wait inference.
- [x] Re-run `node-join-under-load` once all active sprint implementation
      packages are complete via the later runtime-grammar confirmation pass.

## Execution Notes

1. Preserved priority-recovery partition witness progress fields through the
   retained `node-join-under-load` scenario diagnostics path in
   `test/distributed/scenarios/node-join-under-load.js`.
2. Added a shared report-side `priorityRecoveryProgressSummary` in
   `test/distributed/harness/report-writer.js` so scenario reports surface the
   same handoff contract as the runtime observation snapshot.
3. Cut failure-bundle dominant-reason selection and publication-convergence
   summaries over to the canonical partition witness contract in
   `test/distributed/harness/failure-bundle-segment-1.js`,
   `failure-bundle-segment-4.js`, and `failure-bundle-segment-5.js`.
4. Focused proof is green:
   - `npx tap test/admin/admin-control-snapshot.test.js`
   - `npx tap test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`
   - `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
5. The deferred scenario rerun was later executed in
   [Runtime-grammar pilot harness confirmation](./done-20260422-runtime-grammar-pilot-harness-confirmation.md),
   which confirmed the consumer cutover remained intact while the dominant
   blocker migrated to a narrower runtime seam.

## Validation

1. Focused admin/control-snapshot tests
2. Focused harness/failure-bundle/report-writer tests
3. Deferred `node-join-under-load` rerun after active implementation closure

## Done When

1. Admin, harness, and reporting surfaces consume one shared progress/handoff
   contract.
2. A single blocked partition can be discussed consistently across runtime,
   admin, and harness/report artifacts.
