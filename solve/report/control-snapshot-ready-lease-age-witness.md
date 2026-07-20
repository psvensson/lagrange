# Solve report: control-snapshot-ready-lease-age-witness

**Goal:** AdminControlSnapshot emits a versioned ready-lease chronology witness from the exact existing first stale active-node scan, correlating signed heartbeat, lease, owner-HLC, and accepted per-key CDC ages while leaving freshness, repair, and reason outcomes unchanged.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/control-snapshot-ready-lease-age-witness-2026-07-20T18-55-17-824Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md
- parent quest: movielens-ready-lease-chronology-discriminator
- plan: solve/epics/formation-complexity-consolidation.md

## Scope Pressure
- Changed files: 4
- Change bytes: 19280
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/admin, test/admin
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: scripts/run-placement-affinity-scenarios.js, src/admin, test/admin
- Split plan:
  - src/admin: 2 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - test/admin: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **control-snapshot-ready-lease-age-witness-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **control-snapshot-ready-lease-age-witness-main**: With only the snapshot guard and scenario registration applied to base d583fca3, the child is 0/1 green; current source emits the bounded witness without changing decisions. (rules out: The existing snapshot already exposed the chronology witness or the guard could pass without the two admin source changes.) [worktree:d583fca3-snapshot-witness-red-on-revert]
- **control-snapshot-ready-lease-age-witness-main**: independent attempt and aggregate verification passed [subagent:root/verify_snapshot_child]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-20T18:55:18.817Z | control-snapshot-ready-lease-age-witness-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/control-snapshot-ready-lease-age-witness/attempt-1.diff |
