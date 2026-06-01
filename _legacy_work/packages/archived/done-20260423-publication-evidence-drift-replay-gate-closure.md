# Publication Evidence Drift Replay Gate Closure

## Why

The latest failed harness artifact reports durable publication metadata with
four blocked priority partitions, but replaying the captured final rows through
runtime publication derivation reports `steady_published`, satisfied priority
spread, and no blocked partitions.

That diagnosis should not require manual correlation across
`failure-bundle.json`, `snapshots.ndjson`, and final service rows. The existing
replay helper should expose an explicit drift classification so future failures
are routed to publication-owner evidence refresh instead of being misread as
missing operation scheduling.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Promote replay comparison into an explicit diagnostic classification.
2. Keep the replay path diagnostic-only and runtime-derivation-backed.
3. Add focused proof for stale durable summary versus satisfied replayed rows.
4. Add the latest artifact replay result to package progress notes.

## Out Of Scope

1. Changing harness pass/fail criteria.
2. Repairing runtime publication rows from the replay tool.
3. Replacing the membership-publication owner.

## Shared Boundary Contract

- Semantic owner:
  membership-publication derivation remains the source of truth for replayed
  publication priority spread.
- Canonical contract:
  replay output may classify durable-versus-replayed drift, but it must not
  create a second publication-planning grammar.
- Allowed consumers:
  local harness triage, work-package analysis, and focused replay tests.
- Prohibited reinterpretations:
  replay as runtime state, replay-only pass/fail rules, or harness-side repair
  of publication metadata.
- Primary proof:
  publication replay tests and one run against the latest failing artifact.

## Progress Grammar

1. `aligned` means durable and replayed summaries agree.
2. `durable_stale_replayed_satisfied` means durable metadata remains blocked
   while replayed runtime derivation is satisfied.
3. `replayed_blocked` means replayed derivation still proves blocked priority
   spread.
4. `changed` means durable and replayed summaries differ but not in a known
   terminal class.

## Hotspots

1. `test/distributed/harness/publication-evidence-replay.js`
2. `test/distributed/harness/__tests__/publication-evidence-replay.test.js`
3. `test-output/.playback/report/node-join-under-load`

## Detection / Analysis Tasks

- [x] Replay the latest failed artifact and confirm durable blocked versus
      replayed satisfied priority spread.
- [x] Confirm replay uses runtime derivation code.

## Implementation Tasks

- [x] Add explicit replay drift classification.
- [x] Add focused proof for the stale durable / replayed satisfied class.
- [x] Re-run replay against the latest artifact and record the result.

## Residual Closure Inventory

- [x] Replay output includes a named drift classification.
- [x] Focused replay proof covers the latest failure class.
- [x] Latest artifact replay result is recorded.

## Progress Notes

1. Added `driftClassification` to the replay comparison output.
2. Added the explicit class
   `durable_stale_replayed_satisfied` for durable blocked metadata with
   replayed runtime derivation satisfied.
3. Extended
   `test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   to assert the latest failure class.
4. Focused proof:
   `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`.
5. Latest artifact replay:
   `node test/distributed/harness/publication-evidence-replay.js test-output/.playback/report/node-join-under-load`.
6. Latest artifact classification:
   `durable_stale_replayed_satisfied`.
7. Latest artifact replay details:
   durable summary blocked `replica_operations-p1`,
   `sql_transaction_participants-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`; replayed runtime derivation reported
   `steady_published`, satisfied priority spread, and no blocked partitions.

## Validation

1. `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`
2. `node test/distributed/harness/publication-evidence-replay.js test-output/.playback/report/node-join-under-load`

## Done When

1. Future failed harness artifacts can be classified as durable/replayed
   publication drift without manual row inspection.
2. The replay tool remains diagnostic-only and derives its answer from runtime
   publication code.

## Closure Deep Dive

Reviewed the replay helper and focused test. The change only classifies an
existing replay comparison; it does not change runtime behavior, harness
pass/fail rules, or publication-planning policy.
