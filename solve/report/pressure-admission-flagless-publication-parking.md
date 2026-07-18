# Solve report: pressure-admission-flagless-publication-parking

**Goal:** Bounded child of pressure-admission-flagless-defer-policy (scope split, publication-parking slice: control-plane node-state publication, membership reconcile contexts, bootstrap publication owner, admin snapshot reconcile). SEALED RESULT: node-state publication parking derives from the publication profile's work class via one deferOnPressure field computed in buildNodeStatePublicationProfile (background modes park under pressure, critical modes escalate - byte-identical to the retired per-mode allow map), every consumer (heartbeat write options, replica-dispatch retry scheduling, readiness capture, node-state publication owner) consults deferOnPressure, and the inert allowPressureDefer threading through membership reconcile contexts and publication mutation options is deleted.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T15-48-43-022Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- parent quest: pressure-admission-flagless-defer-policy

## Scope Pressure
- Changed files: 24
- Change bytes: 37685
- Owner areas: src/admin, src/bootstrap, src/control-plane, test/admin, test/control-plane
- Categories: runtime, test
- Action: split by owner area before the next attempt (24 files)
- Action: land or separate 5 owner areas: src/admin, src/bootstrap, src/control-plane, test/admin, test/control-plane
- Split plan:
  - test/control-plane: 11 file(s)
  - src/control-plane: 8 file(s)
  - test/admin: 3 file(s)
  - src/admin: 1 file(s)
  - src/bootstrap: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **pressure-admission-flagless-publication-parking-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **pressure-admission-flagless-publication-parking-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-50-03-680Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-50-03-680Z.report.json]
- **pressure-admission-flagless-publication-parking-main**: independent verification passed: full-tree adversarial verification APPROVED the flagless admission cutover including this slice with no refutations (verdict archived at solve/artifacts/pressure-admission-flagless-defer-policy/verifier-approval-2026-07-18.md; suites green, flags absent from all behavioral paths, consumer behavior flips reviewed) [subagent:flagless-admission-full-tree-verifier-2026-07-18]
- **pressure-admission-flagless-publication-parking-main**: independent verification passed (aggregate: this quest's single attempt is its entire cumulative change, covered by the full-tree adversarial verification archived at solve/artifacts/pressure-admission-flagless-defer-policy/verifier-approval-2026-07-18.md) [subagent:flagless-admission-full-tree-verifier-2026-07-18]
- **pressure-admission-flagless-publication-parking-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-56-52-152Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-56-52-152Z.report.json]
- **pressure-admission-flagless-publication-parking-main**: Live validation inherited from the parent cutover: full run-affinity-demo run 2026-07-18T16-43-20 with this slice applied passed schema bootstrap, 5-node formation, and production schema admission (state=quiescent), loaded 100k ratings and served the affinity service; terminal learned-affinity stall matches pre-existing clean-HEAD signatures (11-02-34, 11-19-30). Same-hour clean-HEAD control run failed formation, so the slice does not regress live formation. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T16-43-20-162Z.report.json]
- **pressure-admission-flagless-publication-parking-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-56-52-152Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-56-52-152Z.report.json]
- **pressure-admission-flagless-publication-parking-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json]
- **pressure-admission-flagless-publication-parking-main**: Ingested evidence from pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pressure-admission-flagless-defer-policy-2026-07-18T16-59-27-104Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T16:49:44.346Z | pressure-admission-flagless-publication-parking-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/pressure-admission-flagless-publication-parking/attempt-1.diff |
