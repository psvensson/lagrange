# Solve report: movielens-preload-admission-gate-cutover

**Goal:** The MovieLens affinity demo makes production ratings load-lane admission its sole preload authority after typed snapshot observation. Unrelated nonblocking operations do not deny load; pressure, snapshot blindness, and ratings-specific failures do. The harness and demo share production classifiers, with no test imports or legacy raw-operation gate. Red-on-revert tests and one production-composed run prove the cutover engages before load.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-38-41-097Z.report.json

**Attempts:** 5

## Links
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 18
- Change bytes: 60794
- Owner areas: examples, scripts/run-placement-affinity-scenarios.js, src/admin, src/diagnostics, test/distributed/harness, test/runtime
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (18 files)
- Action: land or separate 6 owner areas: examples, scripts/run-placement-affinity-scenarios.js, src/admin, src/diagnostics, test/distributed/harness, test/runtime
- Split plan:
  - test/distributed/harness: 11 file(s)
  - examples: 2 file(s)
  - test/runtime: 2 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/admin: 1 file(s)
  - src/diagnostics: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **movielens-preload-admission-gate-cutover-main** [solved] rung 5, attempts 5, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **movielens-preload-admission-gate-cutover-main**: The linted clauses are one owner-boundary cutover, not independent frontiers: the preload gate consumes one typed snapshot plus one production ratings load-lane decision; moving the pure classifier/probe builder under src and deleting the raw loop are the dependency consolidation and old-path retirement required to make that single decision authoritative. [subagent:wave4_demo_gate_cutover_design]
- **movielens-preload-admission-gate-cutover-main**: Affected-boundary import audit passed: run-affinity-demo.js and affinity-demo-preload-gate.js import only production modules. Three pre-existing example-to-test imports remain in run-postgres-baseline.js and cluster-harness.js, which are separate PostgreSQL/Docker harness owners outside this Quest's bounded MovieLens preload-admission cutover and were not touched. [subagent:wave4_preload_gate_fix]
- **movielens-preload-admission-gate-cutover-main**: Ingested evidence from movielens-preload-admission-gate-cutover-2026-07-15T17-08-13-620Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-08-13-620Z.report.json]
- **movielens-preload-admission-gate-cutover-main**: Independent verification rejected attempt-2 because its exact artifact omitted untracked implementation files and its snapshot-observation fixture did not fail closed on missing or stale owner evidence [subagent:wave4_preload_gate_verify]
- **movielens-preload-admission-gate-cutover-main**: Ingested evidence from movielens-preload-admission-gate-cutover-2026-07-15T17-10-51-511Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-10-51-511Z.report.json]
- **movielens-preload-admission-gate-cutover-main**: Independent verification rejected attempt-3: behavior and artifact completeness passed, but moving the classifier into production exposed seven new literal/decision-boundary violations that must be removed before checkpoint [subagent:wave4_preload_gate_verify]
- **movielens-preload-admission-gate-cutover-main**: Ingested evidence from movielens-preload-admission-gate-cutover-2026-07-15T17-20-06-477Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-20-06-477Z.report.json]
- **movielens-preload-admission-gate-cutover-main**: Independent verification rejected attempt-4 because the cache observation was correctly removed from decision authority but also disappeared from the stalled-error diagnostic tail consumer; the replacement must preserve it as diagnostic-only and correct the probe JSDoc [subagent:wave4_preload_gate_verify]
- **movielens-preload-admission-gate-cutover-main**: Ingested evidence from movielens-preload-admission-gate-cutover-2026-07-15T17-28-27-892Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-28-27-892Z.report.json]
- **movielens-preload-admission-gate-cutover-main**: Independent verification rejected attempt-5 because its diagnostic-only cache projection regression used a cache count aliased to the one in-flight row; the replacement must prove an uncapped diagnostic value of 3 while additional discount remains 0 and effective in-flight remains blocked [subagent:wave4_preload_gate_verify]
- **movielens-preload-admission-gate-cutover-main**: Ingested evidence from movielens-preload-admission-gate-cutover-2026-07-15T17-34-03-298Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-34-03-298Z.report.json]

## Theories
- **theory-20260715-preload-owner-authority-and-diagnostics-separation** [active] system, mechanism decision_authority_and_diagnostic_projection_were_implicitly_coupled_in_test_owned_classifier, owner control_plane_quiescence_owner, modelGate npm run model:contracts
- **theory-20260715-production-quiescence-classifier-explicit-boundary** [falsified] frontier, frontier movielens-preload-admission-gate-cutover-main, layer ownership, mechanism production_extraction_exposed_test_only_implicit_decision_contracts, owner control_plane_quiescence_owner, boundary preload_snapshot_classification, modelGate npm run model:contracts

## Selected Theories
- **movielens-preload-admission-gate-cutover-main**: theory-20260715-production-quiescence-classifier-explicit-boundary

## Theory Results
- **theory-20260715-production-quiescence-classifier-explicit-boundary**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-21-43-846Z.report.json]
- **theory-20260715-production-quiescence-classifier-explicit-boundary**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-28-27-892Z.report.json]
- **theory-20260715-production-quiescence-classifier-explicit-boundary**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-31-46-226Z.report.json]
- **theory-20260715-production-quiescence-classifier-explicit-boundary**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-34-03-298Z.report.json]
- **theory-20260715-production-quiescence-classifier-explicit-boundary**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/movielens-preload-admission-gate-cutover-2026-07-15T17-38-41-097Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T17:03:59.444Z | movielens-preload-admission-gate-cutover-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/movielens-preload-admission-gate-cutover/attempt-2.diff.json |
| 2026-07-15T17:11:07.766Z | movielens-preload-admission-gate-cutover-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/movielens-preload-admission-gate-cutover/attempt-3.diff.json |
| 2026-07-15T17:21:43.955Z | movielens-preload-admission-gate-cutover-main | widen-scope | 0 -> 0 | flat | solved | theory-20260715-production-quiescence-classifier-explicit-boundary | diff:solve/changes/movielens-preload-admission-gate-cutover/attempt-4.diff.json |
| 2026-07-15T17:32:44.144Z | movielens-preload-admission-gate-cutover-main | model | 0 -> 0 | flat | solved | theory-20260715-production-quiescence-classifier-explicit-boundary | diff:solve/changes/movielens-preload-admission-gate-cutover/attempt-5.diff.json |
| 2026-07-15T17:38:41.319Z | movielens-preload-admission-gate-cutover-main | change-approach | 0 -> 0 | flat | solved | theory-20260715-production-quiescence-classifier-explicit-boundary | diff:solve/changes/movielens-preload-admission-gate-cutover/attempt-6.diff.json |
