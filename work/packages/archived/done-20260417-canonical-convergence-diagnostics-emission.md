# Canonical Convergence Diagnostics Emission

## Why

The recent distributed failures have been diagnosable only after manually
cross-reading report JSON, triage summaries, failure bundles, and raw node
logs. That is too expensive for a repeated owner-boundary problem.

Today the harness often emits symptoms:

1. `nodeSlotUnavailable`
2. `partition_growth_stalled`
3. `control_plane_write_unhealthy`
4. `would_exceed_target_replica_count`

without always emitting the full canonical state that produced those symptoms.

The system already owns useful snapshots for benchmark admission, partition
convergence, dispatch availability, and recovery completion. This package
exists to make reports and triage artifacts emit those owned snapshots
directly, so the artifacts stop forcing humans to reconstruct the same
distributed state from scattered hints.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Reuse canonical owner snapshots in report generation instead of rebuilding
   diagnostic summaries from fragmented counters.
2. Emit one structured convergence view in report JSON for the relevant
   distributed boundaries, including fields such as:
   - `replicaBearing`
   - `localReplicaVoterReady`
   - `leaderStable`
   - `admissionReady`
   - `dispatchContribution`
   - `blockerReasons`
   - `retryAfterMs`
3. Thread that structured state through:
   - report JSON
   - triage summary
   - failure bundle
4. Preserve compact histograms and summaries, but make them derived views over
   the canonical snapshot rather than the primary source.
5. Keep admin report consumers compatible or explicitly version the new fields
   where compatibility requires it.

## Out Of Scope

1. New diagnosis-only state that is not owned anywhere else.
2. Dashboard redesign or UI styling work.
3. Log-volume increases as a substitute for structured diagnostics.
4. Reclassification tweaks that do not reuse canonical owner snapshots.

## Invariants

1. Report artifacts must consume the same canonical state models that runtime
   and harness owners use.
2. Histograms, dominant reasons, and summaries remain derived from canonical
   records rather than becoming a second semantic owner.
3. Diagnostics must distinguish symptom labels from owned state.
4. Failure bundles must help humans answer “what state was owned?” before
   “what error text appeared?”

## Hotspots

1. `test/distributed/harness/report-writer.js`
2. `test/distributed/harness/failure-bundle.js`
3. `test/distributed/harness/playback-recorder.js`
4. `test/distributed/run.js`
5. `test/distributed/README.local.md`
6. `test/distributed/harness/__tests__/report-writer.test.js`
7. `test/distributed/harness/__tests__/report-writer.property.test.js`
8. `test/distributed/harness/__tests__/failure-bundle.test.js`
9. `test/distributed/harness/__tests__/playback-recorder.test.js`
10. `src/admin/admin-test-run-report.js`
11. `src/admin/admin-test-run-service.js`
12. `architecture/current-owner-maps.md`
13. `architecture.md`

## Analysis Tasks

- [x] Confirm the current report path still emits too many symptoms without the
  owned state that generated them.
- [x] Identify the existing owner snapshots that diagnostics should reuse
  instead of duplicating.
- [x] Identify the narrowest set of fields that would make recent failures
  self-explanatory.

## Implementation Tasks

- [x] Extend the report payload contract to include canonical convergence
  snapshot data for the relevant distributed boundaries.
- [x] Update triage summary and failure bundle generation to render those owned
  states directly.
- [x] Keep summary histograms and dominant-reason reporting derived from the
  structured snapshot.
- [x] Add focused regression coverage for report JSON, triage summaries, and
  failure bundles that must include canonical convergence details.
- [x] Update local distributed README guidance for interpreting the new fields.
- [x] Record the diagnostics owner-path update in owner and architecture docs.

## Progress Notes

1. Partitioning planner diagnostics now preserve canonical convergence
   evidence in the harness path itself:
   `localPrimaryNodeIds`, `routedSupportNodeIds`,
   `dispatchContributionHistogram`, `degradationStateHistogram`, and
   `convergenceEvaluations`.
2. Failure-bundle triage summaries and markdown now render those fields
   directly, so a blocked node stays visible as
   `state=replica_blocked, dispatch=local_blocked` instead of only showing a
   symptom label.
3. Report-writer coverage now asserts that canonical convergence diagnostics
   survive scenario entry normalization unchanged.

## Documentation Decision

1. `test/distributed/README.local.md` should explain how to read the canonical
   convergence fields in reports and failure bundles.
2. `architecture/current-owner-maps.md` should note that report generation is a
   consumer of owner snapshots rather than a semantic owner.
3. `architecture.md` should record the rule that diagnostics are derived views
   over canonical owner state.

## Validation

1. `node test/distributed/harness/__tests__/report-writer.test.js`
2. `node test/distributed/harness/__tests__/report-writer.property.test.js`
3. `node test/distributed/harness/__tests__/failure-bundle.test.js`
4. `node test/distributed/harness/__tests__/playback-recorder.test.js`
5. `node test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
6. Focused admin report-consumer coverage
7. One seven-node distributed rerun that produces the new artifacts

## Done When

1. Report JSON, triage summaries, and failure bundles expose canonical
   convergence state directly.
2. Dominant reasons and histograms become clearly derived summaries rather than
   the only available evidence.
3. Recent distributed failures can be understood from the artifacts without
   manual reconstruction from raw logs.
