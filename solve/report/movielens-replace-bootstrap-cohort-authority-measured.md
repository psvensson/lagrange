# Solve report: movielens-replace-bootstrap-cohort-authority-measured

**Goal:** An explicit REPLACE bootstrap cohort persisted by the placement owner is consumed as a closed-world membership snapshot at the target replica, so stale local or hydrated service rows cannot add retired voters, while fresh bootstrap, ADD topology, retryable missing-topology behavior, voter safety, and the production five-node MovieLens milestone remain intact.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-replace-bootstrap-cohort-authority-2026-07-16T07-56-23-784Z.report.json

**Attempts:** 1

## Links
- spec: solve/changes/movielens-three-way-affinity-demo/handoff-2026-07-15-wave4-live-preload-topology-gap.md
- parent quest: movielens-priority-surrogate-single-owner-arbitration

## Scope Pressure
- Changed files: 3
- Change bytes: 8710
- Owner areas: scripts/run-movielens-replace-bootstrap-cohort-authority-scenarios.js, src/node, test/node
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-movielens-replace-bootstrap-cohort-authority-scenarios.js, src/node, test/node
- Split plan:
  - scripts/run-movielens-replace-bootstrap-cohort-authority-scenarios.js: 1 file(s)
  - src/node: 1 file(s)
  - test/node: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-replace-bootstrap-cohort-authority-measured-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **movielens-replace-bootstrap-cohort-authority-measured-main**: Ingested evidence from movielens-replace-bootstrap-cohort-authority-2026-07-16T07-56-23-784Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-replace-bootstrap-cohort-authority-2026-07-16T07-56-23-784Z.report.json]
- **movielens-replace-bootstrap-cohort-authority-measured-main**: Independent verification approved the exact closed-world REPLACE cohort patch: base red 239/242 and guard 0/311; patch green 242/242 and three times 311/311; placement persistence and dispatch remain canonical, target cache/hydration cannot add excluded voters, ADD and no-hint paths remain unchanged; adjacent topology, cache, owner-bypass, and voter-surplus suites pass; four replace-workflow canonical-ID failures are identical on base and patch. [subagent:verify_replace_cohort_attempt2]
- **movielens-replace-bootstrap-cohort-authority-measured-main**: Aggregate independent verification approved the complete exact source delta and terminal evidence: base-red/patch-green owner counterexample, three consecutive deterministic scenario passes, adjacent owner/topology/replay safety, static gates, and unchanged pre-existing replacement-workflow failures. [subagent:verify_replace_cohort_attempt2]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T07:56:23.844Z | movielens-replace-bootstrap-cohort-authority-measured-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/movielens-replace-bootstrap-cohort-authority-measured/attempt-1.diff |
