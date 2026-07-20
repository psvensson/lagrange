# Solve report: movielens-ready-lease-cdc-provenance

**Goal:** SystemTableCache exposes an accepted per-key CDC observation bound to the cached row origin HLC; causally older, backfill-only, authoritative, hydration, delete, and unrelated-key mutations cannot advance or impersonate that evidence.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-ready-lease-cdc-provenance-2026-07-20T18-45-27-266Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md
- parent quest: movielens-ready-lease-chronology-discriminator
- plan: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 7
- Change bytes: 15699
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/cache, src/message-group, test/cache
- Categories: other, runtime, test
- Action: land or separate 4 owner areas: scripts/run-placement-affinity-scenarios.js, src/cache, src/message-group, test/cache
- Split plan:
  - src/cache: 4 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/message-group: 1 file(s)
  - test/cache: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-ready-lease-cdc-provenance-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **movielens-ready-lease-cdc-provenance-main**: Bounded cache child preserves umbrella dead levers (rules out: Do not use the table-wide apply timestamp, envelope HLC, or stale/backfill notifications as per-key accepted CDC provenance.) [quest:movielens-ready-lease-chronology-discriminator]
- **movielens-ready-lease-cdc-provenance-main**: With only the cache guard and scenario registration applied to base 6fb95f9f, the child is 0/1 green; current source is 1/1 green for three consecutive runs. (rules out: The cache chronology cannot pass from test fixtures or existing table-wide observation state.) [worktree:6fb95f9f-cdc-red-on-revert]
- **movielens-ready-lease-cdc-provenance-main**: independent verification passed [subagent:root/verify_cdc_child]
- **movielens-ready-lease-cdc-provenance-main**: independent aggregate verification passed [subagent:root/verify_cdc_child]
- **movielens-ready-lease-cdc-provenance-main**: independent final aggregate verification passed after additive shared-runner registrations [subagent:root/verify_cdc_child]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-20T18:45:27.329Z | movielens-ready-lease-cdc-provenance-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/movielens-ready-lease-cdc-provenance/attempt-1.diff |
