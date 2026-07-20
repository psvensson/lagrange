# Solve report: movielens-ready-lease-witness-report-replay

**Goal:** A deterministic production-seam replay drives heartbeat publication failure through the canonical owner, CDC cache, snapshot owner, MovieLens admission gate, and final report, retaining the bounded ready-lease witness through retry and error projections without changing admission reasons or error identity.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-ready-lease-witness-report-replay-2026-07-20T19-02-39-304Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md
- parent quest: movielens-ready-lease-chronology-discriminator
- plan: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 5
- Change bytes: 20195
- Owner areas: examples, scripts/run-placement-affinity-scenarios.js, test/convergence, test/runtime
- Categories: other, test
- Action: land or separate 4 owner areas: examples, scripts/run-placement-affinity-scenarios.js, test/convergence, test/runtime
- Split plan:
  - test/runtime: 2 file(s)
  - examples: 1 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - test/convergence: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-ready-lease-witness-report-replay-main** [solved] rung 0, attempts 1, metric 2 -> 0

## Findings
- **movielens-ready-lease-witness-report-replay-main**: With the new guards and scenario registration applied to base 6c6a782a but the MovieLens projection reverted, only 1/3 files is green; current source preserves the witness through timeout and thrown-repair paths. (rules out: The already-verbatim final report serializer alone is sufficient, or the lossy preload projection retains the witness without its source change.) [worktree:6c6a782a-report-replay-red-on-revert]
- **movielens-ready-lease-witness-report-replay-main**: independent attempt and aggregate verification passed [subagent:root/verify_report_replay_child]
- **movielens-ready-lease-witness-report-replay-main**: independent canonical aggregate verification passed [subagent:root/verify_report_replay_child]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-20T19:02:40.272Z | movielens-ready-lease-witness-report-replay-main | observe | 2 -> 0 | progress | no_evidence |  | diff:solve/changes/movielens-ready-lease-witness-report-replay/attempt-1.diff |
