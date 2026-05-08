# Harness Replay Publication Evidence Tooling

## Why

The latest failure required manual correlation across `failure-bundle.json`,
`triage-summary.md`, `snapshots.ndjson`, and node logs to see that final
service rows had advanced beyond the stale publication priority summary.

That manual step slows analysis and increases the chance of fixing the wrong
layer. A small replay probe should recompute the publication-planning priority
summary from harness artifacts using the same derivation code as runtime.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Add a bounded local diagnostic script or test helper that loads a harness
   report directory.
2. Recompute membership publication priority spread from the latest available
   snapshot rows using runtime derivation code.
3. Print a compact comparison between durable publication summary and replayed
   summary.
4. Keep the tool diagnostic-only; it must not change runtime behavior.

## Out Of Scope

1. New harness pass/fail criteria.
2. Replacing failure-bundle generation.
3. Operator-facing documentation.

## Shared Boundary Contract

- Semantic owner:
  runtime membership publication derivation remains the source of truth.
- Canonical contract:
  replay tooling may recompute existing runtime derivation from captured
  artifacts, but must not invent a second publication-planning algorithm.
- Allowed consumers:
  local development, focused failure triage, and future package analysis.
- Prohibited reinterpretations:
  replay output as runtime state, replay-only summary logic, or harness pass
  criteria that bypass the runtime publication owner.
- Primary proof:
  a focused replay/helper test or a no-op run against the current artifact
  shape.

## Hotspots

1. `test/distributed/harness`
2. `test-output/.playback/report/node-join-under-load`
3. `src/control-plane/membership-publication-coordinator.js`
4. `src/control-plane/membership-publication-planning.js`

## Detection / Analysis Tasks

- [x] Identify the stable artifact rows needed to replay publication priority
      spread.
- [x] Confirm the replay can use runtime derivation code rather than a copied
      algorithm.

## Implementation Tasks

- [x] Add the bounded replay helper or script.
- [x] Add focused proof for the artifact shape if practical.
- [x] Use the tool to summarize the latest failure artifact after package
      implementation, without rerunning the harness.

## Residual Closure Inventory

- [x] Tooling consumes runtime derivation code.
- [x] Tooling stays diagnostic-only.
- [x] Latest failure artifacts can be summarized without manual NDJSON
      parsing.

## Progress Notes

1. Added `test/distributed/harness/publication-evidence-replay.js`.
2. The replay adapter loads `failure-bundle.json` and the latest
   `snapshots.ndjson` record, then calls runtime
   `deriveMembershipPublicationCandidate(...)`.
3. Added artifact-shape proof in
   `test/distributed/harness/__tests__/publication-evidence-replay.test.js`.
4. Focused proof run:
   `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`.
5. Existing failed artifact replay:
   `node test/distributed/harness/publication-evidence-replay.js test-output/.playback/report/node-join-under-load`.
6. Replay result moved the captured-row blocker from
   `control_plane_publications-p1`, `replica_operations-p1`, and
   `sql_transactions-p1` to only `sql_transactions-p1`, proving the tool can
   identify stale durable publication spread summaries without rerunning the
   harness.
7. Replay now reads captured priority recovery decision snapshots from the
   failure bundle and emits closure-witness fields:
   `closureWitnessState`, `closureRecordId`, `closureWitnessClass`, and
   `closureWitnessClassification`.
8. The latest April 23 representative artifact shows publication gate
   readiness `true` with zero blocked and unresolved priority partitions, so
   replay confirms the remaining failure is no longer a stale durable
   publication spread diagnosis.

## Validation

1. Focused helper/script proof if added.
2. `npm run test:metrics`
3. Sprint-level representative harness rerun after all work packages are
   implemented.

## Done When

1. A future failed harness run can be replayed quickly enough to compare
   durable publication metadata with runtime-derived priority spread.
2. The replay path does not create another runtime grammar or harness
   exception.
